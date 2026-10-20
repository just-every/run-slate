import type { FeatureContext } from '../../../app/feature-context';
import { commitOperation, mutationGuard } from '../../../app/operations';
import { ApiProblem } from '../../../app/problems';
import { createUlid } from '../../../shared/ulid';
import { requireContainerAdministration, requirePageLevel } from '../../sharing/current-access';
import { permitted } from '../../search/visibility';
import { latestVerificationSql } from '../state';
import { defaultUnviewedDays, parseRuleSettings, RuleInputError, ruleActions, ruleKinds, type RuleKind, type RuleReason, type RuleSettings } from './definitions';
import { selectRuleChanges } from './selection';
import { readablePageIds } from './readable';

export interface RuleRow { id: string; workspace_id: string; container_id: string; kind: RuleKind; action: string; days: number | null; enabled: number; enabled_at: string | null; revision_id: string }

/** Validation as a 400 problem; the route and the store both call it before anything is stored. */
export function validatedRule(input: unknown): RuleSettings {
  try { return parseRuleSettings(input); }
  catch (error) { if (error instanceof RuleInputError) throw new ApiProblem(400, error.code, error.message); throw error; }
}

/** Container owners configure rules (a workspace owner owns every non-personal container), as container settings do. */
export async function requireRuleContainer(ctx: FeatureContext, containerId: string) {
  await requireContainerAdministration(ctx, containerId);
}

export async function containerRules(ctx: FeatureContext, containerId: string) {
  await requireRuleContainer(ctx, containerId);
  const rows = (await ctx.db.prepare('SELECT * FROM verification_rules WHERE container_id=? AND workspace_id=?').bind(containerId, ctx.actor.workspaceId).all<RuleRow>()).results;
  const rules = ruleKinds.map(kind => {
    const row = rows.find(r => r.kind === kind);
    return { kind, action: ruleActions[kind], days: row?.days ?? (kind === 'unviewed' ? defaultUnviewedDays : null), enabled: !!row?.enabled, enabledAt: row?.enabled_at ?? null };
  });
  const flags = (await ctx.db.prepare(`SELECT f.page_id AS pageId,p.title,r.kind,f.reason_json AS reason,f.flagged_at AS flaggedAt FROM verification_rule_flags f JOIN verification_rules r ON r.id=f.rule_id JOIN pages p ON p.id=f.page_id
 WHERE r.container_id=? AND r.workspace_id=? AND f.dismissed_at IS NULL ORDER BY f.flagged_at DESC,p.id`).bind(containerId, ctx.actor.workspaceId).all<{ pageId: string; title: string; kind: RuleKind; reason: string; flaggedAt: string }>()).results;
  const readable = await readablePageIds(ctx.db, ctx.actor.id, ctx.actor.workspaceId, flags.map(f => f.pageId), ctx.now);
  const shown = flags.filter(f => readable.has(f.pageId)).map(f => ({ ...f, reason: JSON.parse(f.reason) as RuleReason }));
  return { rules, flags: shown, hiddenFlags: flags.length - shown.length };
}

export async function saveRule(ctx: FeatureContext, containerId: string, input: Record<string, unknown>) {
  const settings = validatedRule(input);
  return commitOperation(ctx, { operationKey: String(input.operationKey ?? ''), action: 'verification-rules.save', request: { containerId, ...settings }, authorize: () => requireRuleContainer(ctx, containerId), prepare: async ({ revisionId }) => ({
    statements: [ctx.db.prepare(`INSERT INTO verification_rules (id,workspace_id,container_id,kind,action,days,enabled,enabled_at,updated_by_member_id,created_at,updated_at,revision_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
 ON CONFLICT(container_id,kind) DO UPDATE SET action=excluded.action,days=excluded.days,enabled=excluded.enabled,
 enabled_at=CASE WHEN excluded.enabled=0 THEN NULL WHEN verification_rules.enabled=1 THEN verification_rules.enabled_at ELSE excluded.enabled_at END,
 updated_by_member_id=excluded.updated_by_member_id,updated_at=excluded.updated_at,revision_id=excluded.revision_id`)
      .bind(createUlid(), ctx.actor.workspaceId, containerId, settings.kind, settings.action, settings.days, +settings.enabled, settings.enabled ? ctx.now : null, ctx.actor.id, ctx.now, ctx.now, revisionId)],
    entity: { id: containerId, kind: 'container', revisionId },
    value: { kind: settings.kind, enabled: settings.enabled },
  }) });
}

/** Runs tonight's selection for the given settings and writes nothing. Pages the previewer cannot read are counted, never named. */
export async function previewRule(ctx: FeatureContext, containerId: string, input: unknown, appOrigin?: string) {
  const settings = validatedRule(input);
  await requireRuleContainer(ctx, containerId);
  const changes = await selectRuleChanges(ctx.db, { container_id: containerId, kind: settings.kind, days: settings.days }, ctx.now, appOrigin);
  const flagged = new Set((await ctx.db.prepare('SELECT f.page_id FROM verification_rule_flags f JOIN verification_rules r ON r.id=f.rule_id WHERE r.container_id=? AND r.kind=?').bind(containerId, settings.kind).all<{ page_id: string }>()).results.map(r => r.page_id));
  const readable = await readablePageIds(ctx.db, ctx.actor.id, ctx.actor.workspaceId, changes.map(c => c.pageId), ctx.now);
  const pages = changes.filter(c => readable.has(c.pageId)).map(c => ({ pageId: c.pageId, title: c.title, reason: c.reason, alreadyFlagged: flagged.has(c.pageId) }));
  return { kind: settings.kind, action: settings.action, pages, hidden: changes.length - pages.length };
}

async function flagRow(ctx: FeatureContext, pageId: string, kind: unknown) {
  const row = await ctx.db.prepare('SELECT f.rule_id,r.container_id,p.owner_member_id FROM verification_rule_flags f JOIN verification_rules r ON r.id=f.rule_id JOIN pages p ON p.id=f.page_id WHERE f.page_id=? AND r.kind=? AND r.workspace_id=? AND f.dismissed_at IS NULL').bind(pageId, String(kind), ctx.actor.workspaceId).first<{ rule_id: string; container_id: string; owner_member_id: string | null }>();
  if (!row) throw new ApiProblem(404, 'NOT_FOUND', 'Not found.');
  return row;
}
/** The page's owner or a container owner may dismiss a flag; it stays dismissed while its condition holds. */
async function canDismiss(ctx: FeatureContext, row: { container_id: string; owner_member_id: string | null }) {
  return row.owner_member_id === ctx.actor.id || permitted(() => requireRuleContainer(ctx, row.container_id));
}

export async function dismissFlag(ctx: FeatureContext, input: { operationKey: string; pageId: string; kind: string }) {
  let ruleId = '';
  return commitOperation(ctx, { operationKey: input.operationKey, action: 'verification-rules.dismiss', request: input, authorize: async () => {
    await requirePageLevel(ctx, input.pageId, 'view');
    const row = await flagRow(ctx, input.pageId, input.kind);
    if (!await canDismiss(ctx, row)) throw new ApiProblem(403, 'FORBIDDEN', 'The page owner or a container owner dismisses a flag.');
    ruleId = row.rule_id;
  }, prepare: async ({ revisionId }) => ({
    statements: [mutationGuard(ctx.db, 'SELECT dismissed_at IS NULL FROM verification_rule_flags WHERE rule_id=? AND page_id=?', [ruleId, input.pageId]),
      ctx.db.prepare('UPDATE verification_rule_flags SET dismissed_at=?,dismissed_by_member_id=? WHERE rule_id=? AND page_id=?').bind(ctx.now, ctx.actor.id, ruleId, input.pageId)],
    entity: { id: input.pageId, kind: 'page', revisionId }, value: { dismissed: true },
  }) });
}

/** What the page's status panel shows: its active flags and whether a rule ended its latest verification. */
export async function pageRuleState(ctx: FeatureContext, pageId: string) {
  await requirePageLevel(ctx, pageId, 'view');
  const flags = (await ctx.db.prepare(`SELECT r.kind,r.container_id,p.owner_member_id,f.reason_json AS reason,f.flagged_at AS flaggedAt FROM verification_rule_flags f JOIN verification_rules r ON r.id=f.rule_id JOIN pages p ON p.id=f.page_id
 WHERE f.page_id=? AND r.workspace_id=? AND f.dismissed_at IS NULL ORDER BY r.kind`).bind(pageId, ctx.actor.workspaceId).all<{ kind: RuleKind; container_id: string; owner_member_id: string | null; reason: string; flaggedAt: string }>()).results;
  const ended = await ctx.db.prepare(`SELECT a.occurred_at AS at,json_extract(a.detail_json,'$.reason') AS reason FROM activity_entries a JOIN pages p ON p.id=a.target_id
 WHERE a.workspace_id=? AND a.target_kind='page' AND a.target_id=? AND a.action='verification-rules.unverified' AND json_extract(a.detail_json,'$.verificationId')=${latestVerificationSql('p')} ORDER BY a.occurred_at DESC LIMIT 1`).bind(ctx.actor.workspaceId, pageId).first<{ at: string; reason: string }>();
  return {
    flags: await Promise.all(flags.map(async f => ({ kind: f.kind, reason: JSON.parse(f.reason) as RuleReason, flaggedAt: f.flaggedAt, canDismiss: await canDismiss(ctx, f) }))),
    ended: ended ? { at: ended.at, reason: JSON.parse(ended.reason) as RuleReason } : null,
  };
}
