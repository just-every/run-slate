import {nativeClientGrant} from './credentials';
import type { ToolContext } from '../../../../modules/agent-door/index.ts';
import { ToolRefusal } from '../../../../modules/agent-door/index.ts';
import type { AppBindings } from '../../app/types';
import type { FeatureContext } from '../../app/feature-context';
import { mutationGuard } from '../../app/operations';
import { nativeMember } from './people';
import { nativeProofSession } from './proof';

export async function agentFeatureContext(env:AppBindings,context:ToolContext,write=false):Promise<FeatureContext> {
  const actor=await nativeMember(env.DB,context.person.id);
  if(!actor)throw new ToolRefusal('unauthenticated');
  const grant=await nativeClientGrant(env,context);
  if(grant&&!grant.valid)throw new ToolRefusal('insufficient_scope');
  const binding=context.consent?await env.DB.prepare(`SELECT b.token FROM bs_settings b WHERE b.singleton=1 AND b.stopped=0 AND
    (b.owner_id IS NOT NULL AND EXISTS(SELECT 1 FROM members WHERE id=? AND is_setup_owner=1)
     OR EXISTS(SELECT 1 FROM bs_team WHERE operator_id=? AND state='active' AND business_id IS NOT NULL))`).bind(actor.id,actor.id).first<{token:string}>():null;
  if(context.consent&&!binding)throw new ToolRefusal('unauthenticated');
  const state=await env.DB.prepare('SELECT envelope,local_document,local_revision FROM agent_door_state WHERE id=1').first<{envelope:string|null;local_document:string|null;local_revision:number}>();
  const proof=context.nativeProof?await nativeProofSession(env,context.nativeProof.reference,context.person.id,context.agent.id):null;
  return {db:env.DB,files:env.FILES,jobs:env.JOBS,actor,now:new Date(context.now()).toISOString(),sourceSecret:env.CONNECTOR_CREDENTIALS_KEY,
    ...(grant?{containerScopeIds:grant.scopes.filter(scope=>!write||scope.level==='write').map(scope=>scope.containerId)}:{}),
    agent:{...context.actor,approvers:context.approvers.map(person=>({...person})),operationId:context.operationId},
    ...(proof?{stepUp:{sessionId:proof,since:context.now()-600_000}}:{}),
    // A policy change or pause racing a native commit must abort the batch.
    credentialGuard:()=>mutationGuard(env.DB,`SELECT local_paused=0 AND envelope IS ? AND local_document IS ? AND local_revision=? AND EXISTS(SELECT 1 FROM agent_door_agents WHERE id=? AND sponsor=? AND revoked=0) AND (? IS NULL OR EXISTS(SELECT 1 FROM bs_settings WHERE singleton=1 AND token=? AND stopped=0)) AND (? IS NULL OR EXISTS(SELECT 1 FROM public_api_tokens WHERE id=? AND member_id=? AND scopes_json=? AND revoked_at IS NULL AND token_hash IS NOT NULL AND expires_at>?)) FROM agent_door_state WHERE id=1`,[state?.envelope??null,state?.local_document??null,state?.local_revision??0,context.agent.id,actor.id,binding?.token??null,binding?.token??null,grant?.id??null,grant?.id??null,actor.id,grant?.json??'',new Date(context.now()).toISOString()]),
  };
}
