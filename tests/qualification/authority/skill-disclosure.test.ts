import {unzipSync,strFromU8} from 'fflate';
import {exportSkillSnapshot} from '../../../src/core/features/skills/export';
import {uploadMedia} from '../../../src/core/features/media/service';
import {replaceBlocks} from '../../../src/core/features/editor/service';
import {env} from 'cloudflare:test';
import {beforeEach,test,expect} from 'vitest';
import {reset,fixture,document,definition,passingEvaluation} from './fixture';
import {sessionFor} from '../../e2e/setup/fixtures';
import {createApi} from '../../../src/core/app/hono';
import {createSkill,transitionSkill} from '../../../src/core/features/skills/service';
import {listPageSkills} from '../../../src/core/features/skills/listing';
import {requirePinnedSkillContinuation,requireEvaluationSkill,requireActiveSkill} from '../../../src/core/features/skills/admission';
import {freezeCases} from '../../../src/core/features/skills/cases';
import {issueGrant} from '../../../src/core/features/effects/grants';
import {exportWorkspace} from '../../../src/core/features/portability/service';
beforeEach(reset);
test("SKILL-001 \u2014 method disclosure and portable snapshots retain exact source, audience and attachment boundaries", async () => {
 await scenario("SKILL-001 \u2014 HTTP method disclosure rejects revoked definition sources and exact audience widening", async () => {
  await scenario("SKILL-001 \u2014 revoking an older definition source denies the all-version HTTP read without revealing instructions", async () => {
 const f=await fixture(),host=await document(f,'Method host'),source=await document(f,'Secret separate source'),def=definition(f,[host.ref,source.ref]);
 const skill=await createSkill(f.context(),{operationKey:'method-create',pageId:host.id,name:'Sensitive method',definition:def});
 const next=await createSkill(f.context(),{operationKey:'method-next',pageId:host.id,name:'Sensitive method',skillId:skill.value.id,expectedRevisionId:skill.value.revisionId,definition:definition(f,[host.ref])});
 await passingEvaluation(f.context(),next.value.revisionId);await transitionSkill(f.context(),{operationKey:'method-activate',revisionId:next.value.revisionId,action:'activate'});
 const app=createApi(),cookie=await sessionFor(f.reader),read=()=>app.request('https://slate.example/api/skills/'+skill.value.id,{headers:{Cookie:cookie}},env);
 expect((await read()).status).toBe(200);
 await env.DB.prepare('DELETE FROM page_grants WHERE id=?').bind(source.grantId).run();
 const response=await read();expect([403,404]).toContain(response.status);expect(await response.text()).not.toContain(def.instructions);
 expect((await listPageSkills(f.context(f.reader),host.id)).items).toHaveLength(0);

  });
  await reset();
  await scenario("SKILL-001 \u2014 a readable host and source cannot widen the exact method audience", async () => {
 const f=await fixture(),host=await document(f,'Readable source outside skill audience'),def={...definition(f,[host.ref]),audience:[f.owner]};
 const skill=await createSkill(f.context(),{operationKey:'private-method-audience',pageId:host.id,name:'Owner audience method',definition:def});
 expect((await listPageSkills(f.context(f.reader),host.id)).items).toHaveLength(0);
 const response=await createApi().request('https://slate.example/api/skills/'+skill.value.id,{headers:{Cookie:await sessionFor(f.reader)}},env);
 expect(response.status).toBe(404);expect(await response.text()).not.toContain(def.instructions);

  });

 });
 await reset();
 await scenario("SKILL-001 \u2014 portable skill snapshots preserve exact definitions and only currently disclosed attachments", async () => {
  await scenario("SKILL-001 \u2014 portable SKILL.md preserves exact definition and original attachment with snapshot labels and current disclosure checks", async () => {
 const f=await fixture(),host=await document(f,'Skill source with attachment'),bytes=new TextEncoder().encode('Original permitted source attachment');
 await env.FILES.put('test/skill-attachment',bytes);await env.DB.prepare("INSERT INTO files(id,workspace_id,page_id,storage_key,original_name,content_type,size_bytes,created_at) VALUES('skill-file',?,?,'test/skill-attachment','original.txt','text/plain',?,?)").bind(f.workspaceId,host.id,bytes.length,f.context().now).run();
 const cited=await replaceBlocks(f.context(),host.id,{operationKey:'cite-attachment',expectedRevisionId:host.ref.revisionId,blocks:[{id:'skill-attachment-block',blockType:'media',treePosition:'1',content:{kind:'file',source:{url:'/api/media/skill-file',fileId:'skill-file',name:'original.txt'},caption:'',alt:''}}]}),def=definition(f,[{...host.ref,revisionId:cited.receipt.revisionId}]);
 const skill=await createSkill(f.context(),{operationKey:'skill-export',pageId:host.id,name:'Exact owned method',definition:def});
 const archive=unzipSync((await exportSkillSnapshot(f.context(f.reader),skill.value.revisionId)).bytes),snapshot=JSON.parse(strFromU8(archive['snapshot.json']!));
 expect(snapshot).toMatchObject({revisionId:skill.value.revisionId,ownerId:f.owner,executionAuthority:false,synchronization:'none',definition:def});
 expect(strFromU8(archive['SKILL.md']!)).toContain('no live synchronization or execution authority');expect(archive['attachments/0']).toEqual(bytes);
 await env.DB.prepare('DELETE FROM page_grants WHERE id=?').bind(host.grantId).run();
 await expect(exportSkillSnapshot(f.context(f.reader),skill.value.revisionId)).rejects.toMatchObject({status:404});

  });
  await reset();
  await scenario("skill snapshot export carries only the attachments its exact source revisions show the reader", async () => {
 const {SELF}=await import('cloudflare:test');
 const f=await fixture(),host=await document(f,'Skill source with a shown attachment'),owner=f.context();
 const upload=(name:string,text:string)=>uploadMedia(owner,{operationKey:crypto.randomUUID(),pageId:host.id,name,contentType:'text/plain',bytes:new TextEncoder().encode(text)});
 const shown=await upload('shown.txt','Attachment the cited revision shows');
 const shownRevision=await replaceBlocks(owner,host.id,{operationKey:crypto.randomUUID(),expectedRevisionId:host.ref.revisionId,blocks:[{id:crypto.randomUUID(),blockType:'media',treePosition:'1',content:{kind:'file',source:{url:shown.value.url,fileId:shown.value.id,name:'shown.txt'},caption:'',alt:''}}]});
 const ref={...host.ref,revisionId:shownRevision.receipt.revisionId},skill=await createSkill(owner,{operationKey:crypto.randomUUID(),pageId:host.id,name:'Shown attachment method',definition:definition(f,[ref])});
 const hidden=await upload('unreleased-plan.txt','Unreleased upload the reader never sees');
 const cookie=await sessionFor(f.reader);
 expect((await SELF.fetch(`http://localhost/api/media/${hidden.value.id}`,{headers:{cookie}})).status).toBe(404);
 const response=await SELF.fetch(`http://localhost/api/skills/versions/${skill.value.revisionId}/export`,{headers:{cookie}});
 expect(response.status,await response.clone().text()).toBe(200);
 const archive=unzipSync(new Uint8Array(await response.arrayBuffer()));
 expect(JSON.parse(strFromU8(archive['attachments.json']!)).map((file:{name:string})=>file.name)).toEqual(['shown.txt']);
 expect(Object.values(archive).map(bytes=>strFromU8(bytes)).join('\n')).not.toMatch(/unreleased/i);

  });

 });
});
test('SKILL-003 — exact continuation authority cannot disclose revoked dependencies outside the run subset',async()=>{
 const f=await fixture(),host=await document(f,'Allowed subset'),secret=await document(f,'Other confidential dependency'),def=definition(f,[host.ref,secret.ref]);
 const skill=await createSkill(f.context(),{operationKey:'pinned-create',pageId:host.id,name:'Pinned method',definition:def});
 await env.DB.prepare("UPDATE intelligence_skill_versions SET state='superseded' WHERE id=?").bind(skill.value.revisionId).run();
 const run={id:'labelled-local-run',skill_revision_id:skill.value.revisionId,refs_json:JSON.stringify([host.ref]),audience_json:JSON.stringify([f.reader]),reserved_micros:10};
 const grant=await issueGrant(f.context(),{operationKey:'continuation-authority',subjectId:f.reader,kind:'continuation',expiresAt:'2099-01-01T00:00:00.000Z',scope:{operations:['run.continue'],targets:[run.id],accounts:[],sourceIds:def.refs.map(r=>r.sourceId),audience:[f.reader],maxCostMicros:100,conditions:{skillRevisionId:skill.value.revisionId},acceptNonAtomicProvider:false}});
 expect((await requirePinnedSkillContinuation(f.context(f.reader),run,grant.value.id)).instructions).toBe(def.instructions);
 await env.DB.prepare('DELETE FROM page_grants WHERE id=?').bind(secret.grantId).run();
 await expect(requirePinnedSkillContinuation(f.context(f.reader),run,grant.value.id)).rejects.toMatchObject({status:404});
});
test('SKILL-002 — held-out evaluation admission rechecks full draft definition beyond frozen case refs',async()=>{
 const f=await fixture(),host=await document(f,'Case source'),secret=await document(f,'Skill-only confidential source');
 const skill=await createSkill(f.context(),{operationKey:'evaluation-draft',pageId:host.id,name:'Evaluation method',definition:definition(f,[host.ref,secret.ref])});
 const cutoff=new Date(Date.now()+10).toISOString(),ctx={...f.context(),now:cutoff};
 const cases=await freezeCases(ctx,{operationKey:'freeze-cases',revisionId:skill.value.revisionId,cutoff,refs:[host.ref],cases:[{name:'One',question:'Exact question',requiredEvidenceIds:['E1'],requiredStatements:['result'],forbiddenStatements:[],maximumOwnerSeconds:60}]});
 await env.DB.prepare('UPDATE pages SET deleted_at=? WHERE id=?').bind(ctx.now,secret.id).run();
 await expect(requireEvaluationSkill(ctx,skill.value.revisionId,cases.value.id,'Exact question',[host.ref])).rejects.toMatchObject({status:404});
});
test('SOURCE-005 — complete archive refuses retained skill prose when its source authority has been erased',async()=>{
 const f=await fixture(),host=await document(f,'Host'),secret=await document(f,'Erased confidential evidence');
 await createSkill(f.context(),{operationKey:'export-skill',pageId:host.id,name:'Private skill',definition:definition(f,[host.ref,secret.ref])});
 await env.DB.prepare('UPDATE pages SET deleted_at=? WHERE id=?').bind(f.context().now,secret.id).run();
 await expect(exportWorkspace(f.context())).rejects.toMatchObject({code:'EXPORT_SCOPE_INCOMPLETE'});
});


// Keep each clause point visible in the failure while sharing one family registration.
async function scenario(name: string, run: () => Promise<void>) {
  try { await run(); }
  catch (cause) { throw new Error(`Scenario ${name} failed`, { cause }); }
}
