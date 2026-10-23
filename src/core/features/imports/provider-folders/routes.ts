import {browseFiles} from '../../editor/file-cards/service';
import {previewProviderFolder} from './preview';
import {resolveCurrentAccessMany} from '../../sharing/current-access';
import {Hono} from 'hono';
import {z} from 'zod';
import type {AppEnvironment} from '../../../app/types';
import {featureContext} from '../../../app/feature-context';
import {currentSubject,requireWorkspaceOwner} from '../../sharing/current-access';
import {requireStepUp} from '../../session/step-up';
import {connectFolder,disconnectFolder,setFolderPolicy} from './connections';
import {importProviderFolder,readFolderRun} from './service';
const provider=z.enum(['google-drive','sharepoint']);
const operationKey=z.string().regex(/^[A-Za-z0-9_.:-]{8,160}$/);
export function createProviderFolderRoutes(){
 const r=new Hono<AppEnvironment>();
 r.get('/',async c=>{const ctx=featureContext(c);await currentSubject(ctx);const [policies,connections,runs]=await Promise.all([
  ctx.db.prepare('SELECT provider,enabled,revision_id AS revisionId FROM provider_folder_policies WHERE workspace_id=?').bind(ctx.actor.workspaceId).all(),
  ctx.db.prepare('SELECT id,provider,label,drive_id AS driveId,state,revision_id AS revisionId FROM provider_folder_connections WHERE workspace_id=? AND member_id=? ORDER BY created_at DESC').bind(ctx.actor.workspaceId,ctx.actor.id).all(),
  ctx.db.prepare('SELECT id,state,created_at AS createdAt FROM provider_folder_runs WHERE workspace_id=? AND actor_id=? ORDER BY created_at DESC LIMIT 50').bind(ctx.actor.workspaceId,ctx.actor.id).all(),
 ]);return c.json({policies:policies.results,connections:connections.results,runs:runs.results});});
 r.get('/files',async c=>{const input=z.object({connectionId:z.string().min(1).max(160),folderId:z.string().min(1).max(200).default('root')}).parse(c.req.query());c.header('Cache-Control','private, no-store');return c.json(await browseFiles(featureContext(c),input.connectionId,input.folderId));});
 r.get('/destinations',async c=>{const ctx=featureContext(c),rows=(await ctx.db.prepare('SELECT id,title,revision_id AS revisionId FROM pages WHERE workspace_id=? AND deleted_at IS NULL AND archived_at IS NULL AND trashed_at IS NULL AND locked_at IS NULL ORDER BY title').bind(ctx.actor.workspaceId).all<{id:string;title:string;revisionId:string}>()).results,access=await resolveCurrentAccessMany(ctx,rows.map(row=>row.id));return c.json({items:rows.filter(row=>['full','edit'].includes(access.get(row.id)?.decision.level??''))});});
 r.post('/preview',async c=>{const input=z.object({connectionId:z.string(),folderId:z.string().min(1).max(200),destination:z.object({pageId:z.string(),expectedRevisionId:z.string()})}).parse(await c.req.json());return c.json(await previewProviderFolder(featureContext(c),input));});
 r.put('/policy',async c=>{const input=z.object({operationKey,provider,enabled:z.boolean()}).parse(await c.req.json());await requireWorkspaceOwner(featureContext(c));await requireStepUp(c,'credentials:mint');return c.json(await setFolderPolicy(featureContext(c),input));});
 r.post('/connections',async c=>{const input=z.object({operationKey,provider,token:z.string().min(1).max(10000),driveId:z.string().min(1).max(200).optional()}).parse(await c.req.json());await requireStepUp(c,'credentials:mint');return c.json(await connectFolder(featureContext(c),input));});
 r.delete('/connections/:id',async c=>{const input=z.object({operationKey,expectedRevisionId:z.string()}).parse(await c.req.json());return c.json(await disconnectFolder(featureContext(c),{...input,id:c.req.param('id')}));});
 r.post('/runs',async c=>{const input=z.object({operationKey,previewFingerprint:z.string().min(1),connectionId:z.string(),folderId:z.string().min(1).max(200),destination:z.object({pageId:z.string(),expectedRevisionId:z.string()})}).parse(await c.req.json());return c.json(await importProviderFolder(featureContext(c),input));});
 r.post('/runs/:id/resume',async c=>c.json(await readFolderRun(featureContext(c),c.req.param('id'))));
 r.get('/runs/:id',async c=>c.json(await readFolderRun(featureContext(c),c.req.param('id'))));
 return r;
}
