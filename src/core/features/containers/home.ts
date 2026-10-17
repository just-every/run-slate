import type { FeatureContext } from '../../app/feature-context';
import { commitOperation, mutationGuard } from '../../app/operations';
import { ApiProblem } from '../../app/problems';
import { createUlid } from '../../shared/ulid';
import { requireImportPublication } from '../imports/publication';
import { destination } from '../pages/service';
import { requireContainerAdministration, requirePageLevel, resolveCurrentAccessMany } from '../sharing/current-access';
import { readContainer } from './queries';
import { containerRevision } from './service';
import { prepareSpaceHome } from './create-home';

interface HomeInput { operationKey: string; expectedRevisionId: string; pageId?: string; create?: boolean }

export async function readContainerHome(ctx: FeatureContext, id: string) {
  const container = await readContainer(ctx, id);
  const setting = await ctx.db.prepare('SELECT home_page_id FROM containers WHERE id=? AND workspace_id=?').bind(id, ctx.actor.workspaceId).first<{home_page_id:string|null}>();
  const page = setting?.home_page_id ? await homePage(ctx, id, setting.home_page_id) : null;
  const access = page ? (await resolveCurrentAccessMany(ctx, [page.id])).get(page.id) : undefined;
  // Never reveal even the configured ID when its page moved, became a draft or lost access.
  return { pageId: access?.decision.allowed ? page!.id : null, revisionId: container.revisionId, canManage: container.permissions.canManage && !container.archivedAt && !container.trashedAt };
}

async function homePage(ctx: FeatureContext, containerId: string, pageId: string) {
  return ctx.db.prepare("SELECT id FROM pages WHERE id=? AND container_id=? AND workspace_id=? AND page_kind='page' AND lifecycle IN ('live','live-with-unpublished-changes') AND deleted_at IS NULL AND trashed_at IS NULL AND archived_at IS NULL")
    .bind(pageId, containerId, ctx.actor.workspaceId).first<{id:string}>();
}

export async function setContainerHome(ctx: FeatureContext, id: string, input: HomeInput) {
  if (!input || typeof input.expectedRevisionId !== 'string' || !input.expectedRevisionId ||
      (input.create !== undefined && typeof input.create !== 'boolean') ||
      (input.pageId !== undefined && (typeof input.pageId !== 'string' || !input.pageId)) ||
      (input.create && input.pageId) || (!input.create && input.pageId === undefined)) throw new ApiProblem(400, 'INVALID_HOME', 'Choose an existing page or create a home page.');
  return commitOperation(ctx, {
    operationKey: input.operationKey, action: 'containers.home', request: { id, ...input },
    authorize: async () => { await requireImportPublication(ctx, id); await requireContainerAdministration(ctx, id); },
    prepare: async ({revisionId}) => {
      const container = await ctx.db.prepare('SELECT * FROM containers WHERE id=? AND workspace_id=?').bind(id, ctx.actor.workspaceId).first<{name:string;description:string;archived_at:string|null;trashed_at:string|null}>();
      if (!container) throw new ApiProblem(404, 'NOT_FOUND', 'Not found.');
      if (container.archived_at || container.trashed_at) throw new ApiProblem(409, 'DESTINATION_UNAVAILABLE', 'Restore this space before changing its home.');
      const statements = [mutationGuard(ctx.db, 'SELECT revision_id=? AND archived_at IS NULL AND trashed_at IS NULL FROM containers WHERE id=? AND workspace_id=?', [input.expectedRevisionId, id, ctx.actor.workspaceId])];
      let pageId = input.pageId ?? null;
      if (input.create) {
        await destination(ctx, id);
        const created = await prepareSpaceHome(ctx, {id,...container}, createUlid());
        pageId = created.value.pageId;
        statements.push(...created.statements);
      } else if (pageId) {
        await requirePageLevel(ctx, pageId, 'view');
        if (!await homePage(ctx, id, pageId)) throw new ApiProblem(400, 'INVALID_HOME', 'Choose a live page in this space.');
        statements.push(mutationGuard(ctx.db, "SELECT container_id=? AND workspace_id=? AND page_kind='page' AND lifecycle IN ('live','live-with-unpublished-changes') AND deleted_at IS NULL AND trashed_at IS NULL AND archived_at IS NULL FROM pages WHERE id=?", [id,ctx.actor.workspaceId,pageId]));
      }
      statements.push(ctx.db.prepare('UPDATE containers SET home_page_id=?,revision_id=?,updated_at=? WHERE id=?').bind(pageId, revisionId, ctx.now, id), await containerRevision(ctx, id, revisionId, {...container,home_page_id:pageId,revision_id:revisionId,updated_at:ctx.now}));
      return { statements, entity:{id,kind:'container',revisionId}, value:{pageId,revisionId} };
    },
  });
}
