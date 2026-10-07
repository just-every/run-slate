import {env} from 'cloudflare:test';
import {test,expect,beforeEach} from 'vitest';
import {fixture,reset,document,definition,passingEvaluation} from './fixture';
import {createSkill,transitionSkill} from '../../../src/core/features/skills/service';
import {requireActiveSkill} from '../../../src/core/features/skills/admission';
import {exportWorkspace,restoreWorkspace} from '../../../src/core/features/portability/service';
import {decodeArchive} from '../../../src/core/features/portability/archive';
beforeEach(reset);
test('FLAG-004 — real D1 and R2 archive restore retains evaluated history while all executable authority stays inactive',async()=>{
 const f=await fixture(),host=await document(f,'Portable method and original file'),def={...definition(f,[host.ref]),audience:[f.owner]};
 const skill=await createSkill(f.context(),{operationKey:'recovery-method',pageId:host.id,name:'Recoverable evaluated method',definition:def}),evaluationId=await passingEvaluation(f.context(),skill.value.revisionId);
 await transitionSkill(f.context(),{operationKey:'recovery-activation',revisionId:skill.value.revisionId,action:'activate'});
 expect((await requireActiveSkill(f.context(),skill.value.revisionId,[host.ref],[f.owner],1)).instructions).toBe(def.instructions);
 await env.DB.prepare('UPDATE workspaces SET ai_enabled=1 WHERE id=?').bind(f.workspaceId).run();
 const now=f.context().now;
 await env.DB.batch([
  env.DB.prepare("INSERT INTO intelligence_route_evaluations VALUES('test-route-eval',?,'route-r1','local-codex','test-only','answer','{\"label\":\"fixture\"}',1,'2099-01-01',NULL,?)").bind(f.workspaceId,now),
  env.DB.prepare("INSERT INTO intelligence_run_equivalence VALUES(?,'test-equivalence','test-run','2099-01-01')").bind(f.workspaceId),
  env.DB.prepare("INSERT INTO intelligence_ambient_scopes VALUES('test-scope',?,? ,?,'scope-r1',?,?,'Retained objective','active',60,10,0.5,?,NULL,?,?)").bind(f.workspaceId,f.owner,host.id,JSON.stringify([host.ref]),JSON.stringify([f.owner]),now,now,now),
  ...['prepared','assessed'].map(state=>env.DB.prepare("INSERT INTO intelligence_ambient_events VALUES(?, 'test-scope',?,?,'change',?,NULL,NULL,?, ?,NULL,?,?)").bind('test-event-'+state,f.workspaceId,'test-'+state,JSON.stringify([host.ref]),state,state==='assessed'?'{}':null,now,now)),
  ...['reserved','delivered'].map(state=>env.DB.prepare('INSERT INTO intelligence_interruptions VALUES(?,?,?, ?,?,10,?,0,?,?)').bind('test-interruption-'+state,f.workspaceId,f.owner,'test-'+state,'test-run',state,now,now)),
 ]);
 const exported=await exportWorkspace(f.context()),key=await env.DB.prepare('SELECT archive_key FROM federation_exports WHERE id=?').bind(exported.id).first<string>('archive_key');
 const bytes=new Uint8Array(await(await env.FILES.get(key!))!.arrayBuffer()),before=(await decodeArchive(bytes)).manifest;
 expect(before.tables.intelligence_skill_versions![0]).toMatchObject({state:'active',authority_id:`member:${f.owner}`,evaluation_id:evaluationId});
 await reset();const target=await fixture();await restoreWorkspace(target.context(),bytes);
 const retained=await env.DB.prepare('SELECT * FROM intelligence_skill_versions WHERE id=?').bind(skill.value.revisionId).first();
 expect(retained).toMatchObject({state:'evaluated',authority_id:null,evaluation_id:evaluationId,definition_json:JSON.stringify(def)});
 expect(await env.DB.prepare('SELECT passed FROM intelligence_evaluations WHERE id=?').bind(evaluationId).first<number>('passed')).toBe(1);
 expect(await env.DB.prepare('SELECT ai_enabled FROM workspaces WHERE id=?').bind(f.workspaceId).first<number>('ai_enabled')).toBe(0);
 expect(await env.DB.prepare('SELECT status FROM members WHERE id=?').bind(f.reader).first<string>('status')).toBe('historical');
 await expect(requireActiveSkill(f.context(),skill.value.revisionId,[host.ref],[f.owner],1)).rejects.toMatchObject({code:'SKILL_CHANGED'});
 const again=await exportWorkspace(f.context()),nextKey=await env.DB.prepare('SELECT archive_key FROM federation_exports WHERE id=?').bind(again.id).first<string>('archive_key'),after=(await decodeArchive(new Uint8Array(await(await env.FILES.get(nextKey!))!.arrayBuffer()))).manifest;
 expect(after.tables.intelligence_ambient_scopes![0]).toMatchObject({state:'stopped',objective:'Retained objective'});
 expect(after.tables.intelligence_ambient_events!.find(row=>row.id==='test-event-prepared')).toMatchObject({state:'blocked',failure_reason:'RESTORED_AUTHORITY_REQUIRED'});
 expect(after.tables.intelligence_ambient_events!.find(row=>row.id==='test-event-assessed')).toEqual(before.tables.intelligence_ambient_events!.find(row=>row.id==='test-event-assessed'));
 expect(after.tables.intelligence_interruptions!.find(row=>row.id==='test-interruption-reserved')!.state).toBe('released');
 expect(after.tables.intelligence_interruptions!.find(row=>row.id==='test-interruption-delivered')).toEqual(before.tables.intelligence_interruptions!.find(row=>row.id==='test-interruption-delivered'));
 expect(after.tables.intelligence_run_equivalence).toEqual(before.tables.intelligence_run_equivalence);
 expect(after.tables.intelligence_route_evaluations![0]!.revoked_at).not.toBeNull();
 expect(after.tables.intelligence_evaluations).toEqual(before.tables.intelligence_evaluations);
 expect(after.tables.intelligence_revisions).toEqual(before.tables.intelligence_revisions);
 expect(after.tables.page_revisions).toEqual(before.tables.page_revisions);
 expect(after.blobs.map(b=>b.hash).sort()).toEqual(before.blobs.map(b=>b.hash).sort());
 await transitionSkill(f.context(),{operationKey:'fresh-owner-activation',revisionId:skill.value.revisionId,action:'activate'});
 expect((await requireActiveSkill(f.context(),skill.value.revisionId,[host.ref],[f.owner],1)).instructions).toBe(def.instructions);
});
