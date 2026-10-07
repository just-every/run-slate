import { listIdentityMail,retryIdentityMail } from '../session/mail-status';
import { requireWorkspaceOwner } from '../sharing/current-access';
import { completeFirstRun,firstRunState } from './bootstrap';
import { invite, revokeInvitation } from './invitations';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnvironment } from '../../app/types';
import { featureContext } from '../../app/feature-context';
import { ApiProblem } from '../../app/problems';
import { readWorkspace, updateWorkspace } from './settings';
import { currentMember, listMembers, removeMember, setTheme, setMemberRole } from './members';
import { listGroups, saveGroup } from './groups';
const op=z.string().min(8).max(160); const id=z.string().min(1).max(128);
const toggle=z.enum(['allowed','forbidden']);
const policies=z.object({'page.lifecycle.v1':z.enum(['always-live','draft-then-publish']),'page.access.v1':z.enum(['workspace-general','container-general']),'page.public-access.v1':z.enum(['site','link']),'page.version.v1':z.enum(['autosnapshot','labelled']),'page.status.v1':z.enum(['verification-only','open-vocabulary']),'record.page-parity.v1':z.enum(['record-is-page','record-is-row']),'automation.scope.v1':z.enum(['source','container','site']),'container.access.v1':z.enum(['class-led','grant-led'])}).strict();
export async function parseBody<T>(request:{json:()=>Promise<unknown>},schema:z.ZodType<T>):Promise<T>{const parsed=schema.safeParse(await request.json().catch(()=>null));if(!parsed.success)throw new ApiProblem(400,'INVALID_REQUEST','The request is invalid.');return parsed.data;}
export function createWorkspaceRoutes(){return new Hono<AppEnvironment>()
.get('/api/workspace/first-run',async c=>c.json(await firstRunState(featureContext(c))))
.post('/api/workspace/first-run',async c=>c.json(await completeFirstRun(featureContext(c),await parseBody(c.req,z.object({operationKey:op,workspaceName:z.string().trim().min(1).max(160),containerName:z.string().trim().min(1).max(160),pageTitle:z.string().trim().min(1).max(500)}).strict()))))
.get('/api/workspace/jobs',async c=>{const ctx=featureContext(c);await requireWorkspaceOwner(ctx);return c.json({items:(await ctx.db.prepare('SELECT id,kind,attempts,state,error_code AS errorCode,updated_at AS updatedAt FROM core_job_failures ORDER BY updated_at DESC LIMIT 100').all()).results});})
.get('/api/workspace/mail',async c=>c.json(await listIdentityMail(featureContext(c))))
.post('/api/workspace/mail/:id/retry',async c=>c.json(await retryIdentityMail(featureContext(c),c.get('runtimeConfig'),c.req.param('id'))))
.get('/api/workspace',async c=>c.json(await readWorkspace(featureContext(c))))
.put('/api/workspace',async c=>c.json(await updateWorkspace(featureContext(c),await parseBody(c.req,z.object({operationKey:op,expectedRevisionId:id,name:z.string().trim().min(1).max(160),mark:z.string().max(2048),description:z.string().max(2000),guestAccess:toggle,publicLinkAccess:toggle,anonymousAccess:toggle,policies}).strict()))))
.get('/api/members/current',async c=>c.json(await currentMember(featureContext(c))))
.put('/api/members/current/theme',async c=>c.json(await setTheme(featureContext(c),await parseBody(c.req,z.object({operationKey:op,theme:z.enum(['light','dark','system'])}).strict()))))
.get('/api/members',async c=>c.json(await listMembers(featureContext(c),'member')))
.put('/api/members/:id/role',async c=>c.json(await setMemberRole(featureContext(c),{...await parseBody(c.req,z.object({operationKey:op,expectedRole:z.enum(['owner','member']),role:z.enum(['owner','member'])}).strict()),memberId:c.req.param('id')})))
.get('/api/guests',async c=>c.json(await listMembers(featureContext(c),'guest')))
.post('/api/members/remove',async c=>c.json(await removeMember(featureContext(c),await parseBody(c.req,z.object({operationKey:op,memberId:id,erase:z.boolean().optional()}).strict()))))
.post('/api/invitations',async c=>c.json(await invite(featureContext(c),c.get('runtimeConfig'),await parseBody(c.req,z.object({operationKey:op,email:z.string().email().max(254),kind:z.enum(['member','guest']),pageId:id.optional(),containerId:id.optional(),level:z.enum(['full','edit','comment','view']).optional(),expiresAt:z.string().datetime().nullable().optional()}).strict()))))
.post('/api/invitations/revoke',async c=>c.json(await revokeInvitation(featureContext(c),await parseBody(c.req,z.object({operationKey:op,id}).strict()))))
.get('/api/groups',async c=>c.json(await listGroups(featureContext(c))))
.post('/api/groups',async c=>c.json(await saveGroup(featureContext(c),await parseBody(c.req,z.object({operationKey:op,id:id.optional(),expectedRevisionId:id.optional(),name:z.string().trim().min(1).max(160),memberIds:z.array(id).max(1000),remove:z.boolean().optional()}).strict()))));}
