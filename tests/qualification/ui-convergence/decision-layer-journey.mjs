import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {expect} from '@playwright/test';
import {root} from '../../e2e/runtime-harness.mjs';
import {inbox,newOutboxLink} from '../../e2e/outbox-auth.mjs';
import {accessible} from './browser-evidence.mjs';
import {call,ok,grant} from './two-people-support.mjs';

/** A native editor layers a decision over populated content without taking custody of the page. */
export async function decisionLayerJourney(state,people) {
  const {context,origin}=state,editor=people.bob,view=editor.page,width=view.viewportSize().width;
  const receipts=[],snapshots=[],refusals=[];
  const native=async(method,route,data,actor=context)=>{
    const result=await ok(actor,origin,method,route,data===undefined?undefined:{operationKey:randomUUID(),...data});
    if(result.receipt)receipts.push(result.receipt);
    return result;
  };
  const read=route=>native('GET',route);
  const space=(await native('POST','/api/containers',{name:'Decision layer handbook',visibility:'private'})).value;
  const create=async(title,blocks=[])=>(await native('POST','/api/pages',{containerId:space.id,title,blocks})).value.pageId;
  const target=await create('Decision supporting procedure'),blockId=randomUUID();
  const pageId=await create('Decision layer source',[
    {id:blockId,blockType:'paragraph',treePosition:'a',content:{text:[{text:'Keep the operational body and its discussion. '},{text:'Supporting procedure',link:{href:`${origin}/app/pages/${target}`}}]}},
  ]);
  const inbound=await create('Decision inbound reference',[
    {id:randomUUID(),blockType:'paragraph',treePosition:'a',content:{text:[{text:'Decision layer source',link:{href:`${origin}/app/pages/${pageId}`}}]}},
  ]);
  await native('PATCH',`/api/pages/${pageId}`,{expectedRevisionId:(await read(`/api/pages/${pageId}`)).page.revisionId,properties:{title:'Decision layer source revised'}});
  await grant(context,origin,pageId,'browser-owner','full');
  await native('PUT',`/api/sharing/pages/${pageId}/inheritance`,{expectedRevisionId:(await read(`/api/pages/${pageId}`)).page.revisionId,restricted:true});
  // Space visibility permits its decision filter; page restriction keeps access explicit.
  await native('POST','/api/sharing',{targetKind:'container',targetId:space.id,principalKind:'member',principalId:editor.id,level:'view'});
  const editorGrant=await grant(context,origin,pageId,editor.id,'edit');
  for(const id of [target,inbound])await grant(context,origin,id,editor.id,'view');
  await native('POST',`/api/comments/page/${pageId}`,{body:[{text:'Retain this page discussion independently of its decision.'}]},editor.context);
  // A real read-only member uses native invitation admission; no application data is injected.
  const mail=await inbox(origin);
  await native('POST','/api/invitations',{email:[`decision-reader-${randomUUID()}`,'test.invalid'].join('@'),kind:'member'});
  const invitation=new URL(await newOutboxLink(origin,mail));
  const reader=await context.browser().newContext({viewport:view.viewportSize()});
  try {
    assert.equal((await reader.request.post(origin+'/api/auth/invitation/accept',{headers:{origin},form:{token:invitation.searchParams.get('token')},maxRedirects:0})).status(),303);
    const readerMember=await ok(reader,origin,'GET','/api/members/current');
    await grant(context,origin,pageId,readerMember.id,'view');
    const readerView=await reader.newPage();
    const snapshot=async label=>{
      const revisions=await read(`/api/revisions/${pageId}`);
      const value={document:await read(`/api/pages/${pageId}`),comments:await read(`/api/comments/page/${pageId}`),grants:await read(`/api/sharing/pages/${pageId}`),revisions,
        exactRevisions:await Promise.all(revisions.items.map(item=>read(`/api/revisions/${pageId}/${item.id}`))),
        links:(await read(`/api/pages/${pageId}/details`)).linkedFrom,inbound:await read(`/api/pages/${inbound}`),outbound:await read(`/api/pages/${target}`)};
      snapshots.push({label,value});return value;
    };
    const before=await snapshot('before create');
    assert.equal(before.document.authorMemberId,'browser-owner');
    assert.equal((await ok(editor.context,origin,'GET',`/api/pages/${pageId}`)).permissions.level,'edit');
    assert.equal(before.comments.threads.length,1);assert.ok(before.revisions.items.length>1);
    assert.deepEqual(before.links.map(item=>item.id),[inbound]);
    assert.ok(JSON.stringify(before.document.blocks).includes(`/app/pages/${target}`));
    const unchanged=async label=>assert.deepEqual(await snapshot(label),before,`${label} preserves the complete underlying page, exact revisions, comments, grants and link endpoints.`);
    await view.goto(`${origin}/app/pages/${pageId}`,{waitUntil:'networkidle'});
    await view.getByRole('button',{name:'More',exact:true}).click();
    await view.getByRole('menuitem',{name:'Add decision record',exact:true}).click();
    const dialog=view.getByRole('dialog');
    await dialog.getByLabel('Question',{exact:true}).fill('Which recovery procedure should we adopt?');
    await dialog.getByLabel('Options considered').fill('First procedure\nSecond procedure');
    await dialog.getByLabel('Proposed outcome').fill('First procedure');
    await dialog.getByLabel('Rationale',{exact:true}).fill('Keep the documented recovery path.');
    await dialog.getByRole('combobox',{name:'Decision owner',exact:true}).selectOption(editor.id);
    await dialog.getByLabel('Decided date').fill('2026-10-18');
    await dialog.getByLabel('Next review',{exact:true}).fill('2099-01-01');
    await dialog.getByLabel('Add a page as evidence').selectOption(pageId);
    await dialog.getByRole('button',{name:'Add current revision',exact:true}).click();
    await expect(dialog.getByText('1 exact reference retained.',{exact:true})).toBeVisible();
    const capture=async(route,action)=>{
      // Buffer the genuine committed response before creation navigates away.
      // Only delivery timing changes; the native Worker supplies every byte.
      let resolve,reject;
      const pending=new Promise((yes,no)=>{resolve=yes;reject=no;});
      const matches=url=>url.pathname===route;
      const intercept=async requestRoute=>{
        if(requestRoute.request().method()!=='POST')return requestRoute.continue();
        try {
          const response=await requestRoute.fetch({maxRetries:0});
          assert.equal(response.status(),200,await response.text());
          const result=await response.json(),input=requestRoute.request().postDataJSON();
          await requestRoute.fulfill({response});resolve({result,input});
        } catch(cause) {reject(cause);await requestRoute.abort().catch(()=>{});}
      };
      await view.route(matches,intercept);
      try {await action();const captured=await pending;receipts.push(captured.result.receipt);return captured;}
      finally {await view.unroute(matches,intercept);}
    };
    const close=dialog.getByRole('button',{name:'Close dialog',exact:true});
    await view.keyboard.press('Tab');
    await close.focus();
    await expect.poll(()=>close.evaluate(element=>getComputedStyle(element,'::after').opacity)).toBe('1');
    await expect(close).toHaveAttribute('data-tooltip',/\S+\s+\S+/);
    await accessible(view,'decision creation keyboard tooltip');
    // Hold a second genuine dialog open before the first layer commits.
    const staleView=await editor.context.newPage();
    await staleView.goto(`${origin}/app/pages/${pageId}`,{waitUntil:'networkidle'});
    await staleView.getByRole('button',{name:'More',exact:true}).click();await staleView.getByRole('menuitem',{name:'Add decision record',exact:true}).click();
    const staleDialog=staleView.getByRole('dialog');
    await staleDialog.getByLabel('Question',{exact:true}).fill('An accidental second decision');await staleDialog.getByLabel('Options considered').fill('Keep one');
    const created=await capture('/api/decisions',()=>dialog.getByRole('button',{name:'Create proposed decision',exact:true}).click());
    try {
      const rejected=staleView.waitForResponse(response=>new URL(response.url()).pathname==='/api/decisions'&&response.request().method()==='POST');
      await staleDialog.getByRole('button',{name:'Create proposed decision',exact:true}).click();
      const response=await rejected;assert.equal(response.status(),409);
      const body=await response.json();assert.equal(body.code,'PAGE_DECISION_EXISTS');refusals.push({door:'stale creation dialog',status:response.status(),body});
      await expect(staleDialog.getByRole('alert')).toContainText('This page already has a decision record.');
      await accessible(staleView,'second decision creation explicitly refused');
    } finally {await staleView.close();}
    await view.waitForURL(/\/app\/decisions\//);
    const decisionId=created.result.value.id,original=await ok(editor.context,origin,'GET',`/api/decisions/${decisionId}`);
    assert.deepEqual(original.content,{...created.input});
    assert.equal(original.content.ownerId,editor.id);
    assert.deepEqual(original.content.options,['First procedure','Second procedure']);
    assert.deepEqual(original.content.citations,[{kind:'page',sourceId:pageId,revisionId:before.document.workingRevisionId}]);
    assert.equal(original.decided_at,'2026-10-18T00:00:00.000Z');assert.equal(original.review_at,'2099-01-01T00:00:00.000Z');
    await unchanged('after create');
    const replay=await call(editor.context,origin,'POST','/api/decisions',created.input);
    assert.equal(replay.status,200);assert.deepEqual(replay.body,created.result);
    const beforeDuplicate={decision:original,history:await read(`/api/decisions/${decisionId}/history`),list:await read('/api/decisions'),activity:await read('/api/activity?action=decisions.save')};
    const duplicate=await call(editor.context,origin,'POST','/api/decisions',{...created.input,operationKey:randomUUID()});
    refusals.push({door:'second active layer',...duplicate});
    assert.equal(duplicate.status,409);assert.equal(duplicate.body.code,'PAGE_DECISION_EXISTS');
    assert.match(duplicate.body.message,/already has a decision record/);
    assert.deepEqual({decision:await read(`/api/decisions/${decisionId}`),history:await read(`/api/decisions/${decisionId}/history`),list:await read('/api/decisions'),activity:await read('/api/activity?action=decisions.save')},beforeDuplicate);
    await unchanged('after duplicate refusal and replay');
    await readerView.goto(`${origin}/app/pages/${pageId}`,{waitUntil:'networkidle'});
    await readerView.reload({waitUntil:'networkidle'});
    const entry=readerView.locator('[data-page-decision]');
    await expect(entry.getByRole('link',{name:original.question,exact:true})).toHaveAttribute('href',`/app/decisions/${decisionId}`);
    await readerView.getByRole('button',{name:'More',exact:true}).click();
    await expect(readerView.getByRole('menuitem',{name:'Open decision record',exact:true})).toBeVisible();
    await expect(readerView.getByRole('menuitem',{name:'Add decision record',exact:true})).toHaveCount(0);
    await readerView.keyboard.press('Escape');
    const entryBox=await entry.boundingBox(),bodyBox=await readerView.locator(`[data-block-id="${blockId}"]`).first().boundingBox();
    assert.ok(entryBox&&bodyBox&&entryBox.y+entryBox.height<=bodyBox.y,'The current decision entry is in the page metadata above its body.');
    await accessible(readerView,'decision layer read-only page entry');
    await entry.getByRole('link').click();
    await expect(readerView.getByRole('article').getByRole('heading',{name:original.question,exact:true})).toBeVisible();
    const card=readerView.getByRole('article');
    await card.getByText('Options & supporting sources',{exact:true}).click();
    for(const option of original.content.options)await expect(card.getByRole('listitem').filter({hasText:option})).toBeVisible();
    await card.getByText('Source 1',{exact:true}).click();
    await expect(card.locator('.evidence-reference')).toContainText('Keep the operational body and its discussion.');
    await card.getByText('Reference details',{exact:true}).click();
    await expect(card.locator('.evidence-reference')).toContainText(before.document.workingRevisionId);
    await view.goto(`${origin}/app/pages/${pageId}`,{waitUntil:'networkidle'});
    await view.reload({waitUntil:'networkidle'});
    await view.getByRole('button',{name:'More',exact:true}).click();
    await expect(view.getByRole('menuitem',{name:'Add decision record',exact:true})).toHaveCount(0);
    await view.getByRole('menuitem',{name:'Open decision record',exact:true}).click();
    await view.getByText('Choose the outcome',{exact:true}).click();
    await view.getByPlaceholder('Which outcome should this decision record?').fill('Second procedure');
    await view.getByRole('textbox',{name:'Why this choice?',exact:true}).fill('Review selected the second procedure.');
    // The committed POST precedes the card's own reload. Its retained options
    // already contain the new outcome inside a closed disclosure, so getByText(...).first()
    // can select that hidden option while the old outcome is still displayed.
    const refreshed=view.waitForResponse(response=>new URL(response.url()).pathname===`/api/decisions/${decisionId}`&&response.request().method()==='GET');
    const edited=await capture('/api/decisions',()=>view.getByRole('button',{name:'Save proposed decision',exact:true}).click());
    const refreshedResponse=await refreshed;assert.equal(refreshedResponse.status(),200);
    const refreshedDecision=await refreshedResponse.json();
    assert.equal(refreshedDecision.revision_id,edited.result.value.revisionId);
    assert.equal(refreshedDecision.content.outcome,'Second procedure');
    const outcome=view.getByRole('article').locator(':scope > p').filter({hasText:/^Second procedure$/});
    await expect(outcome).toHaveCount(1);await expect(outcome).toBeVisible();
    await accessible(view,'decision layer revised outcome');
    await unchanged('after edit');
    await view.goto(`${origin}/app/decisions/${decisionId}?revision=${original.revision_id}`,{waitUntil:'networkidle'});
    await expect(view.getByRole('article').locator(':scope > p').filter({hasText:/^First procedure$/})).toBeVisible();
    await expect(view.getByRole('button',{name:'Save proposed decision',exact:true})).toHaveCount(0);
    await view.goto(`${origin}/app/decisions/${decisionId}`,{waitUntil:'networkidle'});
    await capture(`/api/decisions/${decisionId}/accept`,()=>view.getByRole('button',{name:'Accept decision',exact:true}).click());
    await expect(view.getByText('Record a review',{exact:true})).toBeVisible();
    await unchanged('after accept');
    const accepted=await read(`/api/decisions/${decisionId}`);
    assert.equal(accepted.content.outcome,'Second procedure');assert.equal(accepted.content.rationale,'Review selected the second procedure.');
    assert.deepEqual(accepted.content.citations,original.content.citations);
    await view.getByText('Record a review',{exact:true}).click();
    await view.getByLabel('What did you conclude?').fill('Completed local review');
    await view.getByLabel('Next review date').fill('2099-02-01');
    await capture(`/api/decisions/${decisionId}/review`,()=>view.getByRole('button',{name:'Record review',exact:true}).click());
    assert.equal((await read(`/api/decisions/${decisionId}`)).review_at,'2099-02-01T00:00:00.000Z');
    assert.equal((await read(`/api/decisions/${decisionId}`)).acceptedRevisionId,accepted.acceptedRevisionId);
    await unchanged('after review');
    await view.goto(`${origin}/app/decisions`,{waitUntil:'networkidle'});
    await view.locator('select[name=state]').selectOption('accepted');await view.locator('select[name=ownerId]').selectOption(editor.id);await view.locator('select[name=containerId]').selectOption(space.id);
    for(const [name,date] of [['decidedFrom','2026-10-18'],['decidedTo','2026-10-18'],['reviewFrom','2099-02-01'],['reviewTo','2099-02-01']])await view.locator(`input[name=${name}]`).fill(date);
    await view.locator('select[name=citationsCurrent]').selectOption('true');await view.getByRole('button',{name:'Filter decisions',exact:true}).click();
    const listed=view.locator('.settings-list a').filter({hasText:original.question});await expect(listed).toHaveAttribute('href',accepted.acceptedRevisionHref);await listed.click();
    await expect(view.getByRole('status').filter({hasText:'Exact retained decision revision:'})).toBeVisible();
    await view.goto(`${origin}/app/decisions/${decisionId}`,{waitUntil:'networkidle'});
    await view.getByRole('button',{name:'Remove decision layer',exact:true}).click();
    await capture(`/api/decisions/${decisionId}/remove`,()=>view.getByRole('dialog').getByRole('button',{name:'Remove decision',exact:true}).click());
    await expect(view.getByText(/Removed from the active page on/)).toBeVisible();
    await unchanged('after removal');
    const history=await read(`/api/decisions/${decisionId}/history`);
    assert.deepEqual(new Set(history.items.map(item=>item.entity_kind)),new Set(['decision','decision-acceptance','decision-review','decision-removal']));assert.equal(history.items.length,5);
    for(const route of ['/api/decisions',`/api/decisions?pageId=${pageId}`])assert.ok(!(await read(route)).items.some(item=>item.id===decisionId));
    await view.getByText('Decision history and reviews',{exact:true}).click();
    await expect(view.getByText(/Completed local review/)).toBeVisible();
    await accessible(view,'removed decision retains history');
    await readerView.goto(`${origin}/app/pages/${pageId}`,{waitUntil:'networkidle'});await readerView.reload({waitUntil:'networkidle'});
    await expect(readerView.locator('[data-page-decision]')).toHaveCount(0);
    await expect(readerView.getByRole('textbox',{name:'Page title',exact:true})).toHaveValue(before.document.page.title);
    await view.goto(`${origin}/app/decisions`,{waitUntil:'networkidle'});
    await expect(view.locator('.settings-list')).not.toContainText(original.question);
    await view.goto(`${origin}/app/pages/${pageId}`,{waitUntil:'networkidle'});
    await view.getByRole('button',{name:'More',exact:true}).click();await view.getByRole('menuitem',{name:'Add decision record',exact:true}).click();
    await dialog.getByLabel('Question',{exact:true}).fill('Which procedure should we adopt next?');await dialog.getByLabel('Options considered').fill('First\nSecond');await dialog.getByLabel('Proposed outcome').fill('First');await dialog.getByLabel('Rationale',{exact:true}).fill('A replacement layer over the same page.');
    const replacement=await capture('/api/decisions',()=>dialog.getByRole('button',{name:'Create proposed decision',exact:true}).click());
    await view.waitForURL(/\/app\/decisions\//);assert.notEqual(replacement.result.value.id,decisionId);
    await unchanged('after replacement');
    await readerView.goto(`${origin}/app/pages/${pageId}`,{waitUntil:'networkidle'});await readerView.reload({waitUntil:'networkidle'});
    await expect(readerView.locator('[data-page-decision]')).toContainText('Which procedure should we adopt next?');
    // Revocation is outside the invariant window: every decision door must now deny this member.
    await grant(context,origin,pageId,editor.id,'edit',{id:editorGrant.value.id,revoke:true});
    const protectedBefore={page:await read(`/api/pages/${pageId}`),history:await read(`/api/decisions/${decisionId}/history`),replacement:await read(`/api/decisions/${replacement.result.value.id}`)};
    for(const route of [`/api/pages/${pageId}`,`/api/decisions/${decisionId}`,`/api/decisions/${decisionId}/history`,`/api/decisions/${decisionId}/reviews`,`/api/decisions/${decisionId}?revision=${original.revision_id}`,`/api/decisions/${replacement.result.value.id}`]) {
      const refused=await call(editor.context,origin,'GET',route);refusals.push({door:route,...refused});assert.equal(refused.status,404);assert.ok(!JSON.stringify(refused.body).includes(original.question));
    }
    for(const route of ['/api/decisions',`/api/decisions?pageId=${pageId}`])assert.ok(!(await ok(editor.context,origin,'GET',route)).items.some(item=>[decisionId,replacement.result.value.id].includes(item.id)));
    const deniedReplay=await call(editor.context,origin,'POST','/api/decisions',created.input);refusals.push({door:'revoked creation replay',...deniedReplay});assert.equal(deniedReplay.status,404);
    for(const route of [`/app/pages/${pageId}`,`/app/decisions/${decisionId}`,`/app/decisions/${replacement.result.value.id}`,`/app/decisions/${decisionId}?revision=${original.revision_id}`]) {
      await view.goto(origin+route,{waitUntil:'networkidle'});await view.reload({waitUntil:'networkidle'});
      await expect(view.getByRole('main')).not.toContainText(original.question);await expect(view.getByRole('main')).not.toContainText('Keep the operational body');await expect(view.getByRole('main')).not.toContainText('Which procedure should we adopt next?');
      if(route.includes('/pages/'))await expect(view.getByRole('heading',{name:'Access needed',exact:true})).toBeVisible();
      else await expect(view.getByRole('alert')).toBeVisible();
    }
    assert.deepEqual({page:await read(`/api/pages/${pageId}`),history:await read(`/api/decisions/${decisionId}/history`),replacement:await read(`/api/decisions/${replacement.result.value.id}`)},protectedBefore);
    const evidence=path.join(root,'.artifacts/ui-convergence/decision-layer');await mkdir(evidence,{recursive:true});
    await writeFile(path.join(evidence,`${width}.json`),JSON.stringify({width,pageId,decisionId,receipts,snapshots,refusals,history,original,accepted,edited:edited.result,refreshedDecision,replacement:replacement.result},null,2));
    console.log(`DEC-001 decisionLayerJourney complete at ${width}px: populated page unchanged across create, duplicate refusal, edit, accept, review, removal and replacement; revoked member denied after reload.`);
  } catch(cause) {
    await view.screenshot({path:path.join(people.evidence,'decision-layer-failure.png'),fullPage:true});
    throw cause;
  } finally {await reader.close();}
}
