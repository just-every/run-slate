import type { RuntimeConfig } from '../../platform/config/runtime';
import { encryptSecret, decryptSecret } from '../../platform/secrets/custody';
import { sessionDigest } from '../../platform/auth/token';
import { createUlid } from '../../shared/ulid';
import { ApiProblem } from '../../app/problems';
export interface IdentityMailInput { workspaceId:string; email:string; kind:'signin'|'invitation'; url:string; memberId?:string; invitationId?:string; magicLinkId?:string; requestDigest?:string; operationKey?:string; requestedByMemberId?:string }
export interface MailPayload { from:string; to:string; subject:string; text:string }
export const mailScope=(workspaceId:string,id:string)=>`slate:identity-mail:${workspaceId}:${id}`;
export const mailKey=(config:RuntimeConfig)=>sessionDigest(config.sessionSecret,'slate:identity-mail:encryption:v1');
export function requireMailConfig(config:RuntimeConfig){if(!config.mailProvider||!config.mailFrom||(!config.mailApiKey&&!(config.mailProvider==='development'&&(config.localDevelopment||config.demo)))||!config.appUrl)throw new ApiProblem(503,'MAIL_UNAVAILABLE','APP_URL, MAIL_PROVIDER, MAIL_FROM and provider credentials must be configured.');}
/** Returned statement MUST be committed atomically with its token and admission receipt. */
export async function admitIdentityMail(db:D1Database,config:RuntimeConfig,input:IdentityMailInput,now:string){
 requireMailConfig(config);
 const id=createUlid(),payload:MailPayload={from:config.mailFrom!,to:input.email,subject:input.kind==='signin'?'Sign in to Slate':'Your Slate invitation',text:`${input.kind==='signin'?'Sign in':'Accept your invitation'}: ${input.url}\nThis single-use link expires in 24 hours.`};
 const encrypted=await encryptSecret(await mailKey(config),JSON.stringify(payload),mailScope(input.workspaceId,id));
 return {id,statement:db.prepare(`INSERT INTO mail_deliveries (id,workspace_id,kind,target_email,invitation_id,member_id,state,created_at,updated_at,payload_ciphertext,magic_link_id,request_digest,operation_key,requested_by_member_id,next_attempt_at,provider_key_digest,provider,delivery_phase) VALUES (?,?,?,?,?,?,'queued',?,?,?,?,?,?,?,?,?,?,'pending')`).bind(id,input.workspaceId,input.kind==='signin'?'sign-in-link':'invitation',input.email,input.invitationId??null,input.memberId??null,now,now,encrypted,input.magicLinkId??null,input.requestDigest??null,input.operationKey??null,input.requestedByMemberId??null,now,await sessionDigest(config.sessionSecret,`mail-provider:${config.mailApiKey}`),config.mailProvider)};
}
export async function openMailPayload(config:RuntimeConfig,row:{id:string;workspace_id:string;payload_ciphertext:string|null}):Promise<MailPayload>{
 if(!row.payload_ciphertext)throw new ApiProblem(409,'MAIL_NOT_RECOVERABLE','This older delivery has no recoverable link. Revoke its invitation and create a new one.');
 return JSON.parse(await decryptSecret(await mailKey(config),row.payload_ciphertext,mailScope(row.workspace_id,row.id))) as MailPayload;
}
