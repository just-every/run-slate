import type { FeatureContext } from '../../app/feature-context';
import { mutationGuard } from '../../app/operations';
import { ApiProblem } from '../../app/problems';
import { createUlid } from '../../shared/ulid';
import { currentSubject, requireContainerLevel, requirePageLevel } from '../sharing/current-access';
import { sharingConfiguration } from '../sharing/configuration';
import { destination } from '../pages/service';
import { descendants } from '../pages/tree';
import { publicMoveChanges } from '../pages/tree-access';
import { pageRow, pageGuard, writable, snapshot, revisionStatement, contentEvent } from '../pages/repository';
import { contentPolicy } from '../pages/policy';
import type { PageRow } from '../pages/types';
import type { PublicationInput } from './publication-input';
import { publicationAudience } from './publication-audience';

/** Validate in the source location; never let the requested audience authorize its own creation. */
export async function publicationLocation(ctx: FeatureContext, page: PageRow, input: PublicationInput) {
  const target = input.destination ?? { containerId: page.container_id, parentPageId: page.parent_page_id, treePosition: page.tree_position };
  // An in-place legacy publish is authorized by the page's own edit grant.
  if(input.destination) { await requireContainerLevel(ctx, target.containerId, 'edit'); await destination(ctx, target.containerId, target.parentPageId); }
  const container = await ctx.db.prepare('SELECT visibility,archived_at,trashed_at FROM containers WHERE id=? AND workspace_id=?').bind(target.containerId, ctx.actor.workspaceId).first<{visibility:string;archived_at:string|null;trashed_at:string|null}>();
  if (!container) throw new ApiProblem(404, 'NOT_FOUND', 'Not found.');
  if(container.archived_at||container.trashed_at) throw new ApiProblem(409, 'DESTINATION_UNAVAILABLE', 'Choose a live destination.');
  const relocated = target.containerId !== page.container_id || target.parentPageId !== page.parent_page_id;
  const moved = relocated || target.treePosition !== page.tree_position;
  const pages = relocated || input.generalAccess ? await descendants(ctx, page.id) : [page];
  if (target.parentPageId && pages.some(p => p.id === target.parentPageId)) throw new ApiProblem(400, 'TREE_CYCLE', 'A page cannot be its own descendant.');
  for (const p of pages) {
    writable(p);
    if (p.workspace_id !== ctx.actor.workspaceId || p.container_id !== page.container_id) throw new ApiProblem(409, 'INVALID_TREE', 'Repair the page tree before publishing.');
    await requirePageLevel(ctx, p.id, input.generalAccess ? 'full' : 'edit');
  }
  let sharingRevision: string|null|undefined;
  if (input.generalAccess && input.generalAccess.kind !== 'restricted') {
    if (container.visibility === 'personal') throw new ApiProblem(403, 'PERSONAL_PRIVATE', 'A personal container cannot have general access.');
    if ((await currentSubject(ctx)).isGuest) throw new ApiProblem(403, 'GUEST_GENERAL_ACCESS', 'Guests cannot grant general access.');
    const policy = await contentPolicy(ctx);
    if (input.generalAccess.kind !== (policy['page.access.v1'] === 'workspace-general' ? 'workspace' : 'container')) throw new ApiProblem(400, 'GENERAL_ACCESS_PROFILE', 'Choose the general principal configured for this workspace.');
    const configuration=await sharingConfiguration(ctx);
    if(!configuration.levels.includes(input.generalAccess.level)) throw new ApiProblem(400, 'LEVEL_UNAVAILABLE', 'This access level is not configured.');
    sharingRevision=configuration.revisionId;
  }
  if (container.visibility === 'personal' && await ctx.db.prepare("SELECT 1 FROM page_grants WHERE page_id IN (SELECT value FROM json_each(?)) AND principal_kind IN ('workspace','container') AND revoked_at IS NULL AND (page_id<>? OR ?=0) LIMIT 1").bind(JSON.stringify(pages.map(p=>p.id)), page.id, input.generalAccess?.kind === 'restricted' ? 1 : 0).first()) throw new ApiProblem(403, 'PERSONAL_PRIVATE', 'Remove general access before moving into a personal container.');
  const guards: D1PreparedStatement[] = pages.map(p => pageGuard(ctx, p, p.id === page.id ? input.expectedRevisionId : p.revision_id));
  const publicAccess = await publicMoveChanges(ctx, pages, target.containerId);
  guards.push(publicAccess.guard);
  if (relocated) {
    // Relocation is an edit while effective access stays identical. Check every
    // moved page against the real release (including retargeted container grants),
    // and require sharing authority only for pages whose audience changes.
    const audience = await publicationAudience(ctx, page, pages, target, input);
    const changed = new Set(audience.filter(p => p.readers.some(r => r.before !== r.after)).map(p => p.pageId));
    for (const change of publicAccess.changes) changed.add(change.pageId);
    for (const id of changed) await requirePageLevel(ctx, id, 'full');
  }
  if(sharingRevision !== undefined) guards.push(mutationGuard(ctx.db, "SELECT (SELECT id FROM core_entity_revisions WHERE workspace_id=? AND entity_kind='sharing-configuration' AND entity_id=? ORDER BY CAST(json_extract(content_json,'$.configurationSequence') AS INTEGER) DESC,id DESC LIMIT 1) IS ?", [ctx.actor.workspaceId,ctx.actor.workspaceId,sharingRevision]));
  // Restricted inheritance stops ACL traversal, but must never hide a structural cycle.
  const ancestors=new Set<string>([page.id]); let parentId=target.parentPageId;
  while(parentId) {
    if(ancestors.has(parentId)||pages.some(p=>p.id===parentId)) throw new ApiProblem(400, 'TREE_CYCLE', 'A page cannot be its own descendant.');
    ancestors.add(parentId);
    const parent=await pageRow(ctx,parentId); writable(parent);
    if(parent.container_id!==target.containerId) throw new ApiProblem(400, 'INVALID_PARENT', 'Parent belongs to another container.');
    guards.push(pageGuard(ctx,parent,parent.revision_id)); parentId=parent.parent_page_id;
  }
  if (relocated || input.generalAccess) guards.push(mutationGuard(ctx.db, 'SELECT (WITH RECURSIVE tree(id) AS (SELECT id FROM pages WHERE id=? UNION SELECT p.id FROM pages p JOIN tree t ON p.parent_page_id=t.id WHERE p.deleted_at IS NULL) SELECT COUNT(*)=? FROM tree)', [page.id, pages.length]));
  return { target, moved, pages, guards, publicAccess: publicAccess.changes, personal: container.visibility === 'personal' };
}
export async function publicationMoveStatements(ctx: FeatureContext, location: Awaited<ReturnType<typeof publicationLocation>>, rootId: string, revisionId: string) {
  if (!location.moved) return [];
  const statements: D1PreparedStatement[] = [];
  for (const p of location.pages) {
    const rev = p.id === rootId ? revisionId : createUlid();
    statements.push(ctx.db.prepare('UPDATE pages SET container_id=?,parent_page_id=CASE WHEN id=? THEN ? ELSE parent_page_id END,tree_position=CASE WHEN id=? THEN ? ELSE tree_position END,revision_id=?,updated_at=? WHERE id=?').bind(location.target.containerId, rootId, location.target.parentPageId, rootId, location.target.treePosition, rev, ctx.now, p.id));
    // Retained container-general grants follow their own page's new container, never widen to workspace.
    statements.push(ctx.db.prepare("UPDATE page_grants SET principal_id=?,updated_at=? WHERE page_id=? AND principal_kind='container'").bind(location.target.containerId, ctx.now, p.id));
    if (p.id !== rootId) statements.push(await revisionStatement(ctx, p.id, rev, await snapshot(ctx, p)));
    statements.push(...contentEvent(ctx, p.id, rev, 'moved', {}, [p.container_id]));
  }
  return statements;
}
