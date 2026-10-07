/** Compose only exact executed assertions; never promote a partial check to clause acceptance. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
const map=JSON.parse(await readFile(process.env.QUAL_CLAUSE_MAP,'utf8')),files=JSON.parse(process.env.QUAL_RECEIPT_FILES??'[]');
const reconciliation=process.env.QUAL_RECONCILIATION?JSON.parse(await readFile(process.env.QUAL_RECONCILIATION,'utf8')):null;
const reconciled=new Map((reconciliation?.clauses??reconciliation?.rows??[]).map(row=>[row.id,row]));
const runs=await Promise.all(files.map(async file=>({file,data:JSON.parse(await readFile(file,'utf8'))})));
const assertions=runs.flatMap(({file,data})=>(data.receipts??(data.testResults?data.testResults.flatMap(suite=>suite.assertionResults).map(test=>({clauses:[...new Set(test.fullName.match(/\b[A-Z]+(?:-[A-Z]+)?-\d{3}\b/g)??[])],id:test.fullName,outcome:test.status==='passed'?'pass':test.status,error:test.failureMessages?.join('\n')})):(data.clause?[{clauses:[data.clause],id:data.assertion,outcome:'pass'}]:data.clauses?[{clauses:data.clauses,id:data.id,outcome:data.passed===false?'fail':'pass'}]:[]))).map(assertion=>({...assertion,evidence:file,artifact:data.artifact??data.cleanArtifact,date:data.date,limits:data.limits??'See executed assertion and run identity.'})));
const latest=new Map();for(const assertion of assertions){const prior=latest.get(assertion.id);if(!prior||Date.parse(assertion.date??'')>=Date.parse(prior.date??''))latest.set(assertion.id,assertion);}
for(const assertion of assertions)assertion.superseded=latest.get(assertion.id)!==assertion;
const shared={
 'WORK-014':'WP02 final shortcut/typed-format equivalence remains composed UI evidence.',
 'SEARCH-006':'WP02 final container-entry and visible scope/filters requires UI lane evidence.',
 'SEARCH-007':'WP02 final no-results query/filter restatement, clear and create controls requires UI lane evidence.',
 'ACT-002':'Full named mutation-family audit exercised by audit-*.test.ts: exact action/actor/feature/time and one durable entry per semantic operation; source freeze rerun remains parent gate.',
 'ACT-004':'Final routed thread/revision/grant context navigation requires UI lane evidence.',
 'FLAG-001':'Full 242 clauses, 17 values, six journeys and sustained loop remain root-composed gate.',
 'FLAG-002':'Compose customization, old-data, restore, accessibility, touch and capacity evidence from all lanes; no release claim.',
 'FLAG-003':'Executed local frozen-case, exact comparator input, cutoff and poisoned-derived-index isolation mechanics. All-person setup/interruption/repair accounting and independent held-out/expert, useful outcomes and prospective economics remain unqualified; no real inference here.',
 'FLAG-004':'Complete portability and lineage belong to recovery lane and composed gate.',
 'BASE-OPS-002':'Old-data/additive migration and recovery proof belongs to recovery lane; all current migrations applied here.',
 'BASE-OPS-005':'Full named mutation audit includes retained anonymized deletion history and real automated comment effect linked through its durable operation receipt. Final composed rerun remains required.',
};
const clauses=map.clauses.filter(c=>['WP01','WP05','WP10'].includes(c.workPackage)).map(c=>{const matches=assertions.filter(a=>a.clauses.includes(c.id));return {id:c.id,workPackage:c.workPackage,requirementSha256:c.requirementSha256,requiredLocalCheck:reconciled.get(c.id)?.requiredLocalCheck,externalRemainders:reconciled.get(c.id)?.externalRemainders??[],assertions:matches,status:matches.some(a=>!a.superseded&&a.outcome==='fail')?'failing-local-assertion':matches.length?'executed-local-portions':'composition-dependency',remaining:shared[c.id]??'The exact assertions prove only their named local portions. Full clause acceptance requires root review and any additional UI/provider/composed evidence in the execution plan.',accepted:false};});
const output=process.env.QUAL_EVIDENCE;await mkdir(output,{recursive:true});await writeFile(path.join(output,'CLAUSE-RECEIPT.json'),JSON.stringify({date:new Date().toISOString(),scope:'WP01 19 + WP05 17 + WP10 14; no whole-clause acceptance',counts:{clauses:clauses.length,assertions:assertions.length,withAssertions:clauses.filter(c=>c.assertions.length).length,failing:clauses.filter(c=>c.status==='failing-local-assertion').length},clauses},null,2));
