import {Hono} from 'hono';
import {z} from 'zod';
import type {AppEnvironment} from '../../app/types';
import {featureContext} from '../../app/feature-context';
import {requireStepUp} from '../session/step-up';
import {codeMember,connectCode,disconnectCode} from './connections';
const operationKey=z.string().regex(/^[A-Za-z0-9_.:-]{8,160}$/);
export function createCodeConnectionRoutes(){
 const r=new Hono<AppEnvironment>();
 r.use('*',async(c,next)=>{c.header('Cache-Control','private, no-store');await next();});
 r.get('/',async c=>{const ctx=featureContext(c);await codeMember(ctx);const rows=await ctx.db.prepare('SELECT id,provider,label,state,revision_id AS revisionId FROM code_embed_connections WHERE workspace_id=? AND member_id=? ORDER BY provider').bind(ctx.actor.workspaceId,ctx.actor.id).all();return c.json({connections:rows.results});});
 r.post('/',async c=>{const input=z.object({operationKey,provider:z.enum(['github','gitlab']),token:z.string().min(1).max(10000)}).strict().parse(await c.req.json());await requireStepUp(c,'credentials:mint');return c.json(await connectCode(featureContext(c),input));});
 r.delete('/:id',async c=>{const input=z.object({operationKey,expectedRevisionId:z.string().min(1).max(160)}).strict().parse(await c.req.json());return c.json(await disconnectCode(featureContext(c),{...input,id:c.req.param('id')}));});
 return r;
}
