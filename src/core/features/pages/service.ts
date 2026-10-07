import { authorScheduleProjections } from '../lifecycle/schedule-view';
import { mergeAppearance, validateAppearance, validateUploadedAppearance } from './appearance';
import { filterRecordProperties } from '../databases/property-access';
import { normalizeTask } from '../editor/tasks';
import { resolveMentions, type MentionResolution } from './mentions';
import type { FeatureContext } from '../../app/feature-context';
import { commitOperation, requestHash } from '../../app/operations';
import { ApiProblem } from '../../app/problems';
import { createUlid } from '../../shared/ulid';
import { requirePageLevel, requireContainerLevel } from '../sharing/current-access';
import type { PageDocument } from '../../shared/api/content';
import type { PageCreateInput, PageUpdateInput, PageProperties } from './types';
import { pageRow, pageBlocks, properties, revisionStatement, pageGuard, writable, ref, contentEvent, revisionRow } from './repository';
import { validateBlockTree } from '../editor/validation';
import { contentPolicy } from './policy';
export async function destination(ctx: FeatureContext, containerId: string, parentId?: string | null) {
    if (!parentId)
        await requireContainerLevel(ctx, containerId, 'edit');
    const container = await ctx.db.prepare('SELECT archived_at,trashed_at FROM containers WHERE id=?').bind(containerId).first<{
        archived_at: string | null;
        trashed_at: string | null;
    }>();
    if (!container || container.archived_at || container.trashed_at)
        throw new ApiProblem(409, 'DESTINATION_UNAVAILABLE', 'Choose a live destination.');
    if (parentId) {
        await requirePageLevel(ctx, parentId, 'edit');
        const parent = await pageRow(ctx, parentId);
        writable(parent);
        if (parent.container_id !== containerId)
            throw new ApiProblem(400, 'INVALID_PARENT', 'Parent belongs to another container.');
    }
}
export async function readPage(ctx: FeatureContext, id: string): Promise<PageDocument & {
    mentions: Record<string,MentionResolution>;
    authorDisplayName: string;
    contributors: {
        id: string;
        displayName: string;
    }[];
    schedule: unknown;
    properties: PageProperties;
    parentPageId: string | null;
    createdAt: string;
    updatedAt: string;
    authorMemberId: string;
}> {
    const access = await requirePageLevel(ctx, id, 'view');
    const p = await pageRow(ctx, id);
    if (p.trashed_at)
        throw new ApiProblem(404, 'NOT_FOUND', 'Not found.');
    const canEdit = access.decision.level === 'edit' || access.decision.level === 'full';
    // Render immutable content for the revision named in this response, even if another edit commits mid-read.
    const delivered = await revisionRow(ctx, id, canEdit ? p.working_revision_id : p.published_revision_id ?? p.working_revision_id);
    let blocks = JSON.parse(delivered.body_json), props: PageProperties = { ...JSON.parse(delivered.properties_json), statusKey: p.status_key };
    if (!canEdit && p.published_revision_id && p.published_revision_id !== p.working_revision_id) {
        const r = await revisionRow(ctx, id, p.published_revision_id);
        blocks = JSON.parse(r.body_json);
        props = JSON.parse(r.properties_json);
    }
    props = await filterRecordProperties(ctx, id, props);
    const author = await ctx.db.prepare('SELECT display_name AS displayName FROM members WHERE id=?').bind(p.author_member_id).first<{
        displayName: string;
    }>();
    const contributors = (await ctx.db.prepare('SELECT m.id,m.display_name AS displayName FROM page_contributors c JOIN members m ON m.id=c.member_id WHERE c.page_id=?').bind(id).all<{
        id: string;
        displayName: string;
    }>()).results;
    const schedule = canEdit ? await ctx.db.prepare('SELECT publish_at AS publishAt,state,failure FROM content_schedules WHERE page_id=?').bind(id).first() : null;
    const v = await ctx.db.prepare('SELECT revision_id AS revisionId,status_key AS statusKey,owner_member_id AS ownerMemberId,expires_at AS expiresAt FROM page_verifications WHERE page_id=? ORDER BY created_at DESC,id DESC LIMIT 1').bind(id).first<Record<string, any>>();
    const scheduledProjection=(await authorScheduleProjections(ctx,[id])).get(id);
    return { authorDisplayName: author?.displayName ?? 'Former member', contributors, schedule, verification: v ? { ...v, lapsed: !!v.expiresAt && v.expiresAt <= ctx.now, current: v.revisionId === p.working_revision_id && (!v.expiresAt || v.expiresAt > ctx.now) } : undefined, mentions: await resolveMentions(ctx, blocks), page: { ...ref(p), ...scheduledProjection, title: props.title }, blocks, properties: props, parentPageId: p.parent_page_id, createdAt: p.created_at, updatedAt: p.updated_at, authorMemberId: p.author_member_id, workingRevisionId: p.working_revision_id, publishedRevisionId: p.published_revision_id, permissions: { level: access.decision.level!, canEdit: canEdit && !p.archived_at, canShare: access.decision.level === 'full' }, policyProfile: await contentPolicy(ctx) };
}
export async function createPage(ctx: FeatureContext, input: PageCreateInput) {
    return commitOperation(ctx, { operationKey: input.operationKey, action: 'pages.create', request: input, authorize: () => destination(ctx, input.containerId, input.parentPageId), prepare: async ({ revisionId }) => {
      if(input.properties)await validateUploadedAppearance(ctx,'',input.properties);
      return prepareCreatePage(ctx,input,revisionId);
    } }); }
/** Caller includes these statements in its own commitOperation after calling destination. */
export async function prepareCreatePage(ctx: FeatureContext, input: PageCreateInput, revisionId: string) {
    const id = input.id ?? createUlid();
    const policy = await contentPolicy(ctx);
    const lifecycle = input.lifecycle ?? (policy['page.lifecycle.v1'] === 'draft-then-publish' ? 'draft' : 'live');
    if (!['draft', 'live'].includes(lifecycle))
        throw new ApiProblem(400, 'INVALID_LIFECYCLE', 'New pages must be draft or live.');
    const p: PageProperties = { title: input.title, icon: null, coverFileId: null, ownerMemberId: ctx.actor.id, statusKey: null, labels: [], typeface: 'default', smallText: false, fullWidth: false, ...input.properties };
    validateProperties(p);
    if (p.statusKey) {
        const status = await ctx.db.prepare('SELECT requires_verification FROM status_entries WHERE workspace_id=? AND key=? AND retired_at IS NULL').bind(ctx.actor.workspaceId,p.statusKey).first<{requires_verification:number}>();
        if (!status) throw new ApiProblem(400, 'UNKNOWN_STATUS', 'Choose an active status.');
        if (status.requires_verification) throw new ApiProblem(400, 'STATUS_COMMAND_REQUIRED', 'Create the page, then open and verify its exact revision.');
    }
    const blocks = validateBlockTree(input.blocks ?? []).map(b => ({ ...b, content: normalizeTask(ctx, b), parentBlockId: b.parentBlockId ?? null, pageId: id, revisionId: createUlid() }));
    const statements = [ctx.db.prepare('INSERT INTO pages (id,workspace_id,container_id,parent_page_id,database_id,page_kind,title,icon,cover_file_id,author_member_id,owner_member_id,lifecycle,working_revision_id,published_revision_id,status_key,tree_position,typeface,small_text,full_width,created_at,updated_at,revision_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id, ctx.actor.workspaceId, input.containerId, input.parentPageId ?? null, input.databaseId ?? null, input.pageKind ?? 'page', p.title, p.icon, p.coverFileId, ctx.actor.id, p.ownerMemberId, lifecycle, revisionId, lifecycle === 'live' ? revisionId : null, p.statusKey, input.treePosition ?? `${ctx.now}:${id}`, p.typeface, +p.smallText, +p.fullWidth, ctx.now, ctx.now, revisionId), ...blocks.map(b => ctx.db.prepare('INSERT INTO page_blocks (id,page_id,parent_block_id,block_type,content_json,tree_position,revision_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)').bind(b.id, id, b.parentBlockId, b.blockType, JSON.stringify(b.content), b.treePosition, b.revisionId, ctx.now, ctx.now)), ...p.labels.map(label => ctx.db.prepare('INSERT INTO page_labels (page_id,label,created_at) VALUES (?,?,?)').bind(id, label, ctx.now)), await revisionStatement(ctx, id, revisionId, { blocks, properties: p }), contentEvent(ctx, id, revisionId, 'created')];
    return { statements, entity: { id, kind: 'page', revisionId }, value: { pageId: id, revisionId } };
}
export function validateProperties(p: Partial<PageProperties>) {
    validateAppearance(p);
    if (p.title !== undefined && (typeof p.title !== 'string' || p.title.length > 1000))
        throw new ApiProblem(400, 'INVALID_TITLE', 'Title must be at most 1000 characters.');
    if (p.labels && (!Array.isArray(p.labels) || p.labels.length > 100 || p.labels.some(v => typeof v !== 'string' || !v.trim() || v.length > 80) || new Set(p.labels).size !== p.labels.length))
        throw new ApiProblem(400, 'INVALID_LABELS', 'Labels must be unique short tags.');
    if (p.typeface && !['default', 'serif', 'mono'].includes(p.typeface))
        throw new ApiProblem(400, 'INVALID_TYPEFACE', 'Unknown typeface.');
}
export async function updatePage(ctx: FeatureContext, id: string, input: PageUpdateInput) {
    validateProperties(input.properties);
    return commitOperation(ctx, { operationKey: input.operationKey, action: 'pages.update', request: { id, ...input }, authorize: async () => { await requirePageLevel(ctx, id, input.properties.ownerMemberId !== undefined ? 'full' : 'edit'); }, prepare: async ({ revisionId }) => {
            const page = await pageRow(ctx, id);
            writable(page);
            const before = await properties(ctx, page);
            if (input.properties.statusKey !== undefined)
                throw new ApiProblem(400, 'STATUS_COMMAND_REQUIRED', 'Use the status command to preserve human verification.');
            const p = mergeAppearance(before, input.properties);
            if (await requestHash(p) === await requestHash(before))
                return { noChange: true, statements: [pageGuard(ctx, page, input.expectedRevisionId)], entity: { id, kind: 'page', revisionId: page.revision_id }, value: { pageId: id, revisionId: page.revision_id } };
            if (p.ownerMemberId) {
                const owner = await ctx.db.prepare("SELECT id FROM members WHERE id=? AND workspace_id=? AND status='active'").bind(p.ownerMemberId, ctx.actor.workspaceId).first();
                if (!owner)
                    throw new ApiProblem(400, 'INVALID_OWNER', 'Choose an active member.');
            }
            await validateUploadedAppearance(ctx,id,p);
            const policy = await contentPolicy(ctx);
            const live = policy['page.lifecycle.v1'] === 'always-live' && page.lifecycle !== 'draft' && page.lifecycle !== 'scheduled';
            const blocks = await pageBlocks(ctx.db, id);
            return { statements: [pageGuard(ctx, page, input.expectedRevisionId), ctx.db.prepare('UPDATE pages SET title=?,icon=?,cover_file_id=?,owner_member_id=?,typeface=?,small_text=?,full_width=?,working_revision_id=?,revision_id=?,published_revision_id=CASE WHEN ? THEN ? ELSE published_revision_id END,lifecycle=CASE WHEN ? THEN lifecycle WHEN lifecycle IN (\'live\',\'live-with-unpublished-changes\') THEN \'live-with-unpublished-changes\' ELSE lifecycle END,updated_at=? WHERE id=?').bind(p.title, p.icon, p.coverFileId, p.ownerMemberId, p.typeface, +p.smallText, +p.fullWidth, revisionId, revisionId, +live, revisionId, +live, ctx.now, id), ctx.db.prepare('DELETE FROM page_labels WHERE page_id=?').bind(id), ...p.labels.map(label => ctx.db.prepare('INSERT INTO page_labels VALUES (?,?,?)').bind(id, label, ctx.now)), await revisionStatement(ctx, id, revisionId, { blocks, properties: p }), contentEvent(ctx, id, revisionId, 'properties')], entity: { id, kind: 'page', revisionId }, value: { pageId: id, revisionId } };
        } });
}
