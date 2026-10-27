import {directory,memberProfile,peopleOnPage} from './directory';
import {saveProfile,profileInput} from './profile';
import { mentionConfiguration, setMentionConfiguration } from '../comments/group-mentions';
import { requireStepUp } from '../session/step-up';
import { listIdentityMail,retryIdentityMail } from '../session/mail-status';
import { requireWorkspaceOwner } from '../sharing/current-access';
import { completeFirstRun,firstRunState } from './bootstrap';
import { invite, revokeInvitation } from './invitations';
import { guestPolicy, saveGuestPolicy } from './guest-policy';
import { listGuests, revokeGuests, setGuestExpiry } from './guests';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnvironment } from '../../app/types';
import { featureContext } from '../../app/feature-context';
import { ApiProblem } from '../../app/problems';
import { readWorkspace, updateWorkspace } from './settings';
import { currentMember, listMembers, removeMember, setTheme, setMemberRole } from './members';
import { listGroups, saveGroup } from './groups';
const op=z.string().min(8).max(160); const id=z.string().min(1).max(128);
const workspaceNameMessage='Workspace names must contain 1–200 characters.';
const workspaceName=z.string().trim().refine(value=>{const length=[...value].length;return length>=1&&length<=200;},workspaceNameMessage);
const toggle=z.enum(['allowed','forbidden']);
const domain=z.string().trim().toLowerCase().regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/).max(253);
const policies=z.object({'page.lifecycle.v1':z.enum(['always-live','draft-then-publish']),'page.access.v1':z.enum(['workspace-general','container-general']),'page.public-access.v1':z.enum(['site','link']),'page.version.v1':z.enum(['autosnapshot','labelled']),'page.status.v1':z.enum(['verification-only','open-vocabulary']),'record.page-parity.v1':z.enum(['record-is-page','record-is-row']),'automation.scope.v1':z.enum(['source','container','site']),'container.access.v1':z.enum(['class-led','grant-led'])}).strict();
export async function parseBody<T>(request:{json:()=>Promise<unknown>},schema:z.ZodType<T>,fieldMessages:Record<string,string>={}):Promise<T>{
 const parsed=schema.safeParse(await request.json().catch(()=>null));
 if(!parsed.success){const field=parsed.error.issues.find(issue=>typeof issue.path[0]==='string'&&Object.hasOwn(fieldMessages,issue.path[0]))?.path[0];throw new ApiProblem(400,'INVALID_REQUEST',typeof field==='string'?fieldMessages[field]:'The request is invalid.');}
 return parsed.data;
}
export function createWorkspaceRoutes(){return new Hono<AppEnvironment>()
.get('/api/workspace/first-run',async c=>c.json(await firstRunState(featureContext(c))))
.post('/api/workspace/first-run',async c=>c.json(await completeFirstRun(featureContext(c),await parseBody(c.req,z.object({operationKey:op,workspaceName,containerName:z.string().trim().min(1).max(160),pageTitle:z.string().trim().min(1).max(500)}).strict(),{workspaceName:workspaceNameMessage}))))
.get('/api/workspace/jobs',async c=>{const ctx=featureContext(c);await requireWorkspaceOwner(ctx);return c.json({items:(await ctx.db.prepare('SELECT id,kind,attempts,state,error_code AS errorCode,updated_at AS updatedAt FROM core_job_failures ORDER BY updated_at DESC LIMIT 100').all()).results});})
.get('/api/workspace/mail',async c=>c.json(await listIdentityMail(featureContext(c))))
.post('/api/workspace/mail/:id/retry',async c=>c.json(await retryIdentityMail(featureContext(c),c.get('runtimeConfig'),c.req.param('id'))))
.get('/api/workspace/mention-configuration',async c=>c.json(await mentionConfiguration(featureContext(c))))
.put('/api/workspace/mention-configuration',async c=>c.json(await setMentionConfiguration(featureContext(c),await parseBody(c.req,z.object({operationKey:op,expectedRevisionId:id.nullable(),restrictLargeGroups:z.boolean()}).strict()))))
.get('/api/workspace',async c=>c.json(await readWorkspace(featureContext(c))))
.put('/api/workspace',async c=>c.json(await updateWorkspace(featureContext(c),await parseBody(c.req,z.object({operationKey:op,expectedRevisionId:id,name:workspaceName,mark:z.string().max(2048),description:z.string().max(2000),guestAccess:toggle,publicLinkAccess:toggle,anonymousAccess:toggle,policies}).strict(),{name:workspaceNameMessage}))))
.get('/api/people',async c=>c.json(await directory(featureContext(c),{q:c.req.query('q')})))
.get('/api/people/:id',async c=>c.json(await memberProfile(featureContext(c),c.req.param('id'),c.req.query('pageId'))))
.put('/api/people/:id',async c=>c.json(await saveProfile(featureContext(c),c.req.param('id'),await parseBody(c.req,profileInput))))
.get('/api/pages/:pageId/people',async c=>c.json(await peopleOnPage(featureContext(c),c.req.param('pageId'))))
.get('/api/members/current',async c=>c.json(await currentMember(featureContext(c))))
.put('/api/members/current/theme',async c=>c.json(await setTheme(featureContext(c),await parseBody(c.req,z.object({operationKey:op,theme:z.enum(['light','dark','system'])}).strict()))))
.get('/api/members',async c=>c.json(await listMembers(featureContext(c),'member')))
.put('/api/members/:id/role',async c=>{const input=await parseBody(c.req,z.object({operationKey:op,expectedRole:z.enum(['owner','member']),role:z.enum(['owner','member'])}).strict());await requireWorkspaceOwner(featureContext(c));await requireStepUp(c,'owner:transfer');return c.json(await setMemberRole(featureContext(c),{...input,memberId:c.req.param('id')}));})
.get('/api/guests',async c=>c.json(await listGuests(featureContext(c))))
.put('/api/guests/:id/expiry',async c=>c.json(await setGuestExpiry(featureContext(c),{...await parseBody(c.req,z.object({operationKey:op,expiresAt:z.string().datetime().nullable()}).strict()),memberId:c.req.param('id')})))
.get('/api/guests/policy',async c=>c.json(await guestPolicy(featureContext(c))))
.put('/api/guests/policy',async c=>c.json(await saveGuestPolicy(featureContext(c),await parseBody(c.req,z.object({operationKey:op,defaultExpiryDays:z.number().int().min(1).max(3650).nullable(),allowedDomains:z.array(domain).max(100),deniedDomains:z.array(domain).max(100)}).strict()))))
.post('/api/guests/revoke',async c=>c.json(await revokeGuests(featureContext(c),await parseBody(c.req,z.object({operationKey:op.max(150),memberIds:z.array(id).min(1).max(100)}).strict()))))
.post('/api/members/remove',async c=>{const input=await parseBody(c.req,z.object({operationKey:op,memberId:id,erase:z.boolean().optional()}).strict());const ctx=featureContext(c),target=await c.env.DB.prepare("SELECT role,is_setup_owner FROM members WHERE id=? AND status='active'").bind(input.memberId).first<{role:string;is_setup_owner:number}>();if(input.erase||target?.role==='owner'){
  // Refuse what can never succeed before emailing a step-up confirmation; the service checks both again.
  if(input.memberId!==ctx.actor.id){await requireWorkspaceOwner(ctx);if(target?.is_setup_owner)throw new ApiProblem(403,'SETUP_OWNER','Only the setup owner can remove themselves.');}
  await requireStepUp(c,input.erase?'delete':'owner:transfer');}return c.json(await removeMember(featureContext(c),input));})
.post('/api/invitations',async c=>c.json(await invite(featureContext(c),c.get('runtimeConfig'),await parseBody(c.req,z.object({operationKey:op,email:z.string().email().max(254),kind:z.enum(['member','guest']),pageId:id.optional(),containerId:id.optional(),level:z.enum(['full','edit','comment','view']).optional(),expiresAt:z.string().datetime().nullable().optional()}).strict()))))
.post('/api/invitations/revoke',async c=>c.json(await revokeInvitation(featureContext(c),await parseBody(c.req,z.object({operationKey:op,id}).strict()))))
.get('/api/groups',async c=>c.json(await listGroups(featureContext(c))))
.post('/api/groups',async c=>c.json(await saveGroup(featureContext(c),await parseBody(c.req,z.object({operationKey:op,id:id.optional(),expectedRevisionId:id.optional(),name:z.string().trim().min(1).max(160),memberIds:z.array(id).max(1000),remove:z.boolean().optional()}).strict()))));}
