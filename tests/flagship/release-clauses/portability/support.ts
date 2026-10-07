import {env} from 'cloudflare:test';
import {createApi} from '../../../../src/core/app/hono';
import type {FeatureContext} from '../../../../src/core/app/feature-context';
import {createPage,readPage,updatePage} from '../../../../src/core/features/pages/service';
import {createComment} from '../../../../src/core/features/comments/service';
import {saveGrant} from '../../../../src/core/features/sharing/grants';
import {saveDecision,acceptDecision} from '../../../../src/core/features/decisions/service';
import {createInquiry,recordAnalysis} from '../../../../src/core/features/inquiries/service';
import {prepareTrial,approveTrial} from '../../../../src/core/features/experiments/service';
import {createSkill} from '../../../../src/core/features/skills/service';
import {connect} from '../../../../src/core/features/connectors/service';
import {startImport,runImport} from '../../../../src/core/features/imports/jobs';
import {exportWorkspace} from '../../../../src/core/features/portability/service';
import {decodeArchive} from '../../../../src/core/features/portability/archive';
import {portableTables} from '../../../../src/core/features/portability/tables';
import {byteHash} from '../../../../src/core/features/portability/archive';
import {createUlid} from '../../../../src/core/shared/ulid';
import {seedWorkspace,seedMember,seedContainer,sessionFor} from '../../../../tests/e2e/setup/fixtures';

export const ownerEmail='release-portability-owner@example.invalid';
export const connectorKey='01234567890123456789012345678901';
export const originalFileBytes=new TextEncoder().encode('Native portability source archive with retained original bytes.');
const op=(name:string)=>`${name}-${crypto.randomUUID()}`;

export interface WorkspaceHarness {
  workspaceId:string;
  ownerId:string;
  ownerEmail:string;
  readerId:string|null;
  containerId:string|null;
  context(memberId?:string):FeatureContext;
}

export interface PageSet {
  rootId:string;
  rootRevisionId:string;
  childId:string;
  childRevisionId:string;
  rootRef:{kind:'page';sourceId:string;revisionId:string};
  childRef:{kind:'page';sourceId:string;revisionId:string};
  commentId:string;
  commentThreadId:string;
}

export interface PageTree {rootId:string;rootRevisionId:string;childId:string;childRevisionId:string}
export interface InquirySet {inquiryId:string;analysisId:string}
export interface DecisionSet {decisionId:string;decisionRevisionId:string}
export interface SkillTrialSet {skillId:string;skillRevisionId:string;trialId:string;trialGrantId:string}

export interface DurableScenario extends WorkspaceHarness {
  pages:PageSet;
  inquiryId:string;
  analysisId:string;
  decisionId:string;
  decisionRevisionId:string;
  skillId:string;
  skillRevisionId:string;
  trialId:string;
  trialGrantId:string;
  connectionId:string;
  importId:string;
  importArchiveKey:string;
}

export async function resetNative(){
  await env.DB.prepare('DROP TRIGGER IF EXISTS release_portability_revoke_setup_owner').run();
  await env.DB.prepare('DROP TRIGGER IF EXISTS release_portability_revoke_empty_target').run();
  await env.DB.prepare('DROP TRIGGER IF EXISTS release_portability_add_group_after_admission').run();
  const tables=(await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT IN ('d1_migrations','core_acl_epoch')").all<{name:string}>()).results;
  await env.DB.batch([env.DB.prepare('PRAGMA defer_foreign_keys=ON'),...tables.map(t=>env.DB.prepare(`DELETE FROM "${t.name}"`))]);
  let cursor:string|undefined;
  do{
    const page=await env.FILES.list({limit:1000,...(cursor?{cursor}:{})});
    for(const object of page.objects)await env.FILES.delete(object.key);
    cursor=page.truncated?page.cursor:undefined;
  }while(cursor);
}

export async function makeWorkspace(options:{email?:string;withReader?:boolean;withContainer?:boolean}={}):Promise<WorkspaceHarness>{
  const {workspaceId}=await seedWorkspace({name:'release portable workspace',aiEnabled:true});
  const email=options.email??ownerEmail;
  const {memberId:ownerId}=await seedMember(workspaceId,{role:'owner',email,displayName:'Portability Owner',isSetupOwner:true});
  const readerId=options.withReader===false?null:(await seedMember(workspaceId,{role:'member',email:`reader-${workspaceId}@example.invalid`,displayName:'Portable Reader'})).memberId;
  const containerId=options.withContainer===false?null:(await seedContainer(workspaceId,{ownerMemberId:ownerId,visibility:'open',name:'Portable knowledge'})).containerId;
  const harness:WorkspaceHarness={
    workspaceId,ownerId,ownerEmail:email,readerId,containerId,
    context(memberId=ownerId){
      const owner=memberId===ownerId;
      return {db:env.DB,files:env.FILES,jobs:env.JOBS,now:new Date().toISOString(),actor:{id:memberId,workspaceId,workspaceName:'release portable workspace',email:owner?email:`reader-${workspaceId}@example.invalid`,displayName:owner?'Portability Owner':'Portable Reader',initials:owner?'PO':'PR',role:owner?'owner':'member'}} as FeatureContext;
    },
  };
  if(containerId)await saveGrant(harness.context(),{operationKey:op('owner-container-full'),targetKind:'container',targetId:containerId,principalKind:'member',principalId:ownerId,level:'full'});
  return harness;
}

export function apiBindings(profile:'core-wiki'|'flagship'|''|undefined,includeConnectorKey=true){
  const bindings={...env} as Record<string,unknown>;
  delete bindings.SLATE_PROFILE;
  if(profile!==undefined)bindings.SLATE_PROFILE=profile;
  if(includeConnectorKey)bindings.CONNECTOR_CREDENTIALS_KEY=connectorKey;
  return bindings;
}

export async function apiRequest(path:string,cookie:string,profile:'core-wiki'|'flagship'|''|undefined,init:RequestInit={}){
  const headers=new Headers(init.headers);
  headers.set('cookie',cookie);
  headers.set('origin','https://slate.example');
  return createApi().request(`https://slate.example${path}`,{...init,headers},apiBindings(profile) as never);
}

export async function makePageTree(h:WorkspaceHarness):Promise<PageTree>{
  if(!h.containerId)throw new Error('The source workspace needs a container before creating pages.');
  const root=await createPage(h.context(),{operationKey:op('portable-root'),containerId:h.containerId,title:'Owner portable root',blocks:[{id:createUlid(),blockType:'paragraph',content:{text:[{text:'Root revision before owner change'}]},treePosition:'0001'}]});
  const child=await createPage(h.context(),{operationKey:op('portable-child'),containerId:h.containerId,parentPageId:root.value.pageId,title:'Portable child',blocks:[{id:createUlid(),blockType:'paragraph',content:{text:[{text:'Nested child content'}]},treePosition:'0001'}]});
  return {rootId:root.value.pageId,rootRevisionId:root.value.revisionId,childId:child.value.pageId,childRevisionId:child.value.revisionId};
}

export async function finishPages(h:WorkspaceHarness,tree:PageTree):Promise<PageSet>{
  const {rootId,childId}=tree;
  const comment=await createComment(h.context(),rootId,{operationKey:op('portable-comment'),body:[{text:'Owner discussion remains attached.'}]});
  const read=await readPage(h.context(),rootId);
  const revised=await updatePage(h.context(),rootId,{operationKey:op('portable-page-update'),expectedRevisionId:read.workingRevisionId,properties:{title:'Owner portable root revised'}});
  const currentRoot=await readPage(h.context(),rootId),currentChild=await readPage(h.context(),childId);
  return {
    rootId,rootRevisionId:revised.value.revisionId,
    childId,childRevisionId:currentChild.workingRevisionId,
    rootRef:{kind:'page',sourceId:rootId,revisionId:currentRoot.workingRevisionId},
    childRef:{kind:'page',sourceId:childId,revisionId:currentChild.workingRevisionId},
    commentId:comment.value.id,commentThreadId:comment.value.threadId,
  };
}

export async function grantPageView(h:WorkspaceHarness,pageId:string,memberId:string){
  return saveGrant(h.context(),{operationKey:op('portable-page-view'),targetKind:'page',targetId:pageId,principalKind:'member',principalId:memberId,level:'view'});
}

async function connectWithBoundedProviderTransport(h:WorkspaceHarness){
  const originalFetch=globalThis.fetch;
  const requests:string[]=[];
  globalThis.fetch=(async(input:RequestInfo|URL)=>{
    const url=input instanceof Request?input.url:String(input);
    requests.push(url);
    if(url!=='https://api.github.com/user')throw new Error(`Unmatched release provider transport request: ${url}`);
    return Response.json({id:806086,login:'portable-owner'});
  }) as typeof fetch;
  try{
    const result=await connect(h.context(),{operationKey:op('portable-github-connection'),provider:'github',accountId:'portable-owner',token:'synthetic-portability-token'},connectorKey);
    return {connectionId:result.value.id,requests};
  }finally{globalThis.fetch=originalFetch;}
}

export async function makeInquirySet(h:WorkspaceHarness,pages:PageSet):Promise<InquirySet>{
  const ctx=h.context();
  const inquiry=await createInquiry(ctx,{operationKey:op('portable-inquiry'),pageId:pages.rootId,question:'Which portable record should remain authoritative?',refs:[pages.childRef],audience:[h.ownerId],hypotheses:[{statement:'The accepted record is current.',disconfirmation:'Its cited revision changed.'},{statement:'The tree context changed.',disconfirmation:'The parent and child IDs still match.'}]});
  const analysis=await recordAnalysis(h.context(),{id:inquiry.value.id,operationKey:op('portable-analysis'),analysis:{kind:'allocate',items:[{id:'decision-a',cost:2,value:7},{id:'decision-b',cost:3,value:9},{id:'decision-c',cost:4,value:10}],capacity:5},refs:[pages.childRef]});
  return {inquiryId:inquiry.value.id,analysisId:analysis.value.id};
}

export async function makeDecisionSet(h:WorkspaceHarness,pages:PageSet):Promise<DecisionSet>{
  const decision=await saveDecision(h.context(),{operationKey:op('portable-decision'),pageId:pages.rootId,question:'Which exact revision governs the handoff?',options:['Use cited child','Reopen review'],outcome:'Use cited child',rationale:'The owner accepted the recorded child revision.',ownerId:h.ownerId,decidedAt:null,reviewAt:null,citations:[pages.childRef]});
  const accepted=await acceptDecision(h.context(),{id:decision.value.id,operationKey:op('portable-decision-accept'),expectedRevisionId:decision.value.revisionId});
  return {decisionId:decision.value.id,decisionRevisionId:accepted.value.revisionId};
}

export async function makeSkillTrialSet(h:WorkspaceHarness,pages:PageSet,inquiryId:string,activate=false):Promise<SkillTrialSet>{
  const skill=await createSkill(h.context(),{operationKey:op('portable-skill'),pageId:pages.rootId,name:'Private owner method',definition:{instructions:'Keep the accepted owner context and cite the exact child revision.',refs:[pages.childRef],audience:[h.ownerId],tools:['read-evidence'],effects:[],preconditions:['Read the exact cited revision.'],successTests:['Keep the original page and decision lineage.'],escalations:['Ask the owner when citations change.'],maxCostMicros:100}});
  const startsAt=new Date(Date.now()+60*60*1000).toISOString(),endsAt=new Date(Date.now()+2*60*60*1000).toISOString();
  const trial=await prepareTrial(h.context(),{operationKey:op('portable-trial'),inquiryId,plan:{eligibility:'Synthetic local subjects for portability mechanics.',assignment:[{subjectId:'subject-a',arm:'treatment'},{subjectId:'subject-b',arm:'treatment'},{subjectId:'subject-c',arm:'comparison'},{subjectId:'subject-d',arm:'comparison'}],assignmentMethod:'observational',seed:'local-portability-seed',confounding:['No customer outcome is measured.'],baseline:'Unmeasured local mechanics fixture.',metric:'Retained observation count',meaningfulEffect:1,maximumHalfWidth:1,startsAt,endsAt,supportGuardrail:5,contactLimit:0,maximumCostMicros:100,forecast:'No prospective outcome is asserted.',instrumentationRevision:'source-controlled-local-fixture-v1',refs:[pages.childRef],effects:[]}});
  let trialGrantId='';
  if(activate){
    await approveTrial(h.context(),{id:trial.value.id,operationKey:op('portable-trial-approve'),expectedRevisionId:trial.value.revisionId});
    trialGrantId=(await env.DB.prepare('SELECT grant_id FROM intelligence_experiments WHERE id=?').bind(trial.value.id).first<{grant_id:string}>())!.grant_id;
  }
  return {skillId:skill.value.id,skillRevisionId:skill.value.revisionId,trialId:trial.value.id,trialGrantId};
}

export async function makeConnection(h:WorkspaceHarness){return (await connectWithBoundedProviderTransport(h)).connectionId;}

export async function makeImport(h:WorkspaceHarness){
  const job=await startImport(h.context(),{operationKey:op('portable-original'),format:'text',source:{name:'portable-original.txt',bytes:originalFileBytes}});
  await runImport(h.context(),job.id);
  const row=await env.DB.prepare('SELECT archive_key FROM federation_imports WHERE id=?').bind(job.id).first<{archive_key:string}>();
  return {importId:job.id,importArchiveKey:row!.archive_key};
}

export async function exportNativeArchive(h:WorkspaceHarness){
  const result=await exportWorkspace(h.context(),{operationKey:op('portable-export')});
  const row=await env.DB.prepare('SELECT archive_key FROM federation_exports WHERE id=?').bind(result.id).first<{archive_key:string}>();
  if(!row)throw new Error('The export service returned without a durable R2 archive row.');
  const object=await env.FILES.get(row.archive_key);
  if(!object)throw new Error(`The native R2 export object ${row.archive_key} is missing.`);
  const bytes=new Uint8Array(await object.arrayBuffer());
  return {id:result.id,key:row.archive_key,bytes,...await decodeArchive(bytes)};
}

export async function migrationNames(){
  return (await env.DB.prepare('SELECT name FROM d1_migrations ORDER BY name').all<{name:string}>()).results.map(row=>row.name);
}

export async function tableCounts(names:readonly string[]=portableTables){
  const result=await env.DB.batch<{count:number}>(names.map(name=>env.DB.prepare(`SELECT count(*) AS count FROM "${name}"`)));
  return Object.fromEntries(names.map((name,index)=>[name,Number(result[index]?.results[0]?.count??0)]));
}

export async function portableSnapshot(options:{omitSetupOwner?:boolean;omitTables?:readonly string[]}={}){
  const names=portableTables.filter(name=>!options.omitTables?.includes(name));
  const results=await env.DB.batch<Record<string,string|number|null>>(names.map(name=>env.DB.prepare(`SELECT * FROM "${name}"`)));
  const tables:Record<string,Record<string,string|number|null>[]>={};
  for(const [index,name] of names.entries()){
    const rows=(results[index]?.results??[]).map(row=>{
      const normalized=Object.fromEntries(Object.keys(row).sort().filter(key=>!(options.omitSetupOwner&&name==='members'&&key==='is_setup_owner')).map(key=>[key,row[key]]));
      return normalized as Record<string,string|number|null>;
    });
    rows.sort((left,right)=>JSON.stringify(left).localeCompare(JSON.stringify(right)));
    tables[name]=rows;
  }
  const bytes=new TextEncoder().encode(JSON.stringify(tables));
  return {hash:await byteHash(bytes),counts:Object.fromEntries(Object.entries(tables).map(([name,rows])=>[name,rows.length]))};
}

export async function setupOwnerCookie(h:WorkspaceHarness){return sessionFor(h.ownerId);}

export function randomOperationKey(name:string){return op(name);}

export async function apiJson(path:string,cookie:string,profile:'core-wiki'|'flagship'|''|undefined,method='GET',body?:unknown){
  return apiRequest(path,cookie,profile,{method,...(body===undefined?{}:{headers:{'content-type':'application/json'},body:JSON.stringify(body)})});
}

export async function stageRestoreThroughApi(h:WorkspaceHarness,bytes:Uint8Array,profile:'core-wiki'|'flagship'|''|undefined='flagship'){
  const form=new FormData();
  form.set('operationKey',op('portable-restore'));
  form.set('file',new File([bytes as Uint8Array<ArrayBuffer>],'workspace.zip',{type:'application/zip'}));
  const response=await apiRequest('/api/exports/jobs/restore',await setupOwnerCookie(h),profile,{method:'POST',body:form});
  return {response,body:await response.json() as {id:string;state:string;report:{code?:string};restoreId?:string;counts:Record<string,number>}};
}

export async function runRestoreThroughApi(h:WorkspaceHarness,id:string,profile:'core-wiki'|'flagship'|''|undefined='flagship'){
  const response=await apiRequest(`/api/exports/jobs/${id}/run`,await setupOwnerCookie(h),profile,{method:'POST'});
  return {response,body:await response.json() as {id:string;state:string;report:{code?:string};restoreId?:string;counts:Record<string,number>;reconnect?:string[]}};
}

export async function r2Keys(){
  const keys:string[]=[];let cursor:string|undefined;
  do{const page=await env.FILES.list({limit:1000,...(cursor?{cursor}:{})});keys.push(...page.objects.map(object=>object.key));cursor=page.truncated?page.cursor:undefined;}while(cursor);
  return keys.sort();
}

export async function r2Snapshot(){
  const inventory=[] as {key:string;size:number;hash:string}[];
  for(const key of await r2Keys()){
    const object=await env.FILES.get(key);
    if(!object)throw new Error(`R2 object ${key} disappeared while inventorying the bucket.`);
    const bytes=new Uint8Array(await object.arrayBuffer());
    inventory.push({key,size:bytes.length,hash:await byteHash(bytes)});
  }
  return inventory;
}
