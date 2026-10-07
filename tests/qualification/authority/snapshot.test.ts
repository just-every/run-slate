import {env} from 'cloudflare:test';
import {beforeEach,test,expect} from 'vitest';
import {unzipSync,strFromU8} from 'fflate';
import {reset,fixture,document,definition} from './fixture';
import {createSkill} from '../../../src/core/features/skills/service';
import {exportSkillSnapshot} from '../../../src/core/features/skills/export';
beforeEach(reset);
test('SKILL-001 — portable SKILL.md preserves exact definition and original attachment with snapshot labels and current disclosure checks',async()=>{
 const f=await fixture(),host=await document(f,'Skill source with attachment'),def=definition(f,[host.ref]),bytes=new TextEncoder().encode('Original permitted source attachment');
 await env.FILES.put('test/skill-attachment',bytes);await env.DB.prepare("INSERT INTO files(id,workspace_id,page_id,storage_key,original_name,content_type,size_bytes,created_at) VALUES('skill-file',?,?,'test/skill-attachment','original.txt','text/plain',?,?)").bind(f.workspaceId,host.id,bytes.length,f.context().now).run();
 const skill=await createSkill(f.context(),{operationKey:'skill-export',pageId:host.id,name:'Exact owned method',definition:def});
 const archive=unzipSync((await exportSkillSnapshot(f.context(f.reader),skill.value.revisionId)).bytes),snapshot=JSON.parse(strFromU8(archive['snapshot.json']!));
 expect(snapshot).toMatchObject({revisionId:skill.value.revisionId,ownerId:f.owner,executionAuthority:false,synchronization:'none',definition:def});
 expect(strFromU8(archive['SKILL.md']!)).toContain('no live synchronization or execution authority');expect(archive['attachments/0']).toEqual(bytes);
 await env.DB.prepare('DELETE FROM page_grants WHERE id=?').bind(host.grantId).run();
 await expect(exportSkillSnapshot(f.context(f.reader),skill.value.revisionId)).rejects.toMatchObject({status:404});
});
