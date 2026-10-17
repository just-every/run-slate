import type { FeatureContext } from '../../app/feature-context';
import { ApiProblem } from '../../app/problems';
import { currentSubject, requirePageLevel } from '../sharing/current-access';
import { accessSql, pageAccessLevelSql } from '../search/access-sql';
import { pageReadableSql } from '../notifications/creation-access';
import { assignedSql, requestRow } from './request-access';
import type { ReviewRequestItem, ReviewRequestQueue, ReviewTarget } from './request-types';

export async function bulkReviewOwner(ctx: FeatureContext, pageId?: string) {
 await currentSubject(ctx);
 return !!await ctx.db.prepare(`SELECT 1 FROM members m WHERE m.id=?1 AND m.workspace_id=?2 AND m.status='active' AND
 (m.role='owner' AND m.member_kind='member' OR EXISTS(SELECT 1 FROM container_owners co JOIN containers c ON c.id=co.container_id WHERE co.member_id=m.id AND c.workspace_id=m.workspace_id AND (?3 IS NULL OR co.container_id=(SELECT container_id FROM pages WHERE id=?3 AND workspace_id=?2))))`).bind(ctx.actor.id, ctx.actor.workspaceId, pageId ?? null).first();
}
function decode(cursor: string): [string, string] {
 try { const c = JSON.parse(atob(cursor.replaceAll('-', '+').replaceAll('_', '/'))); if (Array.isArray(c) && c.length === 2 && c.every(v => typeof v === 'string')) return c as [string, string]; } catch { /* invalid cursor below */ }
 throw new ApiProblem(400, 'INVALID_CURSOR', 'Start again from the first page of review requests.');
}
const encode = (item: { dueAt: string; id: string }) => btoa(JSON.stringify([item.dueAt, item.id])).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
export async function reviewRequestQueue(ctx: FeatureContext, input: { view?: string; state?: string; cursor?: string; limit?: number; pageId?: string; id?: string } = {}): Promise<ReviewRequestQueue> {
 const subject = await currentSubject(ctx), view = input.view ?? 'assigned', state = input.state ?? 'pending';
 if (!['assigned', 'requested'].includes(view) || !['pending', 'all', 'verified', 'changes_requested', 'cancelled'].includes(state)) throw new ApiProblem(400, 'INVALID_REVIEW_FILTER', 'Choose a request queue and state.');
 if (input.pageId) await requirePageLevel(ctx, input.pageId, 'view');
 const acl = accessSql(subject, ctx.now, false), after = input.cursor ? decode(input.cursor) : null, limit = Number.isFinite(input.limit) ? Math.min(100, Math.max(1, Math.trunc(input.limit!))) : 50;
 const ownAssignment = assignedSql('s', 'r').replaceAll('s.id', 's.member');
 const selected = input.pageId || input.id ? '1' : view === 'assigned' ? 'assigned' : 'requester_member_id=(SELECT member FROM subject)';
 const sql = `WITH RECURSIVE candidates AS MATERIALIZED (SELECT DISTINCT page_id FROM review_requests WHERE workspace_id=?),${acl.sql},
 listed AS (
 SELECT r.*,p.container_id,p.revision_id AS page_revision_id,p.working_revision_id,
 CASE WHEN ${pageAccessLevelSql}<3 AND p.published_revision_id IS NOT NULL AND p.published_revision_id<>p.working_revision_id THEN COALESCE(json_extract(pr.properties_json,'$.title'),'Untitled') ELSE p.title END AS title,
 CASE WHEN c.owned OR COALESCE(cl.level,0)>0 THEN c.name END AS container_name,
 ${pageAccessLevelSql} AS access_level,${ownAssignment} AS assigned,p.owner_member_id,
 COALESCE(requester.display_name,'Former member') AS requester_name,
 CASE WHEN r.assignee_kind='group' THEN COALESCE(rg.name,'Former group') ELSE COALESCE(am.display_name,'Former member') END AS assignee_name,
 COALESCE((SELECT se.key FROM status_entries se WHERE se.workspace_id=p.workspace_id AND se.key=p.status_key AND se.requires_verification=1 AND se.retired_at IS NULL),
 (SELECT se.key FROM status_entries se WHERE se.workspace_id=p.workspace_id AND se.requires_verification=1 AND se.retired_at IS NULL ORDER BY se.created_at,se.key LIMIT 1)) AS verify_status,
 EXISTS(SELECT 1 FROM content_page_opens o WHERE o.member_id=s.member AND o.page_id=p.id AND o.revision_id=p.working_revision_id) AS opened,
 (SELECT d.created_at FROM review_request_deliveries d WHERE d.request_id=r.id AND d.assignment_generation=r.assignment_generation AND d.stage='reviewer') AS reviewer_reminded,
 (SELECT d.created_at FROM review_request_deliveries d WHERE d.request_id=r.id AND d.assignment_generation=r.assignment_generation AND d.stage='owner') AS owner_reminded
 FROM review_requests r JOIN pages p ON p.id=r.page_id
 LEFT JOIN members requester ON requester.id=r.requester_member_id LEFT JOIN members am ON am.id=r.assignee_id AND r.assignee_kind='member'
 LEFT JOIN groups rg ON rg.id=r.assignee_id AND rg.workspace_id=r.workspace_id AND r.assignee_kind='group'
 LEFT JOIN page_revisions pr ON pr.id=p.published_revision_id AND pr.page_id=p.id
 LEFT JOIN page_levels pl ON pl.id=p.id LEFT JOIN page_grants_live g ON g.page_id=p.id LEFT JOIN containers_live c ON c.id=p.container_id LEFT JOIN container_levels cl ON cl.id=c.id LEFT JOIN content_archive_locations l ON l.page_id=p.id,subject s
 WHERE r.workspace_id=s.workspace AND p.deleted_at IS NULL AND p.trashed_at IS NULL AND p.archived_at IS NULL AND p.lifecycle<>'archived'
 ),readable AS MATERIALIZED (SELECT * FROM listed WHERE access_level>0),
 queue AS (SELECT * FROM readable WHERE (${selected}) AND (?='all' OR state=?) AND (? IS NULL OR page_id=?) AND (? IS NULL OR id=?))
 SELECT (SELECT json_group_array(json_object('id',q.id,'pageId',q.page_id,'title',q.title,'containerName',q.container_name,'requesterId',q.requester_member_id,'requesterName',q.requester_name,'assigneeKind',q.assignee_kind,'assigneeId',q.assignee_id,'assigneeName',q.assignee_name,
 'assignmentGeneration',q.assignment_generation,'revisionId',q.revision_id,'requestedRevisionId',q.requested_revision_id,'date',q.due_date,'time',q.due_time,'timezone',q.timezone,'dueAt',q.due_at,'note',q.note,'state',q.state,
 'pageRevisionId',q.page_revision_id,'workingRevisionId',q.working_revision_id,'statusKey',q.verify_status,'openedCurrent',q.opened,
 'canVerify',q.assigned AND q.access_level>=3 AND q.verify_status IS NOT NULL,'canRequestChanges',q.assigned AND q.access_level>=2,
 'canReassign',q.assigned OR q.access_level>=3 OR q.owner_member_id=(SELECT member FROM subject) OR q.requester_member_id=(SELECT member FROM subject),
 'canCancel',q.access_level>=3 OR q.owner_member_id=(SELECT member FROM subject) OR q.requester_member_id=(SELECT member FROM subject),
 'reviewerRemindedAt',q.reviewer_reminded,'ownerRemindedAt',q.owner_reminded,'dispatchPausedAt',q.dispatch_paused_at,'commentId',q.comment_id,'resolvedAt',q.resolved_at))
 FROM (SELECT * FROM queue WHERE ? IS NULL OR (due_at,id)>(?,?) ORDER BY due_at,id LIMIT ?) q) AS items,
 (SELECT COUNT(*) FROM queue) AS total,
 (SELECT COUNT(*) FROM readable WHERE state='pending' AND assigned) AS assigned_count,
 (SELECT COUNT(*) FROM readable WHERE state='pending' AND requester_member_id=(SELECT member FROM subject)) AS requested_count`;
 const row = await ctx.db.prepare(sql).bind(ctx.actor.workspaceId, ...acl.parameters, state, state, input.pageId ?? null, input.pageId ?? null, input.id ?? null, input.id ?? null, after ? 1 : null, after?.[0] ?? null, after?.[1] ?? null, limit + 1).first<{items: string; total: number; assigned_count: number; requested_count: number}>();
 const rows = JSON.parse(row?.items ?? '[]') as (Omit<ReviewRequestItem, 'ownerReminderAt'>)[];
 const items = rows.slice(0, limit).map(r => ({ ...r, openedCurrent: !!r.openedCurrent, canVerify: !!r.canVerify, canRequestChanges: !!r.canRequestChanges, canReassign: !!r.canReassign, canCancel: !!r.canCancel, ownerReminderAt: new Date(Date.parse(r.reviewerRemindedAt ?? r.dueAt) + 86400000).toISOString() }));
 return { items, total: row?.total ?? 0, counts: { assigned: row?.assigned_count ?? 0, requested: row?.requested_count ?? 0 }, canBulkVerify: await bulkReviewOwner(ctx), ...(rows.length > limit && items.length ? { nextCursor: encode(items.at(-1)!) } : {}) };
}
export async function readReviewRequest(ctx: FeatureContext, id: string) {
 await requestRow(ctx, id);
 const queue = await reviewRequestQueue(ctx, { id, state: 'all' });
 if (!queue.items.length) throw new ApiProblem(404, 'NOT_FOUND', 'Not found.');
 const history = await ctx.db.prepare('SELECT id,assignment_generation AS assignmentGeneration,actor_member_id AS actorId,action,snapshot_json AS snapshot,created_at AS createdAt FROM review_request_history WHERE request_id=? ORDER BY created_at,id').bind(id).all<{snapshot: string}>();
 return { request: queue.items[0], history: history.results.map(h => ({ ...h, snapshot: JSON.parse(h.snapshot) })) };
}
export async function reviewTargets(ctx: FeatureContext, pageId: string) {
 await requirePageLevel(ctx, pageId, 'view');
 const members = await ctx.db.prepare(`SELECT m.id,m.display_name AS name FROM members m WHERE m.workspace_id=?1 AND m.status='active' AND ${pageReadableSql('m', '?2', '?1', '?3')} ORDER BY m.display_name,m.id`).bind(ctx.actor.workspaceId, pageId, ctx.now).all<{id: string; name: string}>();
 const groups = await ctx.db.prepare(`SELECT g.id,g.name FROM groups g WHERE g.workspace_id=?1 AND EXISTS(SELECT 1 FROM group_members gm WHERE gm.group_id=g.id AND gm.member_id IN (SELECT value FROM json_each(?2))) ORDER BY g.name,g.id`).bind(ctx.actor.workspaceId, JSON.stringify(members.results.map(m => m.id))).all<{id: string; name: string}>();
 return { items: [...members.results.map(m => ({ ...m, kind: 'member' as const })), ...groups.results.map(g => ({ ...g, kind: 'group' as const }))] as ReviewTarget[] };
}
