import {env} from 'cloudflare:test';
import {vi} from 'vitest';
import {fixture,document,reset} from '../authority/fixture';
import {connect} from '../../../src/core/features/connectors/service';
import {nativeHash} from '../../../src/core/features/connectors/native-effects';
import {issueGrant} from '../../../src/core/features/effects/grants';
import {prepareEffect,dispatchEffect} from '../../../src/core/features/effects/service';
import {requestHash} from '../../../src/core/app/operations';
import {exportWorkspace,restoreWorkspace} from '../../../src/core/features/portability/service';

// Only the remote provider is simulated. All authorization, intent, receipt,
// export/restore and mutation checks use the actual services and local D1/R2.
export async function effectFixture(){
 const f=await fixture(),host=await document(f,'Restore authority evidence');
 const ctx={...f.context(),sourceSecret:'test-only-restore-authority-encryption-key'};
 const runId=crypto.randomUUID(),target='opportunities/local/handoffs/recovery';
 const content={title:'Granted repair',description:'Local test only',assigneeId:null,dueAt:null,status:'open' as const};
 await env.DB.prepare('UPDATE workspaces SET ai_enabled=1 WHERE id=?').bind(f.workspaceId).run();
 await env.DB.prepare("INSERT INTO intelligence_runs(id,workspace_id,requester_id,page_id,kind,status,revision_id,input_json,refs_json,audience_json,provider,created_at,updated_at) VALUES(?,?,?,?,'procedure','needs-review',?,'{}',?,?,'deterministic',?,?)")
  .bind(runId,f.workspaceId,f.owner,host.id,crypto.randomUUID(),JSON.stringify([host.ref]),JSON.stringify([f.owner]),ctx.now,ctx.now).run();
 let calls=0,sends=0,currentRevision='before';
 const identity={protocol:'rer-delegation/1',provider:'orbit',installationId:'local-installation',accountId:'local-account',principalId:'local-owner',label:'Test provider',grantId:'local-source-grant',expiresAt:'2099-01-01T00:00:00Z',scopes:['crm.evidence.read','crm.handoff.write'],targets:[target],capabilities:{readKinds:['crm.handoff'],operations:['orbit.handoff.upsert'],conditionalWrite:true,providerIdempotency:true,readBack:true,reconciliationAttribution:true}};
 vi.stubGlobal('fetch',async(request:string|URL|Request,init?:RequestInit)=>{
  calls++;
  const url=new URL(typeof request==='string'?request:request instanceof URL?request:request.url);
  if(url.origin!=='https://restore-authority.test')throw new Error('Unexpected external origin');
  if(url.pathname.endsWith('/identity'))return Response.json(identity);
  if(url.pathname.endsWith('/audience'))return Response.json({audienceRevision:'audience-before',kind:'source-principals',principalIds:['local-owner']});
  if(url.pathname.endsWith('/check'))return Response.json({provider:'orbit',installationId:identity.installationId,accountId:identity.accountId,principalId:identity.principalId,target,revision:currentRevision,observedAt:ctx.now,audience:{kind:'source-principals',principalIds:['local-owner']}});
  if(url.pathname.endsWith('/effects')&&init?.method==='POST'){
   sends++;currentRevision='after';const {operationKey,...body}=JSON.parse(String(init.body));
   return Response.json({state:'confirmed',receipt:{id:'test-provider-receipt',operationKey,requestHash:await nativeHash(body),provider:'orbit',installationId:identity.installationId,accountId:identity.accountId,principalId:identity.principalId,operation:body.operation,target,beforeRevision:'before',afterRevision:'after',committedAt:ctx.now},observed:{target,revision:'after',content,observedAt:ctx.now}});
  }
  throw new Error('Unexpected test provider request');
 });
 const connection=await connect(ctx,{operationKey:crypto.randomUUID(),provider:'orbit',token:'test-only-token',accountId:identity.accountId,nativeConfig:{origin:'https://restore-authority.test',clientId:'slate-test',accountId:identity.accountId,allowLoopback:false}},ctx.sourceSecret);
 const grant=await issueGrant(ctx,{operationKey:crypto.randomUUID(),subjectId:f.owner,kind:'effect',expiresAt:identity.expiresAt,scope:{operations:['orbit.handoff.upsert'],targets:[target],accounts:[identity.accountId],sourceIds:[host.id],audience:[f.owner],maxCostMicros:0,contentHash:await requestHash(content),conditions:{expectedRevision:'before',expectedAudienceRevision:'audience-before'},acceptNonAtomicProvider:false}});
 const input={operationKey:crypto.randomUUID(),runId,grantId:grant.value.id,connectionId:connection.value.id,operation:'orbit.handoff.upsert' as const,accountId:identity.accountId,target,expectedRevision:'before',expectedAudienceRevision:'audience-before',content,costMicros:0 as const};
 const prepared=await prepareEffect(ctx,input);
 return {...f,ctx,host,runId,input,effectId:prepared.value.id,calls:()=>calls,sends:()=>sends};
}

export async function restoredFixture(){
 const f=await effectFixture();
 const confirmed=await dispatchEffect(f.ctx,f.effectId);
 if(confirmed.state!=='confirmed')throw new Error('Test provider effect was not confirmed');
 const exported=await exportWorkspace(f.ctx);
 const key=await env.DB.prepare('SELECT archive_key FROM federation_exports WHERE id=?').bind(exported.id).first<string>('archive_key');
 const archive=new Uint8Array(await(await env.FILES.get(key!))!.arrayBuffer());
 await reset();const destination=await fixture();
 await restoreWorkspace(destination.context(),archive);
 return {...f,confirmed};
}

export async function durableState(){
 const tables=['intelligence_runs','intelligence_effects','intelligence_grants','intelligence_budgets','intelligence_interruptions','intelligence_stages','intelligence_revisions','operation_receipts','notification_outbox','chat_deliveries'];
 const state:Record<string,unknown>={};
 for(const table of tables)state[table]=(await env.DB.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).results;
 return state;
}
