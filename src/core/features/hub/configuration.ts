import type { FeatureContext } from '../../app/feature-context';
import { commitOperation, mutationGuard, requestHash } from '../../app/operations';
import { ApiProblem } from '../../app/problems';
import { requireWorkspaceOwner } from '../sharing/current-access';
import { hubPages } from './pages';
import type { HubConfiguration, HubEditorView } from './types';

export const hubSections = ['linkPageIds', 'announcementPageIds', 'keyPageIds'] as const;

export function validateHub(value: unknown): HubConfiguration {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiProblem(400, 'INVALID_HUB', 'Supply the hub settings.');
  const config = value as HubConfiguration;
  if (typeof config.title !== 'string' || !config.title.trim() || config.title.length > 200 || typeof config.description !== 'string' || config.description.length > 4000)
    throw new ApiProblem(400, 'INVALID_HUB', 'Give the hub a short title and a description of at most 4,000 characters.');
  for (const field of hubSections) {
    const ids = config[field];
    if (!Array.isArray(ids) || ids.length > 20 || ids.some(id => typeof id !== 'string' || !id || id.length > 160) || new Set(ids).size !== ids.length)
      throw new ApiProblem(400, 'INVALID_HUB', 'Each hub section holds up to twenty different pages.');
  }
  return {title:config.title.trim(),description:config.description,...Object.fromEntries(hubSections.map(field => [field,config[field]]))} as HubConfiguration;
}

export async function storedHub(ctx: FeatureContext) {
  const row = await ctx.db.prepare('SELECT company_hub_json,company_hub_revision_id FROM workspaces WHERE id=?').bind(ctx.actor.workspaceId).first<{company_hub_json:string;company_hub_revision_id:string|null}>();
  if (!row) throw new ApiProblem(404, 'NOT_FOUND', 'Not found.');
  return {configuration:validateHub(JSON.parse(row.company_hub_json)),revisionId:row.company_hub_revision_id};
}

export async function hubEditor(ctx: FeatureContext): Promise<HubEditorView> {
  await requireWorkspaceOwner(ctx);
  const stored = await storedHub(ctx), ids = hubSections.flatMap(field => stored.configuration[field]);
  const readable = new Set((await hubPages(ctx, ids)).map(p => p.id));
  const configuration = {...stored.configuration};
  let unavailableSelections = 0;
  for (const field of hubSections) {
    configuration[field] = stored.configuration[field].filter(id => readable.has(id));
    unavailableSelections += stored.configuration[field].length - configuration[field].length;
  }
  return {configuration,revisionId:stored.revisionId,unavailableSelections};
}

export async function updateHub(ctx: FeatureContext, input: {operationKey:string;expectedRevisionId:string|null;configuration:HubConfiguration}) {
  if (!input || (input.expectedRevisionId !== null && typeof input.expectedRevisionId !== 'string')) throw new ApiProblem(400, 'INVALID_HUB', 'Supply the hub revision you opened.');
  const configuration = validateHub(input.configuration);
  return commitOperation(ctx, {operationKey:input.operationKey,action:'hub.update',request:input,authorize:() => requireWorkspaceOwner(ctx),prepare:async ({revisionId}) => {
    const selected = [...new Set(hubSections.flatMap(field => configuration[field]))];
    const pages = new Map((await hubPages(ctx, selected)).map(p => [p.id,p]));
    if (selected.some(id => !pages.has(id))) throw new ApiProblem(400, 'HUB_PAGE_UNAVAILABLE', 'Choose live pages you can read.');
    if (configuration.announcementPageIds.some(id => !pages.get(id)!.isPost)) throw new ApiProblem(400, 'HUB_POST_REQUIRED', 'Announcements must be published blog posts.');
    // Keep selected key pages when they lapse; they disappear for readers until verified again.
    const json = JSON.stringify(configuration);
    return {
      statements:[mutationGuard(ctx.db, 'SELECT company_hub_revision_id IS ? FROM workspaces WHERE id=?', [input.expectedRevisionId,ctx.actor.workspaceId]),
        ...selected.map(id => mutationGuard(ctx.db, "SELECT workspace_id=? AND lifecycle IN ('live','live-with-unpublished-changes') AND deleted_at IS NULL AND trashed_at IS NULL AND archived_at IS NULL FROM pages WHERE id=?", [ctx.actor.workspaceId,id])),
        ctx.db.prepare('UPDATE workspaces SET company_hub_json=?,company_hub_revision_id=? WHERE id=?').bind(json,revisionId,ctx.actor.workspaceId),
        ctx.db.prepare('INSERT INTO core_entity_revisions (id,workspace_id,entity_kind,entity_id,content_hash,content_json,author_member_id,created_at) VALUES (?,?,?,?,?,?,?,?)').bind(revisionId,ctx.actor.workspaceId,'company-hub',ctx.actor.workspaceId,await requestHash(configuration),json,ctx.actor.id,ctx.now)],
      entity:{id:ctx.actor.workspaceId,kind:'company-hub',revisionId},value:{revisionId},
    };
  }});
}
