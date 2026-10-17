import type { FeatureContext } from '../../app/feature-context';
import { ApiProblem } from '../../app/problems';
import { publishedImportContainerSql } from '../imports/publication';
import { readPage } from '../pages/service';
import { requirePageLevel, resolveCurrentAccessMany } from '../sharing/current-access';
import { taskReportDefinitionSchema, type TaskReportDefinition } from './report-definition';
import type { TaskReportGroup, TaskReportItem, TaskReportResult } from './report-types';
import type { TaskItem } from './ui/taskTypes';

interface Candidate { id: string; containerId: string; containerName: string }
interface TaskContent {
  text: TaskItem['text']; done: boolean; assigneeMemberId?: string | null; dueDate?: string | null;
  completedByMemberId?: string | null; completedAt?: string | null;
}

/** A source narrows the search; every returned task still needs its own current page grant. */
export async function taskReport(ctx: FeatureContext, pageId: string, raw: unknown): Promise<TaskReportResult> {
  await requirePageLevel(ctx, pageId, 'view');
  const parsed = taskReportDefinitionSchema.safeParse(raw);
  if (!parsed.success) throw new ApiProblem(400, 'INVALID_TASK_REPORT', 'Choose valid task report filters.');
  const definition = parsed.data;
  await requireSources(ctx, definition);
  const epoch = ctx.authorizationEpoch;
  const rows = (await ctx.db.prepare(`WITH RECURSIVE scope(id) AS (
    SELECT id FROM pages WHERE id=? AND workspace_id=?
    UNION SELECT p.id FROM pages p JOIN scope s ON p.parent_page_id=s.id WHERE p.workspace_id=?
  ) SELECT p.id,c.id AS containerId,c.name AS containerName
    FROM pages p JOIN containers c ON c.id=p.container_id AND c.workspace_id=p.workspace_id
    WHERE p.workspace_id=? AND p.lifecycle IN ('live','live-with-unpublished-changes')
    AND p.deleted_at IS NULL AND p.trashed_at IS NULL AND p.archived_at IS NULL
    AND c.archived_at IS NULL AND c.trashed_at IS NULL AND ${publishedImportContainerSql('c.id')}
    AND (? IS NULL OR p.container_id=?)
    AND (? IS NULL OR (p.id IN (SELECT id FROM scope) AND p.id<>?)) ORDER BY p.id`)
    .bind(definition.ancestorPageId ?? null, ctx.actor.workspaceId, ctx.actor.workspaceId, ctx.actor.workspaceId,
      definition.containerId ?? null, definition.containerId ?? null,
      definition.ancestorPageId ?? null, definition.ancestorPageId ?? null).all<Candidate>()).results;
  const access = await resolveCurrentAccessMany(ctx, rows.map(row => row.id));
  const authorized = rows.filter(row => access.get(row.id)?.decision.allowed);
  const origins = new Map((await ctx.db.prepare(`SELECT page_id,block_id,member_id FROM task_origins
    WHERE page_id IN (SELECT value FROM json_each(?))`)
    .bind(JSON.stringify(authorized.map(row => row.id))).all<{ page_id: string; block_id: string; member_id: string | null }>())
    .results.map(row => [`${row.page_id}:${row.block_id}`, row.member_id]));
  const assignee = definition.assignee?.kind === 'current-reader' ? ctx.actor.id : definition.assignee?.memberId;
  const items: TaskReportItem[] = [];
  // readPage chooses the immutable published projection for a reader, including labels and task text.
  const documents = await Promise.all(authorized.map(async row => {
    try { return { row, document: await readPage(ctx, row.id) }; }
    catch (error) {
      if (error instanceof ApiProblem && [403, 404].includes(error.status)) throw changedReport();
      throw error;
    }
  }));
  for (const { row, document } of documents) {
    if (definition.label && !document.properties.labels.some(label => label.toLocaleLowerCase() === definition.label!.toLocaleLowerCase())) continue;
    for (const block of document.blocks) {
      if (block.blockType !== 'task') continue;
      const content = block.content as unknown as TaskContent;
      // Never trust a creator supplied in task content, including historical/imported content.
      const creator = origins.get(`${row.id}:${block.id}`) ?? null;
      if (assignee && content.assigneeMemberId !== assignee || definition.creatorMemberId && creator !== definition.creatorMemberId) continue;
      if (definition.state === 'open' && content.done || definition.state === 'completed' && !content.done) continue;
      if (definition.dueFrom && (!content.dueDate || content.dueDate < definition.dueFrom) || definition.dueTo && (!content.dueDate || content.dueDate > definition.dueTo)) continue;
      items.push({
        pageId: row.id, blockId: block.id, blockRevisionId: block.revisionId,
        pageTitle: document.page.title, containerId: row.containerId, containerName: row.containerName,
        text: content.text, done: content.done, assigneeMemberId: content.assigneeMemberId ?? null,
        assigneeDisplayName: null, creatorMemberId: creator, dueDate: content.dueDate ?? null,
        completedByMemberId: content.completedByMemberId ?? null, completedAt: content.completedAt ?? null,
        canEdit: document.permissions.canEdit,
      });
    }
  }
  const names = new Map((await ctx.db.prepare(`SELECT id,display_name FROM members WHERE workspace_id=?
    AND id IN (SELECT value FROM json_each(?))`).bind(ctx.actor.workspaceId,
    JSON.stringify([...new Set(items.flatMap(item => item.assigneeMemberId ? [item.assigneeMemberId] : []))]))
    .all<{ id: string; display_name: string }>()).results.map(member => [member.id, member.display_name]));
  for (const item of items) item.assigneeDisplayName = item.assigneeMemberId ? names.get(item.assigneeMemberId) ?? null : null;
  items.sort((a, b) => compareItems(a, b, definition));
  const limited = items.slice(0, definition.limit);
  const groups = groupItems(limited, definition.groupBy);
  // Reject the entire response if grants, membership, location or lifecycle changed during its reads.
  await requirePageLevel(ctx, pageId, 'view');
  const current = await ctx.db.prepare('SELECT epoch FROM core_acl_epoch WHERE id=1').first<{ epoch: number }>();
  if (!current || current.epoch !== epoch) throw changedReport();
  return { items: limited, groups, ranAt: ctx.now };
}

async function requireSources(ctx: FeatureContext, definition: TaskReportDefinition) {
  if (definition.containerId) {
    // Page-level guests may read a report without a container grant. No source metadata is returned here.
    const source = await ctx.db.prepare(`SELECT c.id FROM containers c WHERE c.id=? AND c.workspace_id=?
      AND c.archived_at IS NULL AND c.trashed_at IS NULL AND ${publishedImportContainerSql('c.id')}`)
      .bind(definition.containerId, ctx.actor.workspaceId).first();
    if (!source) throw unavailableSource();
  }
  if (definition.ancestorPageId) {
    try { await requirePageLevel(ctx, definition.ancestorPageId, 'view'); }
    catch (error) {
      if (error instanceof ApiProblem && [403, 404].includes(error.status)) throw unavailableSource();
      throw error;
    }
    const source = await ctx.db.prepare(`SELECT p.id FROM pages p JOIN containers c ON c.id=p.container_id
      AND c.workspace_id=p.workspace_id WHERE p.id=? AND p.workspace_id=?
      AND p.lifecycle IN ('live','live-with-unpublished-changes') AND p.deleted_at IS NULL
      AND p.archived_at IS NULL AND p.trashed_at IS NULL AND c.archived_at IS NULL
      AND c.trashed_at IS NULL AND ${publishedImportContainerSql('c.id')}`)
      .bind(definition.ancestorPageId, ctx.actor.workspaceId).first();
    if (!source) throw unavailableSource();
  }
}

function compareItems(a: TaskReportItem, b: TaskReportItem, definition: TaskReportDefinition) {
  const value = (item: TaskReportItem) => definition.orderBy === 'page' ? item.pageTitle
    : definition.orderBy === 'due' ? item.dueDate : item.assigneeDisplayName;
  const av = value(a), bv = value(b);
  // Undated and unassigned tasks remain last in either direction.
  const order = av === null ? bv === null ? 0 : 1 : bv === null ? -1
    : av.localeCompare(bv) * (definition.direction === 'desc' ? -1 : 1);
  return order || a.pageId.localeCompare(b.pageId) || a.blockId.localeCompare(b.blockId);
}

function groupItems(items: TaskReportItem[], groupBy: TaskReportDefinition['groupBy']): TaskReportGroup[] {
  const groups = new Map<string, TaskReportGroup>();
  for (const item of items) {
    const key = groupBy === 'page' ? item.pageId : groupBy === 'due' ? item.dueDate ?? 'undated' : item.assigneeMemberId ?? 'unassigned';
    const label = groupBy === 'page' ? item.pageTitle : groupBy === 'due' ? item.dueDate ?? 'No due date'
      : item.assigneeMemberId ? item.assigneeDisplayName ?? 'Former member' : 'Unassigned';
    let group = groups.get(key);
    if (!group) { group = { key, label, items: [] }; groups.set(key, group); }
    group.items.push(item);
  }
  return [...groups.values()];
}

function unavailableSource() { return new ApiProblem(404, 'TASK_REPORT_SOURCE_UNAVAILABLE', 'The task report source is unavailable. It may have been deleted or your access may have changed.'); }
function changedReport() { return new ApiProblem(409, 'TASK_REPORT_CHANGED', 'Task report access changed. Run the report again.'); }
