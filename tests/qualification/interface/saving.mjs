import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
export async function saveChecks({page,context,runtime,id,check}) {
 const read=async()=>await(await context.request.get(runtime.origin+'/api/pages/'+id)).json();
 await page.goto(runtime.origin+'/app/pages/'+id);
 await page.getByRole('button',{name:'Share',exact:true}).click();
 await page.locator('select[name=principal]').selectOption('member:qualification-owner');await page.locator('select[name=level]').first().selectOption('full');await page.getByRole('button',{name:'Grant access',exact:true}).click();await page.getByRole('combobox',{name:'Access for Qualification owner',exact:true}).waitFor();
 const fresh=await read();
 const toggle=page.getByRole('button',{name:'Restrict inherited access',exact:true});
 await toggle.click();await page.getByRole('button',{name:'Restore inherited access',exact:true}).waitFor();
 const restricted=await read();assert.notEqual(restricted.page.revisionId,fresh.page.revisionId);assert.equal(restricted.workingRevisionId,fresh.workingRevisionId);
 await page.reload();const title=page.getByRole('textbox',{name:'Page title',exact:true});await title.fill('CAS after sharing change');await title.press('Tab');await page.getByRole('status').filter({hasText:/^Saved$/}).waitFor();assert.equal((await read()).page.title,'CAS after sharing change');
 check(['SAVE-003','SHARE-003'],'After access-only revision change, reloaded title mutation uses page CAS rather than immutable snapshot');
 await page.getByRole('button',{name:'Share',exact:true}).click();await page.getByRole('button',{name:'Restore inherited access',exact:true}).click();await page.getByRole('button',{name:'Restrict inherited access',exact:true}).waitFor();await page.getByRole('button',{name:'Close details ×'}).click();
 const paragraph=page.getByRole('textbox',{name:'Paragraph',exact:true}).first();
 // Real network loss, no intercepted or fabricated application response.
 await context.setOffline(true);await paragraph.fill('Unsent draft while offline');await page.getByRole('status').filter({hasText:/Offline —/}).waitFor();
 assert.equal(await paragraph.textContent(),'Unsent draft while offline');
 const draft=await page.evaluate(()=>Object.entries(sessionStorage).find(([key])=>key.startsWith('slate:draft:'))?.[1]);assert.ok(draft?.includes('Unsent draft while offline'));
 await context.setOffline(false);assert.ok(!JSON.stringify((await read()).blocks).includes('Unsent draft while offline'));
 await page.reload();await page.getByText(/An unsaved edit was recovered in this tab/).waitFor();assert.equal(await paragraph.textContent(),'Unsent draft while offline');await page.getByRole('button',{name:'Try saving again',exact:true}).click();await page.getByRole('status').filter({hasText:/^Saved /}).waitFor();assert.ok(JSON.stringify((await read()).blocks).includes('Unsent draft while offline'));
 check(['SAVE-001','SAVE-002','SAVE-004'],'Offline writes remain uncommitted in recovery storage; reload labels recovered draft unsaved; explicit retry durably saves');
 // A legitimate competing write supersedes this tab's captured block revision.
 const prior=await read(),block=prior.blocks[0];
 await paragraph.fill('My conflicting local text');
 const mutation=await context.request.patch(runtime.origin+`/api/pages/${id}/blocks/${block.id}`,{data:{operationKey:randomUUID(),expectedRevisionId:block.revisionId,content:{...block.content,text:[{text:'Another editor saved this'}]}}});assert.equal(mutation.status(),200);
 await page.getByRole('button',{name:'Compare',exact:true}).waitFor();assert.equal(await paragraph.textContent(),'My conflicting local text');
 await page.getByRole('button',{name:'Compare',exact:true}).click();await page.getByRole('dialog').getByText('Another editor saved this',{exact:true}).waitFor();await page.getByRole('button',{name:'Keep my version',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});assert.ok(JSON.stringify((await read()).blocks).includes('My conflicting local text'));
 check(['SAVE-003'],'Superseded body edit returns conflict, preserves local text, compares current saved content and explicitly overwrites with fresh CAS');
}
