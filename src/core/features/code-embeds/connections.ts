import type {FeatureContext} from '../../app/feature-context';
import {ApiProblem} from '../../app/problems';
import {commitOperation,mutationGuard,requestHash} from '../../app/operations';
import {encryptSecret,decryptSecret} from '../../platform/secrets/custody';
import {currentSubject} from '../sharing/current-access';
import {identityRevision} from '../workspace/revisions';
import {codeIdentity} from './http';
import type {CodeProvider} from './reference';
export interface CodeConnection{id:string;workspace_id:string;member_id:string;provider:CodeProvider;principal_id:string;verified_email:string;label:string;credential_ciphertext:string|null;state:'connected'|'disconnected';revision_id:string}
export async function codeMember(ctx:FeatureContext){
 ctx.authorizationEpoch=undefined;
 const subject=await currentSubject(ctx);
 if(subject.isGuest)throw new ApiProblem(403,'FORBIDDEN','Only full members can connect code accounts.');
 const member=await ctx.db.prepare("SELECT email FROM members WHERE id=? AND workspace_id=? AND status='active' AND member_kind='member'").bind(ctx.actor.id,ctx.actor.workspaceId).first<{email:string}>();
 if(!member)throw new ApiProblem(403,'FORBIDDEN','Your membership changed.');
 return member;
}
const scope=(row:Pick<CodeConnection,'id'|'workspace_id'|'member_id'|'provider'>)=>'code-embed:'+row.workspace_id+':'+row.member_id+':'+row.provider+':'+row.id;
const guard=(ctx:FeatureContext,email:string)=>mutationGuard(ctx.db,"SELECT EXISTS(SELECT 1 FROM members WHERE id=? AND workspace_id=? AND status='active' AND member_kind='member' AND lower(email)=?)",[ctx.actor.id,ctx.actor.workspaceId,email.toLowerCase()]);
export async function connectCode(ctx:FeatureContext,input:{operationKey:string;provider:CodeProvider;token:string}){
 const member=await codeMember(ctx);
 if(!ctx.sourceSecret)throw new ApiProblem(503,'CONNECTOR_KEY_MISSING','Configure credential custody before connecting an account.');
 const identity=await codeIdentity(input.provider,input.token,member.email);
 const id=ctx.actor.id+':'+input.provider,row={id,workspace_id:ctx.actor.workspaceId,member_id:ctx.actor.id,provider:input.provider};
 const ciphertext=await encryptSecret(ctx.sourceSecret,input.token,scope(row));
 return commitOperation(ctx,{operationKey:input.operationKey,action:'embeds.code-connect',request:{provider:input.provider,tokenHash:await requestHash(input.token)},authorize:async()=>{await codeMember(ctx);},prepare:async({revisionId})=>({
  entity:{id,kind:'connection',revisionId},value:{id,provider:input.provider,label:identity.label,state:'connected',revisionId},
  statements:[guard(ctx,identity.email),ctx.db.prepare("INSERT INTO code_embed_connections(id,workspace_id,member_id,provider,principal_id,verified_email,label,credential_ciphertext,state,revision_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,'connected',?,?,?) ON CONFLICT(id) DO UPDATE SET principal_id=excluded.principal_id,verified_email=excluded.verified_email,label=excluded.label,credential_ciphertext=excluded.credential_ciphertext,state='connected',revision_id=excluded.revision_id,updated_at=excluded.updated_at").bind(id,ctx.actor.workspaceId,ctx.actor.id,input.provider,identity.id,identity.email,identity.label,ciphertext,revisionId,ctx.now,ctx.now),await identityRevision(ctx,revisionId,'connection',id,{provider:input.provider,principalId:identity.id,state:'connected'})]
 })});
}
export async function readCodeConnection(ctx:FeatureContext,id:string){
 await codeMember(ctx);
 const row=await ctx.db.prepare('SELECT * FROM code_embed_connections WHERE id=? AND workspace_id=? AND member_id=?').bind(id,ctx.actor.workspaceId,ctx.actor.id).first<CodeConnection>();
 if(!row)throw new ApiProblem(404,'NOT_FOUND','Not found.');
 return row;
}
export async function openCode(ctx:FeatureContext,row:CodeConnection){
 const member=await codeMember(ctx);
 if(!ctx.sourceSecret||row.state!=='connected'||!row.credential_ciphertext)throw new ApiProblem(403,'CODE_CONNECTION_UNAVAILABLE','Reconnect your account.');
 const token=await decryptSecret(ctx.sourceSecret,row.credential_ciphertext,scope(row)),identity=await codeIdentity(row.provider,token,member.email);
 if(identity.id!==row.principal_id||identity.email!==row.verified_email)throw new ApiProblem(403,'CODE_IDENTITY_CHANGED','Reconnect your account.');
 return token;
}
export async function recheckCode(ctx:FeatureContext,row:CodeConnection,token:string){
 const current=await readCodeConnection(ctx,row.id);
 if(current.state!=='connected'||current.revision_id!==row.revision_id||current.credential_ciphertext!==row.credential_ciphertext)throw new ApiProblem(403,'CODE_CONNECTION_CHANGED','Your account connection changed.');
 const member=await codeMember(ctx),identity=await codeIdentity(row.provider,token,member.email);
 if(identity.id!==row.principal_id||identity.email!==row.verified_email)throw new ApiProblem(403,'CODE_IDENTITY_CHANGED','Reconnect your account.');
}
export async function disconnectCode(ctx:FeatureContext,input:{id:string;operationKey:string;expectedRevisionId:string}){
 const row=await readCodeConnection(ctx,input.id);
 return commitOperation(ctx,{operationKey:input.operationKey,action:'embeds.code-disconnect',request:input,authorize:async()=>{await readCodeConnection(ctx,input.id);},prepare:async({revisionId})=>({
  entity:{id:row.id,kind:'connection',revisionId},value:{id:row.id,state:'disconnected',revisionId},
  statements:[guard(ctx,row.verified_email),mutationGuard(ctx.db,'SELECT revision_id=? FROM code_embed_connections WHERE id=? AND member_id=?',[input.expectedRevisionId,row.id,ctx.actor.id]),ctx.db.prepare("UPDATE code_embed_connections SET credential_ciphertext=NULL,state='disconnected',revision_id=?,updated_at=? WHERE id=? AND workspace_id=? AND member_id=?").bind(revisionId,ctx.now,row.id,ctx.actor.workspaceId,ctx.actor.id),await identityRevision(ctx,revisionId,'connection',row.id,{state:'disconnected'})]
 })});
}
