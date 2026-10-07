import {env} from 'cloudflare:test';
import {beforeEach,test,expect} from 'vitest';
import {fixture,document,definition,reset} from '../authority/fixture';
import {createSkill} from '../../../src/core/features/skills/service';
import {requireExportCoverage} from '../../../src/core/features/portability/coverage';
beforeEach(reset);
test('PORT-003 erased payload-free skill tombstones do not prevent backups; substantive retired definitions still require disclosure',async()=>{
 const f=await fixture(),page=await document(f,'Method evidence'),skill=await createSkill(f.context(),{operationKey:'portable-erased-skill',pageId:page.id,name:'Sensitive method',definition:definition(f,[page.ref])});
 await env.DB.prepare("UPDATE intelligence_skill_versions SET state='retired',definition_json='{}' WHERE skill_id=?").bind(skill.value.id).run();
 await expect(requireExportCoverage(f.context())).rejects.toMatchObject({code:'EXPORT_SCOPE_INCOMPLETE'});
 await env.DB.prepare("UPDATE intelligence_skills SET name='' WHERE id=?").bind(skill.value.id).run();
 await expect(requireExportCoverage(f.context())).resolves.toBeUndefined();
 await env.DB.prepare("UPDATE intelligence_skill_versions SET state='active' WHERE skill_id=?").bind(skill.value.id).run();
 await expect(requireExportCoverage(f.context())).rejects.toMatchObject({code:'EXPORT_SCOPE_INCOMPLETE'});
 await env.DB.prepare("UPDATE intelligence_skill_versions SET state='retired',definition_json='invalid-json' WHERE skill_id=?").bind(skill.value.id).run();
 await expect(requireExportCoverage(f.context())).rejects.toMatchObject({code:'EXPORT_SCOPE_INCOMPLETE'});

 await env.DB.prepare("UPDATE intelligence_skill_versions SET definition_json=? WHERE skill_id=?").bind(JSON.stringify({...definition(f,[page.ref]),audience:[f.reader]}),skill.value.id).run();
 await expect(requireExportCoverage(f.context())).rejects.toMatchObject({code:'EXPORT_SCOPE_INCOMPLETE'});
});
