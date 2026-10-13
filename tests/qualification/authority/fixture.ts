import {resetDatabase} from '../../e2e/setup/reset-database';
import {env} from 'cloudflare:test';
import {seedWorkspace,seedMember,seedPageGrant} from '../../e2e/setup/fixtures';
import type {FeatureContext} from '../../../src/core/app/feature-context';
import {startImport,runImport} from '../../../src/core/features/imports/jobs';
export async function reset(){await resetDatabase(env.DB);}
interface AuthorityFixture {workspaceId:string;owner:string;reader:string;context(id?:string):FeatureContext}
export function fixture(options:{withReader:false}):Promise<Omit<AuthorityFixture,'reader'>&{reader:null}>;
export function fixture(options?:{withReader?:true}):Promise<AuthorityFixture>;
export async function fixture(options:{withReader?:boolean}={}):Promise<Omit<AuthorityFixture,'reader'>&{reader:string|null}>{
 const {workspaceId}=await seedWorkspace();
 const {memberId:owner}=await seedMember(workspaceId,{email:'owner@authority.test',displayName:'Owner',role:'owner',isSetupOwner:true});
 // A fresh restore target has only the native setup owner; source fixtures keep their real reader.
 const reader=options.withReader===false?null:(await seedMember(workspaceId,{email:'reader@authority.test',displayName:'Reader',role:'member'})).memberId;
 const context=(id=owner)=>({db:env.DB,files:env.FILES,jobs:env.JOBS,actor:{id,workspaceId,workspaceName:'Authority',email:id===owner?'owner@authority.test':'reader@authority.test',displayName:id,initials:'AU',role:id===owner?'owner':'member'},now:new Date().toISOString()} as FeatureContext);
 return {workspaceId,owner,reader,context};
}
export async function document(f:Awaited<ReturnType<typeof fixture>>,name:string){const ctx=f.context();const job=await startImport(ctx,{operationKey:crypto.randomUUID(),format:'text',source:{name:name+'.txt',bytes:new TextEncoder().encode(name)}});await runImport(ctx,job.id);const page=await ctx.db.prepare("SELECT p.id,p.working_revision_id FROM pages p JOIN federation_import_mappings m ON m.target_id=p.id WHERE m.import_job_id=? AND m.source_kind='page'").bind(job.id).first<{id:string;working_revision_id:string}>();const {grantId}=await seedPageGrant(page!.id,{principalKind:'member',principalId:f.reader,level:'view'});return {id:page!.id,grantId,ref:{kind:'page' as const,sourceId:page!.id,revisionId:page!.working_revision_id}};}
export function definition(f:Awaited<ReturnType<typeof fixture>>,refs:Awaited<ReturnType<typeof document>>['ref'][]){return {instructions:'Confidential exact method from every listed source.',refs,audience:[f.owner,f.reader],tools:['read-evidence' as const],effects:[],preconditions:[],successTests:['Preserve full provenance'],escalations:[],maxCostMicros:100};}
export async function passingEvaluation(ctx:FeatureContext,revisionId:string){const id=crypto.randomUUID();await ctx.db.prepare("INSERT INTO intelligence_evaluations(id,workspace_id,skill_revision_id,case_hash,result_json,passed,created_at) VALUES(?,?,?,'labelled-test-only-evaluation','{}',1,?)").bind(id,ctx.actor.workspaceId,revisionId,ctx.now).run();await ctx.db.prepare("UPDATE intelligence_skill_versions SET state='evaluated',evaluation_id=? WHERE id=?").bind(id,revisionId).run();return id;}
