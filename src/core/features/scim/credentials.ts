import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { AppEnvironment } from '../../app/types';
import { featureContext, type FeatureContext } from '../../app/feature-context';
import { commitOperation, mutationGuard } from '../../app/operations';
import { ApiProblem } from '../../app/problems';
import { createOpaqueToken, sha256 } from '../../platform/auth/token';
import { createUlid } from '../../shared/ulid';
import { requireWorkspaceOwner } from '../sharing/current-access';
import { requireStepUp } from '../session/step-up';
import { registerActivityResolver } from '../activity/service';
import { permitted } from '../search/visibility';
import { ownerGuard } from './context';
const inputSchema = z.object({ operationKey: z.string().min(8).max(160), name: z.string().trim().min(1).max(80) }).strict();
const operationSchema = z.object({ operationKey: z.string().min(8).max(160) }).strict();
async function adminContext(c: Context<AppEnvironment>, sensitive = false): Promise<FeatureContext> {
  if (!c.get('sessionId')) throw new ApiProblem(401,'UNAUTHENTICATED','A native owner session is required.');
  await requireWorkspaceOwner(featureContext(c));
  if (sensitive) await requireStepUp(c, 'credentials:mint');
  const ctx = featureContext(c);
  ctx.credentialGuard = () => ownerGuard(ctx);
  return ctx;
}
async function grant(ctx: FeatureContext, raw: unknown, rotateId?: string) {
  const input = inputSchema.parse(raw), id = rotateId ?? createUlid(), secret = createOpaqueToken(), issuance = createUlid();
  const hash = await sha256(secret);
  const result = await commitOperation(ctx, { operationKey: input.operationKey, action: rotateId ? 'scim.rotate' : 'scim.grant', request: { ...input, id: rotateId ?? null }, authorize: () => requireWorkspaceOwner(ctx), prepare: async ({ revisionId }) => {
    if (rotateId && !await ctx.db.prepare('SELECT id FROM scim_credentials WHERE id=? AND workspace_id=?').bind(id,ctx.actor.workspaceId).first()) throw new ApiProblem(404,'NOT_FOUND','SCIM credential not found.');
    return { entity:{id,kind:'scim-credential',revisionId}, value:{id,name:input.name,issuance}, detail:{name:input.name}, statements: [ownerGuard(ctx), ...(rotateId ? [ctx.db.prepare('UPDATE scim_credentials SET owner_member_id=?,name=?,token_hash=?,revoked_at=NULL,updated_at=? WHERE id=? AND workspace_id=?').bind(ctx.actor.id,input.name,hash,ctx.now,id,ctx.actor.workspaceId)] : [ctx.db.prepare('INSERT INTO scim_credentials (id,workspace_id,owner_member_id,name,token_hash,created_at,updated_at) VALUES (?,?,?,?,?,?,?)').bind(id,ctx.actor.workspaceId,ctx.actor.id,input.name,hash,ctx.now,ctx.now)])] };
  } });
  return { ...result, ...(result.value.issuance === issuance ? { secret } : {}) };
}
export function createScimAdminRoutes() {
  registerActivityResolver('scim-credential', async ctx => permitted(() => requireWorkspaceOwner(ctx)));
  return new Hono<AppEnvironment>()
    .get('/', async c => { const ctx = await adminContext(c); return c.json({items:(await ctx.db.prepare('SELECT c.id,c.owner_member_id AS ownerMemberId,m.display_name AS ownerName,c.name,c.created_at AS createdAt,c.updated_at AS updatedAt,c.last_used_at AS lastUsedAt,c.revoked_at AS revokedAt FROM scim_credentials c JOIN members m ON m.id=c.owner_member_id WHERE c.workspace_id=? ORDER BY c.created_at,c.id').bind(ctx.actor.workspaceId).all()).results}); })
    .post('/', async c => c.json(await grant(await adminContext(c,true),await c.req.json())))
    .post('/:id/rotate', async c => c.json(await grant(await adminContext(c,true),await c.req.json(),c.req.param('id'))))
    .post('/:id/revoke', async c => {
      const ctx = await adminContext(c,true), {operationKey} = operationSchema.parse(await c.req.json()), id = c.req.param('id');
      return c.json(await commitOperation(ctx,{operationKey,action:'scim.revoke',request:{id},authorize:()=>requireWorkspaceOwner(ctx),prepare:async({revisionId})=>{
        const row=await ctx.db.prepare('SELECT name FROM scim_credentials WHERE id=? AND workspace_id=?').bind(id,ctx.actor.workspaceId).first<{name:string}>();
        if(!row)throw new ApiProblem(404,'NOT_FOUND','SCIM credential not found.');
        return {entity:{id,kind:'scim-credential',revisionId},value:{revoked:true},detail:{name:row.name},statements:[ownerGuard(ctx),mutationGuard(ctx.db,'SELECT workspace_id=? FROM scim_credentials WHERE id=?',[ctx.actor.workspaceId,id]),ctx.db.prepare('UPDATE scim_credentials SET token_hash=NULL,revoked_at=COALESCE(revoked_at,?),updated_at=? WHERE id=?').bind(ctx.now,ctx.now,id)]};
      }}));
    });
}
