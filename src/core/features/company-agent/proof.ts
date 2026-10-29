import {sessionSamlPolicy,samlSessionValid} from '../session/saml/policy';
import type { AgentDoorOptions, Principal } from '../../../../modules/agent-door/index.ts';
import type { AppBindings } from '../../app/types';
import type { RuntimeConfig } from '../../platform/config/runtime';
import { createSlateAuth } from '../session/auth';
import { createSessionService,sessionOptions } from '../session/service';
import { requestHash } from '../../app/request-hash';
import { safeAppPath } from '../../platform/auth/paths';

export async function nativeProofSession(env:AppBindings,reference:string,person:string,agent:string,client:string|null=null):Promise<string|null> {
  return (await env.DB.prepare(`SELECT p.session_id FROM slate_agent_native_proofs p JOIN sessions s ON s.id=p.session_id JOIN members m ON m.id=p.person_id
    WHERE p.id=? AND p.person_id=? AND p.agent_id=? AND p.client_id IS ? AND p.proof_kind='step_up' AND p.expires_at>? AND s.member_id=p.person_id AND s.revoked_at IS NULL AND s.expires_at>?
    AND m.status='active' AND ${sessionSamlPolicy('s','m')} AND ${samlSessionValid('s','m')} AND s.proof_at>=? AND s.proof_version=COALESCE((SELECT version FROM member_authority WHERE member_id=m.id),1)`)
    .bind(reference,person,agent,client,Date.now(),new Date().toISOString(),Date.now()-600_000).first<{session_id:string}>())?.session_id??null;
}
export function nativeProof(env:AppBindings,config:RuntimeConfig):NonNullable<AgentDoorOptions['nativeProof']> {
  return {
    async handoff({kind,tool,principal}) {
      const id=crypto.randomUUID();
      await env.DB.prepare('INSERT INTO slate_agent_native_proofs(id,person_id,agent_id,tool,client_id,proof_kind,expires_at) VALUES(?,?,?,?,?,?,?)').bind(id,principal.person.id,principal.agent.id,tool,principal.clientId??null,kind,Date.now()+600_000).run();
      return new URL('/agents/native-proof/'+id,config.appUrl).href;
    },
    async verify({tool,principal,reference}) {
      if(!await nativeProofSession(env,reference,principal.person.id,principal.agent.id,principal.clientId??null))return false;
      return !!await env.DB.prepare('SELECT 1 FROM slate_agent_native_proofs WHERE id=? AND tool=?').bind(reference,tool).first();
    },
  };
}
const escape=(value:string)=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
/** The agent gets only an opaque handle. The person's native session completes authentication. */
export async function nativeProofResponse(request:Request,env:AppBindings,config:RuntimeConfig):Promise<Response|null> {
  const url=new URL(request.url),match=/^\/agents\/native-proof\/([a-f0-9-]{36})$/.exec(url.pathname);
  if(!match)return null;
  const origin=new URL(config.appUrl!).origin;
  if(url.origin!==origin||request.headers.has('authorization'))return Response.json({code:'forbidden'},{status:403});
  const current=await createSessionService(env.DB,sessionOptions(config)).current(request);
  if(!current)return Response.redirect(new URL('/signin?returnTo='+encodeURIComponent(safeAppPath(url.pathname)),origin).href,303);
  const row=await env.DB.prepare('SELECT person_id,tool FROM slate_agent_native_proofs WHERE id=? AND expires_at>?').bind(match[1],Date.now()).first<{person_id:string;tool:string}>();
  if(!row||row.person_id!==current.member.id)return Response.json({code:'not_found'},{status:404});
  if(request.method==='POST') {
    if(request.headers.get('origin')!==origin)return Response.json({code:'forbidden'},{status:403});
    const {auth}=await createSlateAuth(env.DB,config);
    try {await auth.requireStepUp(request,'credentials:mint');}
    catch {
      await auth.requestStepUp(request,{action:'credentials:mint',returnTo:url.pathname});
      return Response.json({code:'step_up_required',message:'Confirm the email sent to your native Slate address, then return here.'},{status:403});
    }
    await env.DB.prepare('UPDATE slate_agent_native_proofs SET session_id=? WHERE id=? AND person_id=? AND expires_at>?').bind(current.session.id,match[1],current.member.id,Date.now()).run();
    return Response.json({reference:match[1],tool:row.tool},{headers:{'cache-control':'no-store'}});
  }
  if(request.method!=='GET')return new Response(null,{status:405});
  return new Response(`<!doctype html><html lang="en"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Confirm agent access · Slate</title><main style="max-width:48rem;padding:24px;margin:auto;overflow-wrap:anywhere"><h1>Confirm native authentication</h1><p>${escape(current.member.displayName)}, confirm your current Slate authentication for ${escape(row.tool)}. Company policy and native permissions still apply to the action.</p><form method="post"><button style="min-height:44px;min-width:44px">Confirm authentication</button></form></main></html>`,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'"}});
}
