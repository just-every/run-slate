/** Deterministic qualification mechanics only; labelled model-route fixtures, no live inference. */
import {env} from 'cloudflare:test';
import {test,expect,vi,afterEach} from 'vitest';
import {fixture} from '../inquiry/fixture';
import {createSkill} from '../../../src/core/features/skills/service';
import {freezeCases} from '../../../src/core/features/skills/cases';
import {prepareEvaluation} from '../../../src/core/features/skills/evaluation-workflow';
import {resolveEvidence} from '../../../src/core/features/ai/evidence';
import {refreshSearchIndex} from '../../../src/core/features/search/index';
afterEach(()=>vi.unstubAllGlobals());
async function method(){const f=await fixture();const skill=await createSkill(f.context(),{operationKey:'qualification-quality-method',pageId:f.page.pageId,name:'Cutoff qualification',definition:{instructions:'Use only the frozen evidence.',refs:f.refs,audience:[f.owner],tools:['read-evidence'],effects:[],preconditions:['Current source'],successTests:['Identify the unresolved handoff'],escalations:['Unknown authority'],maxCostMicros:1000000}});return {...f,skill};}
test('FLAG-003 prepared candidate and generic runs share exact frozen evidence, question, audience and model limits without provider calls',async()=>{
 const f=await method();const network=vi.fn(()=>{throw Error('No network authorized in preparation proof');});vi.stubGlobal('fetch',network);
 const ctx=f.context(),prepared=await prepareEvaluation(ctx,f.skill.value.id,{operationKey:'qualification-quality-prepare'},{apiKey:'TEST-ONLY-NO-SEND'});
 const records=(await env.DB.prepare('SELECT * FROM intelligence_runs WHERE id IN (?,?) ORDER BY id').bind(prepared.candidateRunId,prepared.genericRunId).all<Record<string,unknown>>()).results;expect(records).toHaveLength(2);
 for(const key of ['refs_json','audience_json','kind','model','provider']){expect(typeof records[0][key]).toBe('string');expect(records[0][key]).toEqual(records[1][key]);}
 const inputs=records.map(r=>JSON.parse(String(r.input_json)));for(const key of ['question','maxOutputTokens']){expect(inputs[0][key]).toBeDefined();expect(inputs[0][key]).toEqual(inputs[1][key]);}
 expect(new Set(records.map(r=>r.skill_revision_id))).toEqual(new Set([null,f.skill.value.revisionId]));
 const frozen=await env.DB.prepare('SELECT cutoff,source_refs_json,created_at FROM intelligence_evaluation_cases WHERE id=?').bind(prepared.id).first<{cutoff:string;source_refs_json:string;created_at:string}>();expect(JSON.parse(frozen!.source_refs_json)).toEqual(f.refs);expect(frozen!.cutoff).toBe(ctx.now);expect(records.every(r=>String(r.created_at)>=frozen!.created_at)).toBe(true);expect(network).not.toHaveBeenCalled();
});
test('FLAG-003 frozen case operation rejects changed cases and future cutoffs',async()=>{
 const f=await method(),ctx=f.context(),input={operationKey:'qualification-quality-freeze',revisionId:f.skill.value.revisionId,cutoff:ctx.now,refs:f.refs,cases:[{name:'Frozen case',question:'Which handoff is open?',requiredEvidenceIds:['E1'],requiredStatements:['handoff'],forbiddenStatements:['confirmed ready'],maximumOwnerSeconds:30}]};
 const frozen=await freezeCases(ctx,input);await expect(freezeCases(ctx,{...input,cases:[{...input.cases[0],question:'Changed after freeze'}]})).rejects.toBeTruthy();await expect(freezeCases(ctx,{...input,operationKey:'qualification-quality-future',cutoff:'2099-01-01T00:00:00.000Z'})).rejects.toMatchObject({code:'FUTURE_CUTOFF'});
 expect(JSON.parse((await env.DB.prepare('SELECT cases_json FROM intelligence_evaluation_cases WHERE id=?').bind(frozen.value.id).first<{cases_json:string}>())!.cases_json)).toEqual(input.cases);
});
test('FLAG-003 historical evidence excludes later canonical revisions and ignores poisoned derived search text',async()=>{
 const f=await method(),ctx=f.context(),before=await resolveEvidence(ctx,f.refs,[f.owner],{cutoff:ctx.now});await refreshSearchIndex(ctx);
 const poisoned=await env.DB.prepare("UPDATE search_text SET text='Future success outcome label',text_fold='future success outcome label',title='Future success label',title_fold='future success label' WHERE page_id=?").bind(f.page.pageId).run();expect(poisoned.meta.changes).toBeGreaterThan(0);
 expect(await resolveEvidence(ctx,f.refs,[f.owner],{cutoff:ctx.now})).toEqual(before);
 await env.DB.prepare("INSERT INTO page_revisions(id,page_id,author_member_id,origin,content_hash,body_json,properties_json,created_at) VALUES('qualification-future-revision',?,?,'autosave','future-hash','[]','{}','2099-01-01T00:00:00.000Z')").bind(f.page.pageId,f.owner).run();
 await expect(resolveEvidence(ctx,[{...f.refs[0],revisionId:'qualification-future-revision'}],[f.owner],{cutoff:ctx.now})).rejects.toMatchObject({code:'EVIDENCE_UNAVAILABLE'});
});
