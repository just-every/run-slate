import {attemptMeasurements} from './attempts.mjs';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
const sqlString=value=>`'${String(value).replaceAll("'","''")}'`;
export async function inquiryChecks({page,context,runtime,id,check}) {
 const read=async path=>await(await context.request.get(runtime.origin+path)).json();
 await page.goto(runtime.origin+'/app/pages/'+id);const paragraph=page.getByRole('textbox',{name:'Paragraph',exact:true}).first();await paragraph.waitFor();
 await paragraph.evaluate(el=>{el.focus();const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);const node=walker.nextNode();const range=document.createRange();range.setStart(node,0);range.setEnd(node,2);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);});
 await page.getByRole('toolbar',{name:'Formatting for the selected text'}).getByRole('button',{name:'Ask AI',exact:true}).click();await page.getByRole('heading',{name:'Work with selected text',exact:true}).waitFor();
 const doc=await read('/api/pages/'+id);let request;
 for(const action of ['improve','proofread','explain','shorten','expand','tone','translate','custom']){
  await page.getByLabel('Writing action').selectOption(action);await page.getByLabel('Instructions, target language or tone').fill('Labelled local request; do not start inference');
  const responsePromise=page.waitForResponse(r=>r.url().endsWith('/api/ai/ask'));await page.getByRole('button',{name:'Ask Slate',exact:true}).click();const response=await responsePromise;request=response.request().postDataJSON();assert.equal(response.status(),503);assert.equal(request.selection.action,action);assert.equal(request.selection.revisionId,doc.workingRevisionId);assert.equal(request.selection.text,request.selection.text.slice(0,2));assert.equal(request.kind,'edit');
 }
 assert.equal((await runtime.sql('SELECT count(*) n FROM intelligence_runs'))[0].results[0].n,0);
 check(['AI-001','AI-017'],'Eight actual selection writing controls submit exact block/range/snapshot/action; unavailable provider rejects before any run or inference');
 // Explicit retained-output fixture only: test rendering, CAS acceptance and refinement rejection, not generated quality.
 const selection=request.selection,now=new Date().toISOString(),runId='interface-retained-selection',question=doc.page.title;
 const answer={statements:[{text:'Labelled retained UI test result',evidenceIds:['E1'],kind:'supported',limitations:['Synthetic retained output, no generated quality evidence']}],unresolved:[],proposedChanges:[{targetId:selection.blockId,text:'Our',evidenceIds:['E1']}]};
 const input={pageId:id,question,kind:'edit',refs:[{kind:'page',sourceId:id,revisionId:selection.revisionId}],selection};
 await runtime.sql(`UPDATE workspaces SET ai_enabled=1 WHERE id='qualification-workspace'; INSERT INTO intelligence_runs(id,workspace_id,requester_id,page_id,kind,status,stage,revision_id,input_json,refs_json,audience_json,output_json,provider,model,created_at,updated_at) VALUES(${[runId,'qualification-workspace','qualification-owner',id,'edit','needs-review','review','interface-retained-revision',JSON.stringify(input),JSON.stringify(input.refs),JSON.stringify(['qualification-owner']),JSON.stringify({answer}),'deterministic','retained-output-only',now,now].map(sqlString).join(',')});`);
 await attemptMeasurements({page,runtime,runId,check});
 await page.goto(runtime.origin+'/app/runs/'+runId);await page.getByText('Labelled retained UI test result',{exact:true}).waitFor();await page.getByText('Refine the suggestion',{exact:true}).click();await page.getByLabel('What should change?').fill('Make the exact selected proposal shorter');const refinement=page.waitForResponse(r=>r.url().endsWith('/refine'));await page.getByRole('button',{name:'Prepare a refined suggestion',exact:true}).click();const refined=await refinement;assert.equal(refined.status(),503);assert.equal(refined.request().postDataJSON().expectedRevisionId,'interface-retained-revision');assert.equal((await read('/api/runs/'+runId)).status,'needs-review');
 check(['AI-017'],'Retained suggestion refine control submits current run CAS and instruction; unavailable provider leaves original proposal reviewable');
 // Advance mutable access revision only; accept immutable selection with the new page CAS.
 const owner=await read('/api/members/current');const retainedGrant=await context.request.post(runtime.origin+'/api/sharing',{data:{operationKey:'interface-retain-owner-full',targetKind:'page',targetId:id,principalKind:'member',principalId:owner.id,level:'full'}});assert.equal(retainedGrant.status(),200);
 const original=await read('/api/pages/'+id);const restriction=await context.request.put(runtime.origin+`/api/sharing/pages/${id}/inheritance`,{data:{operationKey:'interface-retained-cas-change',expectedRevisionId:original.page.revisionId,restricted:true}});assert.equal(restriction.status(),200);const metadata=await read('/api/pages/'+id);assert.equal(metadata.workingRevisionId,selection.revisionId);assert.notEqual(metadata.page.revisionId,selection.revisionId);
 await page.reload();await page.locator('.proposal-review input[type=checkbox]').check();const applying=page.waitForResponse(r=>r.url().endsWith('/accept-changes'));await page.getByRole('button',{name:'Apply 1 selected change',exact:true}).click();const accepted=await applying;assert.equal(accepted.status(),200,await accepted.text());assert.equal(accepted.request().postDataJSON().selections[0].expectedPageRevisionId,metadata.page.revisionId);
 const after=await read('/api/pages/'+id),oldText=original.blocks[0].content.text.map(s=>s.text).join(''),newText=after.blocks[0].content.text.map(s=>s.text).join('');assert.equal(newText,'Our'+oldText.slice(2));assert.equal((await read('/api/runs/'+runId)).status,'completed');
 check(['AI-005','AI-017','SAVE-003'],'Real retained selection acceptance updates only selected characters using current page CAS after metadata change; outside text survives and run completes once');
 const exact=await read('/api/runs?question='+encodeURIComponent(question));assert.ok(exact.items.some(r=>r.id===runId));assert.ok(!(await read('/api/runs?question=Other')).items.some(r=>r.id===runId));
 // Presenting retained evidence makes no provider call. The fixture key is invalid and never used for a send.
 const configPath=path.join(runtime.directory,'wrangler.json'),config=JSON.parse(await readFile(configPath,'utf8'));config.vars.AI_API_KEY='TEST-FIXTURE-INVALID-READ-ONLY';await writeFile(configPath,JSON.stringify(config,null,2));
 await runtime.sql(`UPDATE workspaces SET ai_enabled=1 WHERE id='qualification-workspace'; INSERT INTO intelligence_model_policy(workspace_id,policy_json,revision_id,owner_id,updated_at) VALUES('qualification-workspace','{"routes":[]}','interface-read-only-policy','qualification-owner',${sqlString(now)}) ON CONFLICT(workspace_id) DO NOTHING;`);
 for(let n=0;n<50;n++){if((await read('/api/ai/availability')).providerConfigured)break;await page.waitForTimeout(200);}
 assert.equal((await read('/api/ai/availability')).providerConfigured,true);
 await page.goto(runtime.origin+'/app/search');await page.getByRole('searchbox',{name:'Search your workspace'}).fill(question);await page.getByRole('button',{name:'Search',exact:true}).click();await page.getByRole('region',{name:'Retained answer'}).getByText('Labelled retained UI test result',{exact:true}).waitFor();await page.getByRole('link',{name:'Continue this same conversation',exact:true}).click();await page.waitForURL('**/app/runs/'+runId);
 check(['AI-015','SEARCH-008'],'Exact stored question association renders retained answer and continues its same run; labelled read-only configuration and retained fixture made no provider send');
 await runtime.sql("UPDATE workspaces SET ai_enabled=0 WHERE id='qualification-workspace'");
 delete config.vars.AI_API_KEY;await writeFile(configPath,JSON.stringify(config,null,2));
}
