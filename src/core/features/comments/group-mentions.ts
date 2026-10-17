import seed from '../../../../seed.json';
import type { FeatureContext } from '../../app/feature-context';
import { ApiProblem } from '../../app/problems';
import { mutationGuard } from '../../app/operations';
import { currentSubject, requirePageLevel, requireContainerAdministration } from '../sharing/current-access';
import { configurationHistory, configurationStatements } from '../workspace/configuration-history';
import { commitOperation } from '../../app/operations';
import { requireWorkspaceOwner } from '../sharing/current-access';
import { notificationStatements } from '../notifications/events';
import { pageReadableSql } from '../notifications/creation-access';
import { mentionIds } from './content';

export function groupMentionIds(value: unknown): string[] {
  const ids = new Set<string>();
  function walk(item: unknown) {
    if (Array.isArray(item)) item.forEach(walk);
    else if (item && typeof item === 'object') {
      const object = item as Record<string, any>;
      if (object.mention?.kind === 'group' && typeof object.mention.id === 'string') ids.add(object.mention.id);
      Object.values(object).forEach(walk);
    }
  }
  walk(value);
  return [...ids];
}

export async function mentionConfiguration(ctx: FeatureContext) {
  await currentSubject(ctx);
  const row = await configurationHistory<{ restrictLargeGroups: boolean }>(ctx, 'mention-configuration');
  return { restrictLargeGroups: row?.value.restrictLargeGroups ?? true, revisionId: row?.revisionId ?? null, sizeLimit: seed.limits.groupMentionSize };
}
export async function setMentionConfiguration(ctx: FeatureContext, input: { operationKey: string; expectedRevisionId: string | null; restrictLargeGroups: boolean }) {
  return commitOperation(ctx, { operationKey: input.operationKey, action: 'mentions.configure', request: input, authorize: () => requireWorkspaceOwner(ctx), prepare: async ({ revisionId }) => ({
    entity: { id: ctx.actor.workspaceId, kind: 'workspace', revisionId }, value: { revisionId },
    statements: await configurationStatements(ctx, 'mention-configuration', revisionId, input.expectedRevisionId, { restrictLargeGroups: input.restrictLargeGroups }),
  }) });
}

async function groups(ctx: FeatureContext) {
  return (await ctx.db.prepare(`SELECT g.id,g.name,COUNT(m.id) AS size FROM groups g LEFT JOIN group_members gm ON gm.group_id=g.id
    LEFT JOIN members m ON m.id=gm.member_id AND m.workspace_id=g.workspace_id AND m.status='active'
    WHERE g.workspace_id=? GROUP BY g.id ORDER BY g.name,g.id`).bind(ctx.actor.workspaceId).all<{ id: string; name: string; size: number }>()).results;
}
export async function mentionGroups(ctx: FeatureContext, pageId: string) {
  await requirePageLevel(ctx, pageId, 'comment');
  return { items: await groups(ctx) };
}

/** Bounds apply to new references, so editing text around an existing mention cannot resend it. */
async function audience(ctx: FeatureContext, containerId: string, next: unknown, prior: unknown, excludePeople: string[] = []) {
  const old = new Set(groupMentionIds(prior)), ids = groupMentionIds(next).filter(id => !old.has(id));
  const oldPeople = new Set(mentionIds(prior));
  const people = mentionIds(next).filter(id => !oldPeople.has(id) && id !== ctx.actor.id && !excludePeople.includes(id));
  if (!ids.length) return {recipients: people, config: null, hasGroups: false};
  const config = await mentionConfiguration(ctx), available = await groups(ctx);
  for (const id of ids) {
    const group = available.find(group => group.id === id);
    if (!group) throw new ApiProblem(400, 'UNKNOWN_MENTION_GROUP', 'Choose an existing workspace group.');
    if (config.restrictLargeGroups && group.size > config.sizeLimit) {
      try { await requireContainerAdministration(ctx, containerId); }
      catch (error) {
        if (!(error instanceof ApiProblem) || ![403, 404].includes(error.status)) throw error;
        throw new ApiProblem(403, 'GROUP_MENTION_LIMIT', `Only space administrators can mention groups larger than ${config.sizeLimit} people.`);
      }
    }
  }
  const members = ids.length ? (await ctx.db.prepare(`SELECT DISTINCT gm.member_id AS id FROM group_members gm JOIN groups g ON g.id=gm.group_id
    WHERE g.workspace_id=? AND gm.group_id IN (SELECT value FROM json_each(?))`).bind(ctx.actor.workspaceId, JSON.stringify(ids)).all<{ id: string }>()).results.map(row => row.id) : [];
  const recipients = [...new Set([...members, ...people])].filter(id => id !== ctx.actor.id);
  return { recipients, config, hasGroups: ids.length > 0 };
}

export async function previewMentions(ctx: FeatureContext, pageId: string, input: { content: unknown; previous?: unknown }) {
  await requirePageLevel(ctx, pageId, 'comment');
  const page = await ctx.db.prepare('SELECT container_id FROM pages WHERE id=? AND workspace_id=?').bind(pageId, ctx.actor.workspaceId).first<{ container_id: string }>();
  const result = await audience(ctx, page!.container_id, input.content, input.previous);
  const rows = (await ctx.db.prepare(`SELECT m.id,${pageReadableSql('m', 'z.page', 'm.workspace_id', 'z.at')} AS readable FROM members m,
    (SELECT ? AS page,? AS at) z WHERE m.workspace_id=? AND m.status='active' AND m.id IN (SELECT value FROM json_each(?))`)
    .bind(pageId, ctx.now, ctx.actor.workspaceId, JSON.stringify(result.recipients)).all<{ id: string; readable: number }>()).results;
  return { count: rows.filter(row => row.readable).length, excludedCount: rows.filter(row => !row.readable).length };
}

/** Notification creation and delivery independently recheck access. The configuration CAS and ACL epoch protect the size check. */
export async function mentionEffects(ctx: FeatureContext, pageId: string, containerId: string, next: unknown, prior: unknown, revisionId: string, commentId?: string, excludePeople: string[] = []) {
  if (ctx.contentOrigin === 'historical-import') return [];
  const result = await audience(ctx, containerId, next, prior, excludePeople);
  const statements: D1PreparedStatement[] = [];
  if (result.hasGroups) statements.push(mutationGuard(ctx.db, `SELECT (SELECT id FROM core_entity_revisions WHERE workspace_id=? AND entity_kind='mention-configuration' AND entity_id=?
    ORDER BY CAST(json_extract(content_json,'$.configurationSequence') AS INTEGER) DESC,id DESC LIMIT 1) IS ?`, [ctx.actor.workspaceId, ctx.actor.workspaceId, result.config!.revisionId]));
  statements.push(...notificationStatements(ctx, { id: `${revisionId}:mentions`, event: 'mention', pageId, commentId, recipientIds: result.recipients }));
  return statements;
}
