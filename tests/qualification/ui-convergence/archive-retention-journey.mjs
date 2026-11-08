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
  // Refresh mailbox proof through native sign-in before the long caller reaches confirmed erasure.
  const identity=await ok(context,origin,'GET','/api/session');
  const signedIn=await signInWithOutbox(origin,identity.member.email);
  await context.addCookies([{name:'slate_session',value:signedIn.cookie.split('=')[1],url:origin}]);
  // The existing caller has already exercised many native doors. Pace this batch into a fresh admission window.
  const freshAdmissionWindow=()=>page.waitForTimeout(60000-Date.now()%60000);
  await freshAdmissionWindow();
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
  // Read the retained report in native reading mode; editable text puts taps at the caret.
  await f.write(`/api/pages/${f.report.pageId}/lock`,{expectedRevisionId:(await f.read(`/api/pages/${f.report.pageId}`)).page.revisionId});
  const references=async(archived)=>{
    await page.goto(`${origin}/app/pages/${f.report.pageId}`,{waitUntil:'networkidle'});
    const query=page.getByRole('region',{name:'Content query',exact:true});
    const expected=f.queryBaseline.filter(ref=>!archived.includes(ref.id)).map(ref=>ref.title).sort();
    await expect.poll(async()=>(await query.locator('tbody tr button').allTextContents()).sort()).toEqual(expected);
    for(const ref of f.references) {
      const source=page.locator('[data-page-editor]');
      await expect(source.getByRole('link',{name:'Open '+ref.title,exact:true})).toHaveAttribute('href',ref.href);
      await expect(source.locator('[data-mention-kind=page]').getByRole('link',{name:ref.title,exact:true})).toHaveAttribute('href',ref.href);
      await expect(source.getByRole('link',{name:'Cite '+ref.title,exact:true})).toHaveAttribute('href',ref.citation.href);
    }
    for(const ref of f.references.filter(ref=>archived.includes(ref.id))) {
      for(const [kind,name]of [['link','Open '+ref.title],['mention',ref.title],['citation','Cite '+ref.title]]) {
        if(new URL(page.url()).pathname!==`/app/pages/${f.report.pageId}`)
          await page.goto(`${origin}/app/pages/${f.report.pageId}`,{waitUntil:'networkidle'});
        const source=page.locator('[data-page-editor]');
        const link=kind==='mention'?source.locator('[data-mention-kind=page]').getByRole('link',{name,exact:true}):source.getByRole('link',{name,exact:true});
        await expect(link).toHaveAttribute('href',kind==='citation'?ref.citation.href:ref.href);
        const view=kind==='mention'?page:(await Promise.all([context.waitForEvent('page'),tap(link)]))[0];
        if(kind==='mention')await tap(link);
        try {
          await view.waitForLoadState('networkidle');
          await expect(view.getByRole('textbox',{name:'Page title',exact:true})).toHaveValue(ref.title);
          if(archived.includes(ref.id)) {
            await expect(view.getByRole('textbox',{name:'Page title',exact:true})).toHaveAttribute('readonly','');
            await expect(view.locator('[data-page-editor] [contenteditable=true]')).toHaveCount(0);
            if(ref.id===f.record.pageId) {
              await expect(view.locator('.record-fields-list')).toContainText('Structured retained value');
              await expect(view.locator('.record-fields-list').getByRole('button',{name:'Edit',exact:true})).toHaveCount(0);
            }
            await expect(view.getByText('This page is read-only with your current access.',{exact:true})).toBeVisible();
          }
          if(kind==='citation') {
            await expect(view).toHaveURL(url=>url.searchParams.get('revision')===ref.exact.id);
            await expect(view.locator('.revision-preview h3')).toHaveText(ref.exact.properties.title);
            const text=ref.exact.blocks.flatMap(block=>block.content.text??[]).map(token=>token.text).join('');
            if(text)await expect(view.locator('.revision-preview')).toContainText(text);
            if(archived.includes(ref.id))await checkpoint(view,'archived read-only citation '+ref.title);
          }
        } finally {if(view!==page)await view.close();}
      }
    }
    await checkpoint(page,'archived exact citation and read-only content');
    await page.goto(`${origin}/app/containers/${containerId}`,{waitUntil:'networkidle'});
    await tap(page.getByRole('navigation',{name:'Space navigation',exact:true}).getByRole('button',{name:'Content',exact:true}));
    await expect(page.locator('.main .page-tree').first()).toBeVisible();
    if(!archived.length)await expect(page.locator('.main .page-tree').getByRole('link',{name:f.references[0].title,exact:true})).toBeVisible();
    for(const ref of f.references.filter(ref=>archived.includes(ref.id)))await expect(page.locator('.main .page-tree').getByRole('link',{name:ref.title,exact:true})).toHaveCount(0);
    await page.goto(`${origin}/app/pages/${f.report.pageId}`,{waitUntil:'networkidle'});
    await expect.poll(async()=>(await query.locator('tbody tr button').allTextContents()).sort()).toEqual(expected);
    await checkpoint(page,'archive query excludes retained targets');
  };
  // Native report and references exist and resolve before the archive mutation.
  await references([]);
  await page.goto(`${origin}/app/pages/${f.root.pageId}`,{waitUntil:'networkidle'});
  await tap(page.getByRole('button',{name:'More',exact:true}));
  await tap(page.getByRole('menuitem',{name:'Archive page',exact:true}));
  const archive=page.getByRole('dialog',{name:'Archive this page?',exact:true});
  await type(page,archive.getByRole('textbox',{name:'Reason',exact:true}),'Keep the entire retained tree.');
  await tap(archive.getByRole('button',{name:'Confirm',exact:true}));
  await expect(archive).toBeHidden();
  await f.assertSurfaces(f.ids);
  await f.refuseWrites(f.ids);
  assert.deepEqual(await f.snapshot(),f.before,'Native archive controls and refused writes preserve populated content.');
  await freshAdmissionWindow();
  await references(f.ids);
  for(const kind of ['page','record']) {
    await page.goto(`${origin}/app/search?q=Retained&containerId=${containerId}&kind=${kind}`,{waitUntil:'networkidle'});
    const liveTitles=kind==='page'?['Archive reference report']:[];
    await expect.poll(async()=>(await page.locator('.search-results h2').allTextContents()).sort()).toEqual(liveTitles);
    await tap(page.getByRole('button',{name:'Filter results',exact:true}));
    await page.getByRole('checkbox',{name:'Include archive',exact:true}).check();
    const titles=[...liveTitles,...f.references.filter(ref=>kind==='record'?ref.id===f.record.pageId:ref.id!==f.record.pageId).map(ref=>ref.title)].sort();
    await expect.poll(async()=>(await page.locator('.search-results h2').allTextContents()).sort()).toEqual(titles);
    await page.reload({waitUntil:'networkidle'});
    await expect.poll(async()=>(await page.locator('.search-results h2').allTextContents()).sort()).toEqual(titles);
    await checkpoint(page,'archive filter finds retained '+kind);
  }
  // Complete history, comments and grants survive fresh browser documents too.
  assert.deepEqual(await f.snapshot(),f.before,'Reload and reference navigation retain exact content snapshots.');
  console.log(`PROBE ARCH-002 browser ${page.viewportSize().width}: retained links, mentions and exact citations open read-only pages, subtree and record; tree, default search and query omit them; archived filter finds them after reload; full history, discussion and grants unchanged`);
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
  await freshAdmissionWindow();
  const recordDoc=await f.read(`/api/pages/${f.record.pageId}`);
  await ok(context,origin,'POST',`/api/archive/${f.record.pageId}`,{operationKey:randomUUID(),expectedRevisionId:recordDoc.page.revisionId,action:'archive'});
  await f.assertSurfaces([f.record.pageId]);
  await f.refuseWrites([f.record.pageId]);
  assert.deepEqual(await f.snapshot(),f.before,'Archiving only a database record keeps the parent and siblings live and all retained data unchanged.');
  await references([f.record.pageId]);
  await ok(context,origin,'POST',`/api/archive/${f.record.pageId}`,{operationKey:randomUUID(),expectedRevisionId:recordDoc.page.revisionId,action:'restore'});
  await f.assertSurfaces();
  assert.deepEqual(await f.snapshot(),f.before);
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
