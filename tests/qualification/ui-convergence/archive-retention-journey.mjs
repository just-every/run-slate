import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {expect} from '@playwright/test';
import {signInWithOutbox} from '../../e2e/outbox-auth.mjs';
import {retentionFixture} from '../archive-retention-fixture.ts';
import {call,ok} from './two-people-support.mjs';
import {tap,type,checkpoint} from './touch-controls.mjs';

/** Archive and deletion use the ordinary member's native controls and session. */
export async function archiveRetentionJourney(state,touch) {
  const {page,context,origin,containerId}=touch;
  const door={containerId,memberId:'browser-reader',
    request:async(method,route,body)=>{
      // Vocabulary belongs to the workspace owner; all content uses the member.
      const result=await call(route==='/api/status'?state.context:context,origin,method,route,body);
      return {status:result.status,data:result.body};
    },
    upload:async(pageId,bytes)=>{
      const response=await context.request.post(origin+'/api/media',{multipart:{operationKey:randomUUID(),pageId,file:{name:'retained.txt',mimeType:'text/plain',buffer:Buffer.from(bytes)}}});
      assert.equal(response.status(),200,await response.text());return (await response.json()).value;
    },
    readFile:async id=>{
      const response=await context.request.get(`${origin}/api/media/${id}`);
      assert.equal(response.status(),200);return new Uint8Array(await response.body());
    },
  };
  const f=await retentionFixture(door);
  await page.goto(`${origin}/app/pages/${f.root.pageId}`,{waitUntil:'networkidle'});
  await tap(page.getByRole('button',{name:'More',exact:true}));
  await tap(page.getByRole('menuitem',{name:'Archive page',exact:true}));
  const archive=page.getByRole('dialog',{name:'Archive this page?',exact:true});
  await type(page,archive.getByRole('textbox',{name:'Reason',exact:true}),'Keep the entire retained tree.');
  await tap(archive.getByRole('button',{name:'Confirm',exact:true}));
  await expect(archive).toBeHidden();
  assert.deepEqual(await f.snapshot(),f.before,'Native archive controls preserve populated content.');
  await page.goto(origin+'/app/archive',{waitUntil:'networkidle'});
  const row=page.locator('.archive-list li').filter({has:page.getByRole('heading',{name:'Retained archive tree',exact:true})});
  await expect(row).toContainText('Keep the entire retained tree.');
  await expect(row.getByRole('button',{name:'Delete permanently',exact:true})).toHaveCount(0);
  await checkpoint(page,'retained archive');
  await tap(row.getByRole('button',{name:'Restore',exact:true}));
  await expect(row).toHaveCount(0);
  assert.deepEqual(await f.snapshot(),f.before,'Native restore controls preserve populated content.');
  await page.goto(`${origin}/app/pages/${f.root.pageId}`,{waitUntil:'networkidle'});
  await expect(page.getByText('Current retained body',{exact:true})).toBeVisible();
  await checkpoint(page,'retained archive restored');
  const references=await erasureReferences(touch,f);
  const doc=await f.read(`/api/pages/${f.root.pageId}`);
  await ok(context,origin,'POST',`/api/archive/${f.root.pageId}`,{operationKey:randomUUID(),expectedRevisionId:doc.page.revisionId,action:'trash'});
  await page.goto(origin+'/app/archive',{waitUntil:'networkidle'});
  await tap(page.getByRole('button',{name:'Trash',exact:true}));
  await tap(row.getByRole('button',{name:'Delete permanently',exact:true}));
  const dialog=page.getByRole('dialog',{name:'Permanently delete Retained archive tree?',exact:true});
  for(const title of ['Retained archive tree','Retained child','Retained database','Retained record'])
    await expect(dialog.getByRole('checkbox',{name:title,exact:true})).toBeVisible();
  await checkpoint(page,'exact cascade confirmation');
  await tap(dialog.getByRole('button',{name:'Cancel',exact:true}));
  await expect(dialog).toBeHidden();
  const retained=(await touch.api('/api/archive')).items.filter(item=>f.ids.includes(item.id));
  assert.equal(retained.length,f.ids.length,'Cancelling the native dialog destroys nothing.');
  await tap(row.getByRole('button',{name:'Restore',exact:true}));
  await expect(row).toHaveCount(0);
  assert.deepEqual(await f.snapshot(),f.before,'Cancellation retains bodies, history and file bytes after restore.');
  await ok(context,origin,'POST',`/api/archive/${f.root.pageId}`,{operationKey:randomUUID(),expectedRevisionId:doc.page.revisionId,action:'trash'});
  await page.reload({waitUntil:'networkidle'});
  await tap(page.getByRole('button',{name:'Trash',exact:true}));
  await tap(row.getByRole('button',{name:'Delete permanently',exact:true}));
  await expect(dialog.getByRole('checkbox')).toHaveCount(f.ids.length);
  await type(page,dialog.getByRole('textbox',{name:'Type the page title',exact:true}),'Retained archive tree');
  await tap(dialog.getByRole('checkbox',{name:'Retained archive tree',exact:true}));
  // Browser constraint validation refuses an incomplete set without a request.
  const attempts=[];
  const record=request=>{if(request.method()==='POST'&&request.url().endsWith('/permanent-delete'))attempts.push(request.postDataJSON());};
  context.on('request',record);
  try {
    await tap(dialog.getByRole('button',{name:'Delete permanently',exact:true}));
    assert.deepEqual(attempts,[],'Incomplete cascade cannot submit.');
    await expect(dialog).toBeVisible();
    for(const title of ['Retained child','Retained database','Retained record'])await tap(dialog.getByRole('checkbox',{name:title,exact:true}));
    await checkpoint(page,'confirmed cascade ready');
    // Successful erasure needs fresh mailbox proof, independent of earlier journey duration.
    const member=await touch.api('/api/members/current');
    const signedIn=await signInWithOutbox(origin,member.email);
    assert.equal(signedIn.body.member.id,'browser-reader');
    assert.equal(signedIn.body.member.role,'member');
    await context.addCookies([{name:'slate_session',value:signedIn.cookie.split('=')[1],url:origin}]);
    const response=page.waitForResponse(response=>response.request().method()==='POST'&&response.url().endsWith('/permanent-delete'));
    await tap(dialog.getByRole('button',{name:'Delete permanently',exact:true}));
    const deleted=await response;
    assert.equal(deleted.status(),200,await deleted.text());
    console.log('ERASURE_BROWSER_RECEIPT',JSON.stringify({mode:'single',width:page.viewportSize().width,...await deleted.json()}));
    await expect(dialog).toBeHidden();
    assert.deepEqual([...attempts[0].confirmedPageIds].sort(),[...f.ids].sort());
    await expect(row).toHaveCount(0);
    assert.equal((await touch.api('/api/archive')).items.filter(item=>f.ids.includes(item.id)).length,0);
    for(const id of f.ids)assert.equal((await call(context,origin,'GET',`/api/pages/${id}`)).status,404);
  } finally {context.off('request',record);}
  await checkpoint(page,'confirmed cascade deleted');
  await erasedReferenceReadback(touch,references,f);
  await emptyTrashJourney(state,touch,door);
  console.log(`PROBE ARCH-004 native browser ${page.viewportSize().width}: archive and restore retain populated data; cancelled and incomplete confirmation preserve it; exact confirmed cascade deletes`);
}

async function erasureReferences(touch,f) {
  const revision=f.before.pages[0].history.items[0].id;
  const root=f.root.pageId;
  const created=await ok(touch.context,touch.origin,'POST','/api/pages',{operationKey:randomUUID(),containerId:touch.containerId,title:'Retained erasure references',blocks:[{
    id:randomUUID(),blockType:'paragraph',treePosition:'1',content:{text:[
      {text:'Open plain reference',link:{href:`/app/pages/${root}`}},
      {text:'Open exact citation',link:{href:`/app/pages/${root}?detail=history&revision=${revision}`}},
      {text:'Retained archive tree',mention:{kind:'page',id:root,label:'Retained archive tree'}},
    ]},
  }]});
  return {id:created.value.pageId,revision};
}

async function erasedReferenceReadback(touch,references,f) {
  const {context,origin}=touch,root=f.root.pageId;
  const document=await ok(context,origin,'GET',`/api/pages/${references.id}`);
  assert.equal(document.mentions[root].state,'deleted');
  assert.equal(document.mentions[root].label,'Deleted page');
  assert.ok(!JSON.stringify(document.blocks).includes('Retained archive tree'));
  let tombstone;
  for(const route of [`/api/pages/${root}`,`/api/revisions/${root}/${references.revision}`,`/api/pages/${root}/link-card?revision=${references.revision}`]){
    const gone=await call(context,origin,'GET',route);
    assert.equal(gone.status,404);assert.equal(gone.body.code,'PAGE_ERASED');
    assert.deepEqual(Object.keys(gone.body.details).sort(),['deletedAt','kind']);
    assert.equal(gone.body.details.kind,'page');
    assert.ok(Number.isFinite(Date.parse(gone.body.details.deletedAt)));
    tombstone=gone.body.details;
  }
  const proof=await context.browser().newContext({viewport:touch.page.viewportSize(),locale:'en-US'});
  await proof.addCookies((await context.cookies()).filter(cookie=>cookie.name==='slate_session'));
  const host=await proof.newPage();
  try {
    await host.goto(`${origin}/app/pages/${references.id}`,{waitUntil:'networkidle'});
    await host.reload({waitUntil:'networkidle'});
    await expect(host.locator('[data-mention-kind="page"]')).toContainText('Deleted page');
    await expect(host.locator('[data-mention-kind="page"] a')).toHaveCount(0);
    for(const name of ['Open plain reference','Open exact citation']){
      const href=await host.getByRole('link',{name,exact:true}).getAttribute('href');
      assert.ok(href,'A retained link has an actual destination after reload.');
      const target=await proof.newPage();
      await target.goto(new URL(href,origin).href,{waitUntil:'networkidle'});
      await target.reload({waitUntil:'networkidle'});
      const erased=target.getByRole('article',{name:'Deleted record'});
      await expect(erased).toContainText('Deleted page');
      await expect(erased.locator('time')).toHaveAttribute('datetime',tombstone.deletedAt);
      for(const text of ['Retained archive tree','Current retained body','Historical retained body','Retained discussion'])
        await expect(erased).not.toContainText(text);
      await expect(target.locator('.revision-preview')).toHaveCount(0);
      await checkpoint(target,'erased '+name.toLowerCase());
      await target.close();
    }
    const activity=await ok(context,origin,'GET','/api/activity?kind=page&limit=100');
    const erased=activity.items.filter(row=>f.ids.includes(row.target.id));
    assert.ok(erased.length>0);
    for(const row of erased){
      assert.equal(row.target.kind,'page');assert.equal(row.actor,null);
      assert.equal(row.deleted,true);assert.deepEqual(row.context,{});
      assert.ok(Number.isFinite(Date.parse(row.occurredAt)));
    }
  } finally {await proof.close();}
}

async function emptyTrashJourney(state,touch,door) {
  const {context,page,origin}=touch;
  const f=await retentionFixture(door),references=await erasureReferences(touch,f);
  const extra=await ok(context,origin,'POST','/api/pages',{operationKey:randomUUID(),containerId:touch.containerId,title:'Another trash root'});
  const privateSpace=await ok(state.context,origin,'POST','/api/containers',{operationKey:randomUUID(),name:'Protected trash boundary',visibility:'private'});
  const protectedPage=await ok(state.context,origin,'POST','/api/pages',{operationKey:randomUUID(),containerId:privateSpace.value.id,title:'Edit-only trash stays'});
  await ok(state.context,origin,'POST','/api/sharing',{operationKey:randomUUID(),targetKind:'page',targetId:protectedPage.value.pageId,principalKind:'member',principalId:'browser-reader',level:'edit'});
  for(const [owner,id] of [[context,f.root.pageId],[context,extra.value.pageId],[state.context,protectedPage.value.pageId]]){
    const doc=await ok(owner,origin,'GET',`/api/pages/${id}`);
    await ok(owner,origin,'POST',`/api/archive/${id}`,{operationKey:randomUUID(),expectedRevisionId:doc.page.revisionId,action:'trash'});
  }
  const expected=[...f.ids,extra.value.pageId].sort();
  await page.goto(origin+'/app/archive',{waitUntil:'networkidle'});
  await tap(page.getByRole('button',{name:'Trash',exact:true}));
  await tap(page.getByRole('button',{name:'Empty trash',exact:true}));
  const dialog=page.getByRole('dialog',{name:'Empty trash?',exact:true});
  await expect(dialog.getByRole('checkbox')).toHaveCount(expected.length);
  await expect(dialog.getByRole('checkbox',{name:'Edit-only trash stays',exact:true})).toHaveCount(0);
  await checkpoint(page,'empty trash named preview');
  await tap(dialog.getByRole('button',{name:'Cancel',exact:true}));
  assert.deepEqual((await ok(context,origin,'GET','/api/archive/empty-trash-preview')).items.map(row=>row.id).sort(),expected);
  await tap(page.getByRole('button',{name:'Empty trash',exact:true}));
  await type(page,dialog.getByRole('textbox',{name:'Type "Empty trash"',exact:true}),'Empty trash');
  await dialog.getByRole('checkbox').first().check();
  const attempts=[],record=request=>{if(request.method()==='POST'&&request.url().endsWith('/api/archive/empty-trash'))attempts.push(request.postDataJSON());};
  context.on('request',record);
  try {
    await tap(dialog.getByRole('button',{name:'Empty trash',exact:true}));
    assert.deepEqual(attempts,[],'Empty trash cannot submit an incomplete confirmation.');
    for(const box of await dialog.getByRole('checkbox').all())await box.check();
    await checkpoint(page,'empty trash exact confirmation');
    const member=await touch.api('/api/members/current'),signed=await signInWithOutbox(origin,member.email);
    await context.addCookies([{name:'slate_session',value:signed.cookie.split('=')[1],url:origin}]);
    const response=page.waitForResponse(response=>response.request().method()==='POST'&&response.url().endsWith('/api/archive/empty-trash'));
    await tap(dialog.getByRole('button',{name:'Empty trash',exact:true}));
    const deleted=await response;assert.equal(deleted.status(),200,await deleted.text());
    const result=await deleted.json();
    assert.deepEqual(result.value.deletedPageIds,expected);
    console.log('ERASURE_BROWSER_RECEIPT',JSON.stringify({mode:'empty',width:page.viewportSize().width,...result}));
    await expect(dialog).toBeHidden();
    assert.deepEqual([...attempts[0].confirmedPageIds].sort(),expected);
    await page.reload({waitUntil:'networkidle'});
    await tap(page.getByRole('button',{name:'Trash',exact:true}));
    await expect(page.getByRole('heading',{name:'Edit-only trash stays',exact:true})).toBeVisible();
    await expect(page.getByRole('button',{name:'Empty trash',exact:true})).toHaveCount(0);
    assert.equal((await ok(context,origin,'GET',`/api/pages/${references.id}`)).page.id,references.id);
    await checkpoint(page,'empty trash leaves edit-only content');
  } finally {context.off('request',record);}
  await erasedReferenceReadback(touch,references,f);
  console.log(`PROBE ARCH-006 native browser ${page.viewportSize().width}: named single and Empty trash confirmations erase exact sets, retained plain links and exact citations reload as kind and time tombstones, mentions and activity are content-free`);
}
