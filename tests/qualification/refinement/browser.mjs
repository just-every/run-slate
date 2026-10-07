// Native emitted Worker/browser; ONLY retained protocol outputs are fixtures.
// Queue consumers are absent so no inference, mail, or provider effects can dispatch.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {createRuntime} from '../local/runtime.mjs';
import {fixtureFirstOwner} from '../local/first-owner.mjs';
const evidence=process.env.QUAL_EVIDENCE;
assert.ok(evidence,'QUAL_EVIDENCE required');
const quote=value=>`'${String(value).replaceAll("'","''")}'`;
let runtime,browser,page;const receipts=[];
try{
 runtime=await createRuntime({root:process.cwd(),evidence,appPort:8746,inspectorPort:8747});
 browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1440,height:1100}});
 ({page}=await fixtureFirstOwner(runtime,context));
 const configPath=runtime.directory+'/wrangler.json',config=JSON.parse(await readFile(configPath,'utf8'));
 config.queues={...config.queues,consumers:[]};config.vars.AI_API_KEY='CONTROLLED-PROTOCOL-NO-CONSUMERS';
 await writeFile(configPath,JSON.stringify(config,null,2));
 await runtime.sql("UPDATE workspaces SET ai_enabled=1,ai_monthly_budget_micros=2000000 WHERE id='qualification-workspace'");
 const read=async path=>{const response=await context.request.get(runtime.origin+path);assert.equal(response.status(),200,await response.text());return response.json();};
 const send=async(path,data,method='post')=>{const response=await context.request[method](runtime.origin+path,{data,headers:{Origin:runtime.origin}});const text=await response.text();receipts.push({path,status:response.status(),request:data,response:JSON.parse(text)});assert.equal(response.status(),200,text);return JSON.parse(text);};
 const id=(await read('/api/pages')).items[0].id;
 const doc=await read('/api/pages/'+id);
 const refs=[{kind:'page',sourceId:id,revisionId:doc.workingRevisionId}];
 const routeEval=await send('/api/ai/route-evaluations',{operationKey:'browser-route-evaluation',provider:'openai',model:'controlled-protocol',task:'answer',cutoff:'2020-01-01T00:00:00.000Z',expiresAt:'2099-01-01T00:00:00.000Z',minimumFit:0.9,cases:[{caseId:'browser-held-out',heldOut:true,observedAt:new Date().toISOString(),passed:true,costMicros:20,elapsedMs:1,receipt:'controlled-protocol-only',refs}]});
 await send('/api/ai/model-policy',{operationKey:'browser-model-policy',policy:{attentionBudget:100,routes:[{provider:'openai',model:'controlled-protocol',role:'frontier',inputMicrosPerMillion:1000000,outputMicrosPerMillion:1000000,maxRunMicros:1000000,monthlyMicros:2000000,tasks:['answer'],evaluationId:routeEval.value.id}]}},'put');
 const definition={instructions:'Read exact sources and retain the unresolved handoff. Controlled protocol fixture.',refs,audience:['qualification-owner'],tools:['read-evidence'],effects:[],preconditions:['Current source authority'],successTests:['Retain the unresolved handoff'],escalations:['Unknown authority'],maxCostMicros:150000};
 const original=await send('/api/skills',{operationKey:'browser-original-method',pageId:id,name:'Handoff procedure',definition});
 const skillId=original.value.id;
 const answer={ambientAssessment:null,evaluationAssessment:null,procedurePlan:null,statements:[{text:'The handoff is unresolved.',kind:'observation',evidenceIds:['E1'],limitations:['Controlled retained protocol output; no actual inference.']}],unresolved:[],proposedChanges:[],researchPlan:null,hypothesisAssessment:null};
 async function retained(runIds,value){const now=new Date().toISOString();await runtime.sql(runIds.map(runId=>`UPDATE intelligence_runs SET status='completed',stage='complete',output_json=${quote(JSON.stringify({answer:value}))},cost_micros=20,tokens=20,settled_at=${quote(now)},updated_at=${quote(now)} WHERE id=${quote(runId)}; UPDATE intelligence_budgets SET charged_micros=20,released_at=${quote(now)} WHERE run_id=${quote(runId)}; UPDATE intelligence_interruptions SET state='released',updated_at=${quote(now)} WHERE run_id=${quote(runId)} AND state='reserved';`).join('\n'));}
 async function openSkills(){if(!await page.getByText('Procedures from this page',{exact:true}).isVisible())await page.getByRole('button',{name:'Ask',exact:true}).click();if(!await page.getByLabel('Revision to inspect').isVisible())await page.getByText('Procedures from this page',{exact:true}).click();await page.getByLabel('Revision to inspect').waitFor();}
 async function comparison(revisionId,label,passed){
  await page.goto(runtime.origin+'/app/pages/'+id);await openSkills();await page.getByLabel('Revision to inspect').selectOption(revisionId);
  const prepare=page.waitForResponse(r=>r.url().endsWith('/prepare-evaluation'));
  await page.getByRole('button',{name:'Evaluate selected draft',exact:true}).focus();await page.keyboard.press('Enter');
  const response=await prepare;assert.equal(response.status(),200,await response.text());assert.equal(response.request().postDataJSON().revisionId,revisionId);const result=await response.json();receipts.push({label,prepare:result,request:response.request().postDataJSON()});
  await page.screenshot({path:runtime.directory+'/'+label+'-prepared.png',fullPage:true});
  await retained([result.candidateRunId,result.genericRunId],answer);
  await send('/api/skills/evaluations/'+result.id+'/attention',{operationKey:label+'-attention',candidateOwnerSeconds:12,genericOwnerSeconds:20});
  await send('/api/skills/evaluations/'+result.id+'/baseline',{operationKey:label+'-baseline',result:'The handoff is unresolved.',method:'Explicit independent retained protocol fixture, no human quality claim',startedAt:result.startedAt,ownerSeconds:25,toolCostMicros:0});
  const judge=await send('/api/skills/evaluations/'+result.id+'/complete',{});
  await retained([judge.judgeRunId],{...answer,evaluationAssessment:{criteria:definition.successTests.map(criterion=>({criterion,candidatePassed:passed,genericPassed:true,expertPassed:true,explanation:'Controlled independent protocol result, no quality claim',evidenceIds:['E1']}))}});
  await page.reload();await openSkills();await page.getByLabel('Revision to inspect').selectOption(revisionId);
  const completing=page.waitForResponse(r=>r.url().endsWith('/complete'));await page.getByRole('button',{name:'Check comparison and assess outcomes',exact:true}).click();const completion=await completing;assert.equal(completion.status(),passed?200:409,await completion.text());
  if(passed)await page.getByRole('button',{name:'Activate evaluated procedure',exact:true}).waitFor();else await page.getByRole('alert').filter({hasText:'failed a frozen success criterion'}).waitFor();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow');await page.screenshot({path:runtime.directory+'/'+label+(passed?'-evaluated':'-failed')+'.png',fullPage:true});
  return result;
 }
 async function activate(revisionId){const response=page.waitForResponse(r=>r.url().endsWith('/'+revisionId+'/transition'));await page.getByRole('button',{name:'Activate evaluated procedure',exact:true}).focus();await page.keyboard.press('Enter');assert.equal((await response).status(),200);await page.getByRole('button',{name:'Retire this procedure',exact:true}).waitFor();}
 await comparison(original.value.revisionId,'original',true);await activate(original.value.revisionId);
 const first=await send('/api/skills',{operationKey:'browser-first-refinement',pageId:id,name:'Handoff procedure',definition:{...definition,instructions:definition.instructions+' First refinement.'},skillId,expectedRevisionId:original.value.revisionId});
 const second=await send('/api/skills',{operationKey:'browser-second-refinement',pageId:id,name:'Handoff procedure',definition:{...definition,instructions:definition.instructions+' Second refinement.'},skillId,expectedRevisionId:original.value.revisionId});
 await page.reload();await openSkills();await page.getByLabel('Revision to inspect').waitFor();await page.screenshot({path:runtime.directory+'/active-with-parallel-drafts.png',fullPage:true});
 await comparison(first.value.revisionId,'first-refinement',false);
 let listing=await read('/api/skills?pageId='+id);assert.equal(listing.items[0].current_revision_id,original.value.revisionId);
 await comparison(second.value.revisionId,'second-refinement',true);
 listing=await read('/api/skills?pageId='+id);assert.equal(listing.items[0].current_revision_id,original.value.revisionId);
 await activate(second.value.revisionId);
 const reuse=await send('/api/ai/ask',{operationKey:'browser-normal-reuse',pageId:id,question:'What handoff remains?',kind:'answer',refs,audience:['qualification-owner'],frontier:true,maxOutputTokens:100,skillRevisionId:second.value.revisionId});
 await retained([reuse.value.id],answer);
 const run=await read('/api/runs/'+reuse.value.id);assert.equal(run.skillRevisionId,second.value.revisionId);assert.equal(run.cost,20);
 await page.reload();await openSkills();await page.getByLabel('Revision to inspect').waitFor();await page.screenshot({path:runtime.directory+'/refinement-active-reuse.png',fullPage:true});
 const stored=(await runtime.sql(`SELECT id,state FROM intelligence_skill_versions WHERE skill_id=${quote(skillId)}; SELECT id,skill_revision_id,cost_micros,reserved_micros,status FROM intelligence_runs WHERE id=${quote(reuse.value.id)};`));
 await writeFile(runtime.directory+'/receipts.json',JSON.stringify({receipts,stored,artifact:runtime.artifact,limits:'Native emitted Worker, D1, UI, keyboard selection/activation and HTTP requests. Queue consumers disabled; retained candidate/generic/judge outputs and costs are explicit controlled protocol fixtures. No inference, provider delivery, empirical quality, or public acceptance.'},null,2));console.log(runtime.directory);
}catch(error){if(runtime){await page?.screenshot({path:runtime.directory+'/failure.png',fullPage:true}).catch(()=>{});await writeFile(runtime.directory+'/failure.txt',String(error.stack));console.error(runtime.directory);}throw error;}finally{await browser?.close();await runtime?.close();}
