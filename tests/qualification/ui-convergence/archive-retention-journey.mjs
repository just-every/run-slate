import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {expect} from '@playwright/test';
import {retentionFixture} from '../archive-retention-fixture.ts';
import {call,ok} from './two-people-support.mjs';
import {tap,type,checkpoint} from './touch-controls.mjs';

/** Archive and deletion use the ordinary member's native controls and session. */
export async function archiveRetentionJourney(state,touch) {
  const {page,context,origin,containerId}=touch;
  const f=await retentionFixture({containerId,memberId:'browser-reader',
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
  });
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
    await tap(dialog.getByRole('button',{name:'Delete permanently',exact:true}));
    await expect(dialog).toBeHidden();
    assert.deepEqual([...attempts[0].confirmedPageIds].sort(),[...f.ids].sort());
    await expect(row).toHaveCount(0);
    assert.equal((await touch.api('/api/archive')).items.filter(item=>f.ids.includes(item.id)).length,0);
    for(const id of f.ids)assert.equal((await call(context,origin,'GET',`/api/pages/${id}`)).status,404);
  } finally {context.off('request',record);}
  await checkpoint(page,'confirmed cascade deleted');
  console.log(`PROBE ARCH-004 native browser ${page.viewportSize().width}: archive and restore retain populated data; cancelled and incomplete confirmation preserve it; exact confirmed cascade deletes`);
}
