import type {AppBindings} from '../../app/types';
import type {FeatureContext} from '../../app/feature-context';
import type {Principal} from '../../../../modules/agent-door/index.ts';
import {ApiProblem} from '../../app/problems';
import {agentScopeSchema,credentialFromHeaders,authenticateExternalAgent} from '../external-agent/credentials';
import {currentSubject} from '../sharing/current-access';

// These are persisted SDK purposes. They map onto the shared registry without
// granting a status-only credential the other actions of an aggregate tool.
export const sdkScopes:Record<string,string>={read_evidence:'slate.evidence.read',ask:'slate.runs.start',successor_run:'slate.runs.start',run_status:'slate.runs.read',pause_run:'slate.runs.manage',resume_run:'slate.runs.manage',cancel_run:'slate.runs.manage',refine_run:'slate.runs.manage',review_run:'slate.runs.manage',accept_changes:'slate.proposals.apply',prepare_effect:'slate.effects.manage',dispatch_effect:'slate.effects.manage',reconcile_effect:'slate.effects.manage',inquiry_status:'slate.inquiries.read'};
export async function sdkCredentials(env:AppBindings,request:Request) {
 if(!/^Bearer slate_[a-f0-9]{64}$/.test(request.headers.get('authorization')??''))return null;
 const credential=await credentialFromHeaders(env.DB,request.headers,new Date().toISOString());
 const person=await authenticateExternalAgent(env.DB,request.headers);
 if(!credential||!person)return null;
 const scope=agentScopeSchema.safeParse(JSON.parse(credential.scope_json));if(!scope.success)return null;
 return {sponsor:{id:person.id},agent:{id:'sdk:'+credential.id,name:'Native SDK client',specialist:'wiki curator'},clientId:'sdk:'+credential.id,scopes:[...new Set(scope.data.tools.map(tool=>sdkScopes[tool]!))]};
}
export async function nativeSdkGrant(env:AppBindings,principal:Pick<Principal,'person'|'clientId'>) {
 if(!principal.clientId?.startsWith('sdk:'))return null;
 const id=principal.clientId.slice(4);
 const row=await env.DB.prepare(`SELECT c.scope_json,c.workspace_id,c.subject_id,c.expires_at,c.revoked_at FROM intelligence_agent_credentials c JOIN members issuer ON issuer.id=c.owner_id AND issuer.workspace_id=c.workspace_id AND issuer.status='active' AND issuer.role='owner' WHERE c.id=?`).bind(id).first<{scope_json:string;workspace_id:string;subject_id:string;expires_at:string;revoked_at:string|null}>();
 const scope=row?agentScopeSchema.safeParse(JSON.parse(row.scope_json)):null;
 return {id,valid:!!row&&row.subject_id===principal.person.id&&!row.revoked_at&&row.expires_at>new Date().toISOString()&&scope?.success===true,json:row?.scope_json??'',scope:scope?.success?scope.data:null};
}
export async function authorizeSdk(ctx:FeatureContext,purpose:keyof typeof sdkScopes,sourceIds:string[],audience:string[],grantId?:string) {
 if(!ctx.agentCredentialId)return;
 await currentSubject(ctx);
 const row=await ctx.db.prepare(`SELECT c.scope_json FROM intelligence_agent_credentials c JOIN members issuer ON issuer.id=c.owner_id AND issuer.workspace_id=c.workspace_id AND issuer.status='active' AND issuer.role='owner' WHERE c.id=? AND c.subject_id=? AND c.workspace_id=? AND c.revoked_at IS NULL AND c.expires_at>?`).bind(ctx.agentCredentialId,ctx.actor.id,ctx.actor.workspaceId,ctx.now).first<{scope_json:string}>();
 const scope=row?agentScopeSchema.safeParse(JSON.parse(row.scope_json)):null;
 if(!scope?.success||!scope.data.tools.includes(purpose as typeof scope.data.tools[number])||sourceIds.some(id=>!scope.data.sourceIds.includes(id))||audience.some(id=>!scope.data.audience.includes(id))||grantId&&!scope.data.grantIds.includes(grantId))throw new ApiProblem(403,'AGENT_SCOPE','This action exceeds the original native SDK purpose.');
}
