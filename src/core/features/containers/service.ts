import {requireGovernance} from '../workspace/governance';
import {requireImportPublication} from '../imports/publication';
import type { FeatureContext } from '../../app/feature-context';
import { commitOperation, mutationGuard, requestHash } from '../../app/operations';
import { ApiProblem } from '../../app/problems';
import { createUlid } from '../../shared/ulid';
import { currentSubject, requireContainerLevel, requireWorkspaceOwner } from '../sharing/current-access';
import { prepareSpaceHome } from './create-home';
export interface ContainerInput {
    operationKey: string;
    id?: string;
    name: string;
    description?: string;
    key?: string | null;
    icon?: string | null;
    visibility?: 'default' | 'open' | 'closed' | 'private' | 'personal';
}
export async function authorizeContainerCreation(ctx: FeatureContext) {
    await requireGovernance(ctx,'createContainers');
    const s = await currentSubject(ctx);
    if (s.isGuest)
        throw new ApiProblem(403, 'FORBIDDEN', 'Guests cannot create containers.');
    const w = await ctx.db.prepare('SELECT member_container_creation FROM workspaces WHERE id=?').bind(ctx.actor.workspaceId).first<{
        member_container_creation: string;
    }>();
    if (ctx.actor.role !== 'owner' && w?.member_container_creation !== 'allowed')
        throw new ApiProblem(403, 'FORBIDDEN', 'Container creation is limited to workspace owners.');
}
export async function prepareCreateContainer(ctx: FeatureContext, input: ContainerInput, revisionId: string, homePageId?: string) {
    if (!input.name?.trim() || input.name.length > 200)
        throw new ApiProblem(400, 'INVALID_CONTAINER', 'Name is required and limited to 200 characters.');
    if (input.visibility && !['default', 'open', 'closed', 'private', 'personal'].includes(input.visibility))
        throw new ApiProblem(400, 'INVALID_VISIBILITY', 'Unknown visibility.');
    if (input.visibility === 'personal')
        throw new ApiProblem(403, 'PERSONAL_CONTAINER_PROTECTED', 'Personal containers are created with membership.');
    const id = input.id ?? createUlid(), visibility = input.visibility ?? 'default';
    const statements = [ctx.db.prepare('INSERT INTO containers (id,workspace_id,key,icon,name,description,visibility,created_at,updated_at,revision_id) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(id, ctx.actor.workspaceId, input.key ?? null, input.icon ?? null, input.name, input.description ?? '', visibility, ctx.now, ctx.now, revisionId), ctx.db.prepare('INSERT INTO container_owners VALUES (?,?,?)').bind(id, ctx.actor.id, ctx.now), ctx.db.prepare('INSERT INTO container_members VALUES (?,?,?)').bind(id, ctx.actor.id, ctx.now), ctx.db.prepare('INSERT INTO container_grants (id,container_id,principal_kind,principal_id,level,created_at,updated_at) VALUES (?,?,\'member\',?,\'full\',?,?)').bind(createUlid(), id, ctx.actor.id, ctx.now, ctx.now)];
    if (['default', 'open'].includes(visibility))
        statements.push(ctx.db.prepare("INSERT INTO container_grants (id,container_id,principal_kind,principal_id,level,created_at,updated_at) VALUES (?,?,'workspace',?,'edit',?,?)").bind(createUlid(), id, ctx.actor.workspaceId, ctx.now, ctx.now));
    statements.push(await containerRevision(ctx, id, revisionId, {...input,...(homePageId ? {homePageId} : {})}));
    return { statements, entity: { id, kind: 'container', revisionId }, value: { id, name: input.name, revisionId } };
}
export async function createContainer(ctx: FeatureContext, input: ContainerInput) {
    return commitOperation(ctx, { operationKey:input.operationKey,action:'containers.create',request:input,authorize:() => authorizeContainerCreation(ctx),prepare:async ({revisionId}) => {
        const homePageId=createUlid();
        const plan=await prepareCreateContainer(ctx,input,revisionId,homePageId);
        const home=await prepareSpaceHome(ctx,{id:plan.value.id,name:input.name,description:input.description},homePageId,true);
        plan.statements.push(...home.statements,ctx.db.prepare('UPDATE containers SET home_page_id=? WHERE id=?').bind(homePageId,plan.value.id));
        return {...plan,value:{...plan.value,homePageId}};
    }});
}
export async function containerRevision(ctx: FeatureContext, id: string, revisionId: string, value: unknown) { return ctx.db.prepare('INSERT INTO record_revisions (id,workspace_id,entity_kind,entity_id,content_hash,content_json,author_member_id,created_at) VALUES (?,?,?,?,?,?,?,?)').bind(revisionId, ctx.actor.workspaceId, 'container', id, await requestHash(value), JSON.stringify(value), ctx.actor.id, ctx.now); }
export { containerIndex as listContainers, readContainer } from './queries';
export async function updateContainer(ctx: FeatureContext, id: string, input: {
    operationKey: string;
    expectedRevisionId: string;
    name?: string;
    description?: string;
    icon?: string | null;
    key?: string | null;
}) {
    return commitOperation(ctx, { operationKey: input.operationKey, action: 'containers.update', request: { id, ...input }, authorize: async () => {
            await requireImportPublication(ctx,id);
            try {
                await requireContainerLevel(ctx, id, 'full');
            }
            catch {
                await requireWorkspaceOwner(ctx);
            }
        }, prepare: async ({ revisionId }) => {
            const c = await ctx.db.prepare('SELECT * FROM containers WHERE id=? AND workspace_id=?').bind(id, ctx.actor.workspaceId).first<Record<string, any>>();
            if (!c)
                throw new ApiProblem(404, 'NOT_FOUND', 'Not found.');
            const v = { ...c, ...input };
            if (!v.name || v.name.length > 200)
                throw new ApiProblem(400, 'INVALID_CONTAINER', 'Invalid name.');
            return { statements: [mutationGuard(ctx.db, 'SELECT revision_id=? FROM containers WHERE id=?', [input.expectedRevisionId, id]), ctx.db.prepare('UPDATE containers SET name=?,description=?,icon=?,key=?,revision_id=?,updated_at=? WHERE id=?').bind(v.name, v.description, v.icon, v.key, revisionId, ctx.now, id), await containerRevision(ctx, id, revisionId, v)], entity: { id, kind: 'container', revisionId }, value: { id, revisionId } };
        } });
}
