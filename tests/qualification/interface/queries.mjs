import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {actorFixture} from './actors.mjs';
export async function queryReaderChecks({page,context,runtime,browser,target,containerId,check}){
 const reader=await actorFixture({runtime,browser,id:'qualification-query-reader'});
 const read=async(path,ctx=context)=>(await ctx.request.get(runtime.origin+path)).json();
 const post=async(path,data,method='post')=>{const response=await context.request[method](runtime.origin+path,{data:{operationKey:randomUUID(),...data}});assert.equal(response.status(),200,await response.text());return response.json();};
 const grant=async(targetId)=>post('/api/sharing',{targetKind:'page',targetId,principalKind:'member',principalId:reader.id,level:'view'});
 try{
  const source=(await post('/api/pages',{containerId,title:'Query readable ancestor'})).value.pageId;
  const child=(await post('/api/pages',{containerId,parentPageId:source,title:'Query readable child'})).value.pageId;
  const privateChild=(await post('/api/pages',{containerId,parentPageId:source,title:'Query restricted child'})).value.pageId;
  const owner=await read('/api/members/current');await post('/api/sharing',{targetKind:'page',targetId:privateChild,principalKind:'member',principalId:owner.id,level:'full'});let doc=await read('/api/pages/'+privateChild);await post('/api/sharing/pages/'+privateChild+'/inheritance',{expectedRevisionId:doc.page.revisionId,restricted:true},'put');
  await grant(target);await grant(source);await grant(child);
  await page.goto(runtime.origin+'/app/pages/'+target);await page.getByRole('button',{name:'Edit the query',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.getByLabel('Space',{exact:true}).selectOption('');await dialog.getByLabel('Under page',{exact:true}).selectOption(source);await dialog.getByLabel('Maximum results').fill('100');await dialog.getByRole('button',{name:'Save query',exact:true}).click();await dialog.waitFor({state:'hidden'});
  const ownerQuery=page.getByRole('region',{name:'Content query',exact:true});await ownerQuery.getByText(/Ran .* · 2 items/).waitFor();await ownerQuery.getByRole('button',{name:'Query restricted child',exact:true}).waitFor();
  await reader.page.goto(runtime.origin+'/app/pages/'+target);const query=reader.page.getByRole('region',{name:'Content query',exact:true});await query.getByText(/Ran .* · 1 item$/).waitFor();assert.equal(await query.getByRole('button',{name:'Query restricted child',exact:true}).count(),0);assert.equal(await query.getByRole('button',{name:'Edit the query',exact:true}).count(),0);await query.getByRole('button',{name:'Query readable child',exact:true}).click();await reader.page.waitForURL(runtime.origin+'/app/pages/'+child);
  const entry=(await read('/api/sharing/pages/'+source)).items.find(item=>item.principalId===reader.id);assert.ok(entry);await post('/api/sharing',{id:entry.id,targetKind:'page',targetId:source,principalKind:entry.principalKind,principalId:entry.principalId,level:entry.level,revoke:true});
  await reader.page.goto(runtime.origin+'/app/pages/'+target);await query.getByText('The query source is unavailable.',{exact:true}).waitFor();assert.equal(await query.locator('tbody tr').count(),0);await query.getByRole('button',{name:'Run it again',exact:true}).click();await query.getByText('The query source is unavailable.',{exact:true}).waitFor();
  check(['BLOCK-010'],'Two actual readers run the same saved ancestor query: owner sees two children, page-only reader sees only the authorized child and opens it; revoking the source replaces prior results with an explicit unavailable-source message, including rerun.');
 }finally{await reader.context.close();}
}
