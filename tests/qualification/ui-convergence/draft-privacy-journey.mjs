import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import {expect} from '@playwright/test';
import {inbox,newOutboxLink} from '../../e2e/outbox-auth.mjs';
import {createPage} from '../interface/create-page.mjs';
import {call,ok,withSecondPerson} from './two-people-support.mjs';

/** Saved draft, named sharing and retained privacy through the native settings and page doors. */
export async function draftPrivacyJourney(state) {
  const {page,context,origin}=state,width=page.viewportSize().width,returnUrl=page.url();
  const directory=`.artifacts/ui-convergence/draft-privacy/${width}`;
  await mkdir(directory,{recursive:true});
  const openSharing=async(view=page)=>{
    const heading=view.getByRole('heading',{name:'Share this page',exact:true});
    if(!await heading.isVisible())await view.getByRole('button',{name:'Share',exact:true}).click();
    await expect(heading).toBeVisible();
  };
  const anonymous=await context.browser().newContext({viewport:page.viewportSize()});
  const original=await ok(context,origin,'GET','/api/workspace');
  const profile=async(lifecycle,access)=>{
    await page.goto(origin+'/app/settings',{waitUntil:'networkidle'});
    await page.getByRole('button',{name:'Edit workspace & policies'}).click();
    await page.locator('select[name="page.lifecycle.v1"]').selectOption(lifecycle);
    await page.locator('select[name="page.access.v1"]').selectOption(access);
    await page.getByRole('button',{name:'Save settings',exact:true}).click();
    await page.getByRole('dialog').waitFor({state:'hidden'});
    const stored=await ok(context,origin,'GET','/api/workspace');
    assert.equal(stored.policies['page.lifecycle.v1'],lifecycle);assert.equal(stored.policies['page.access.v1'],access);
  };
  try {
    await profile('draft-then-publish','workspace-general');
    const containerId=(await ok(context,origin,'GET','/api/containers')).items.find(item=>item.name==='Handbook').id;
    const id=await createPage(page,origin,containerId,'DraftCustody private response');
    const text='Only the named draft reviewers can read this response.';
    await page.getByRole('textbox',{name:'Page body',exact:true}).fill(text);
    await page.locator('.editor-save-status').filter({hasText:/^Saved$/}).waitFor();
    const read=()=>ok(context,origin,'GET',`/api/pages/${id}`);
    const grants=()=>ok(context,origin,'GET',`/api/sharing/pages/${id}`);
    const exposure=()=>ok(context,origin,'GET',`/api/publishing/${id}`);
    const inventory=async()=>{const doc=await read();return {page:doc.page,blocks:doc.blocks,workingRevisionId:doc.workingRevisionId,publishedRevisionId:doc.publishedRevisionId,grants:await grants(),exposure:await exposure()};};
    const refused=async(actor,method,route,input,status)=>{
      const before=await inventory(),response=await call(actor,origin,method,route,input);
      assert.equal(response.status,status,JSON.stringify(response.body));
      assert.ok(!JSON.stringify(response.body).includes(text));
      assert.deepEqual(await inventory(),before,'Refused reads and writes preserve the draft, revisions, grants and exposure.');
    };
    const control=(await ok(context,origin,'POST','/api/pages',{operationKey:randomUUID(),containerId,title:'DraftCustody published response',blocks:[{id:randomUUID(),blockType:'paragraph',treePosition:'a',content:{text:[{text:'A published response stays in search.'}]}}]})).value.pageId;
    await ok(context,origin,'POST',`/api/pages/${control}/publish`,{operationKey:randomUUID(),expectedRevisionId:(await ok(context,origin,'GET',`/api/pages/${control}`)).page.revisionId});
    await ok(context,origin,'POST','/api/sharing',{operationKey:randomUUID(),targetKind:'page',targetId:control,principalKind:'workspace',principalId:original.id,level:'view'});
    const content=await read();assert.equal(content.page.lifecycle,'draft');assert.equal(content.publishedRevisionId,null);
    assert.deepEqual((await grants()).items,[]);
    await withSecondPerson(state,width,async people=>{
      assert.equal((await call(people.bob.context,origin,'GET',`/api/pages/${id}`)).status,404);
      await openSharing();
      const panel=page.locator('.right');
      await panel.getByRole('button',{name:'Copy page link',exact:true}).click();
      const address=await page.evaluate(()=>navigator.clipboard.readText());
      assert.equal(address,`${origin}/app/pages/${id}`);
      assert.equal((await call(people.bob.context,origin,'GET',new URL(address).pathname.replace('/app/','/api/'))).status,404);
      await refused(anonymous,'GET',`/api/pages/${id}`,undefined,401);
      await refused(anonymous,'PATCH',`/api/pages/${id}`,{operationKey:randomUUID(),expectedRevisionId:content.page.revisionId,properties:{title:'Sessionless replacement'}},401);
      const anonymousPage=await anonymous.newPage();
      await anonymousPage.goto(address,{waitUntil:'networkidle'});
      await expect(anonymousPage.locator('body')).not.toContainText(text);
      await anonymousPage.close();
      await panel.getByText('Invite by email',{exact:true}).click();
      await panel.getByRole('textbox',{name:'Email address',exact:true}).fill(['reader','test.invalid'].join('@'));
      await panel.getByRole('button',{name:'Send invitation',exact:true}).click();
      await expect.poll(async()=>(await grants()).items.map(g=>[g.principalKind,g.principalId,g.level,g.status])).toEqual([['member','browser-reader','view','active']]);
      await page.reload({waitUntil:'networkidle'});
      await openSharing();
      await expect(page.getByRole('combobox',{name:'Access for Morgan Reader',exact:true})).toHaveValue('view');
      await people.bob.page.goto(address,{waitUntil:'networkidle'});
      await expect(people.bob.page.locator('.page-document')).toContainText(text);
      assert.equal((await ok(people.bob.context,origin,'GET',`/api/pages/${id}`)).page.id,id);
      // Both people can read this draft directly, but discovery shows the live control only.
      for(const view of [page,people.bob.page]) {
        await view.goto(`${origin}/app/search?q=DraftCustody`,{waitUntil:'networkidle'});
        await expect(view.locator('.search-results > li')).toHaveCount(1);
        await expect(view.locator('.search-results h2')).toHaveText('DraftCustody published response');
        await expect(view.locator('.search-results')).not.toContainText(text);
        await view.reload({waitUntil:'networkidle'});
        await expect(view.locator('.search-results > li')).toHaveCount(1);
      }
      await page.screenshot({path:`${directory}/private-draft-search.png`,fullPage:true});
      // The named reader can open the draft body, while its inbox stays private.
      const readerInbox=await ok(people.bob.context,origin,'GET','/api/notifications');
      assert.ok(readerInbox.items.some(item=>item.pageId===control));
      assert.deepEqual(readerInbox.items.filter(item=>item.pageId===id),[]);
      await people.bob.page.goto(`${origin}/app/inbox`,{waitUntil:'networkidle'});
      await expect(people.bob.page.locator('.main')).toContainText('DraftCustody published response');
      await expect(people.bob.page.locator('.main')).not.toContainText('DraftCustody private response');
      await people.bob.page.reload({waitUntil:'networkidle'});
      await expect(people.bob.page.locator('.main')).toContainText('DraftCustody published response');
      await expect(people.bob.page.locator('.main')).not.toContainText('DraftCustody private response');
      await people.bob.page.screenshot({path:`${directory}/private-draft-inbox.png`,fullPage:true});
      await page.goto(address,{waitUntil:'networkidle'});await openSharing();
      await people.bob.page.goto(address,{waitUntil:'networkidle'});
      await expect(people.bob.page.locator('.page-document')).toContainText(text);
      const retained={page:content.page,blocks:content.blocks,grants:(await grants()).items};
      await page.screenshot({path:`${directory}/saved-grant.png`,fullPage:true});
      await people.bob.page.screenshot({path:`${directory}/granted-reader.png`,fullPage:true});
      for(const [lifecycle,access] of [['always-live','container-general'],['draft-then-publish','container-general'],['always-live','workspace-general'],['draft-then-publish','workspace-general']]) {
        await profile(lifecycle,access);
        const doc=await read();assert.deepEqual(doc.page,retained.page);assert.deepEqual(doc.blocks,retained.blocks);assert.deepEqual((await grants()).items,retained.grants);
        await page.goto(address,{waitUntil:'networkidle'});await page.reload({waitUntil:'networkidle'});
        await expect(page.locator('.page-document')).toContainText(text);
        await people.bob.page.reload({waitUntil:'networkidle'});await expect(people.bob.page.locator('.page-document')).toContainText(text);
        await openSharing();
        await expect(page.locator('.right').getByRole('button',{name:'Allow general read access',exact:true})).toHaveCount(0);
        await expect(page.locator('.right')).toContainText('Private drafts have no general access.');
        const principalKind=access==='workspace-general'?'workspace':'container',principalId=principalKind==='workspace'?original.id:containerId;
        await refused(context,'POST','/api/sharing',{operationKey:randomUUID(),targetKind:'page',targetId:id,principalKind,principalId,level:'view'},403);
        await refused(context,'POST',`/api/publishing/${id}`,{operationKey:randomUUID(),expectedRevisionId:content.page.revisionId,host:new URL(origin).host,slug:`private-draft-${width}`},403);
        await refused(anonymous,'GET',`/p/private-draft-${width}`,undefined,404);
        await refused(anonymous,'GET',`/api/pages/${id}`,undefined,401);
      }
      await openSharing();
      const row=page.locator('.right .grant-list > li').filter({has:page.getByRole('combobox',{name:'Access for Morgan Reader',exact:true})});
      await row.locator('details > summary').click();await row.getByRole('button',{name:'Remove access',exact:true}).click();
      await expect.poll(async()=>(await grants()).items[0].status).toBe('revoked');
      assert.equal((await call(people.bob.context,origin,'GET',`/api/pages/${id}`)).status,404);
      await people.bob.page.reload({waitUntil:'networkidle'});await expect(people.bob.page.locator('.page-document')).not.toContainText(text);
      assert.deepEqual((await grants()).effectiveItems,[]);
      await page.screenshot({path:`${directory}/revoked-grant.png`,fullPage:true});
      await people.bob.page.screenshot({path:`${directory}/refused-reader.png`,fullPage:true});
      // Sharing with a real group is a separate native grant, not a copied address.
      const group=(await ok(context,origin,'POST','/api/groups',{operationKey:randomUUID(),name:`Draft reviewers ${width}`,memberIds:['browser-reader']})).value.id;
      await page.reload({waitUntil:'networkidle'});await openSharing();
      await page.locator('.right select[name="principal"]').selectOption(`group:${group}`);
      await page.locator('.right').getByRole('button',{name:'Share page',exact:true}).click();
      await expect.poll(async()=>(await grants()).items.filter(g=>g.status==='active').map(g=>[g.principalKind,g.principalId,g.level])).toEqual([['group',group,'view']]);
      await page.reload({waitUntil:'networkidle'});await openSharing();
      await expect(page.getByRole('combobox',{name:`Access for Draft reviewers ${width}`,exact:true})).toHaveValue('view');
      await people.bob.page.goto(address,{waitUntil:'networkidle'});
      await expect(people.bob.page.locator('.page-document')).toContainText(text);
      await refused(people.bob.context,'PATCH',`/api/pages/${id}`,{operationKey:randomUUID(),expectedRevisionId:content.page.revisionId,properties:{title:'View-only replacement'}},404);
      await page.screenshot({path:`${directory}/saved-group-grant.png`,fullPage:true});
      const groupRow=page.locator('.right .grant-list > li').filter({has:page.getByRole('combobox',{name:`Access for Draft reviewers ${width}`,exact:true})});
      await groupRow.locator('details > summary').click();await groupRow.getByRole('button',{name:'Remove access',exact:true}).click();
      await expect.poll(async()=>(await grants()).items.every(g=>g.status==='revoked')).toBe(true);
      await refused(people.bob.context,'GET',`/api/pages/${id}`,undefined,404);
      await people.bob.page.reload({waitUntil:'networkidle'});
      await expect(people.bob.page.locator('.page-document')).not.toContainText(text);
      assert.deepEqual((await grants()).effectiveItems,[]);

      // A workspace owner's settings authority never grants another author's body.
      const authoringGrant=(await ok(context,origin,'POST','/api/sharing',{operationKey:randomUUID(),targetKind:'container',targetId:containerId,principalKind:'member',principalId:'browser-reader',level:'full'})).value.id;
      const memberDraft=await createPage(people.bob.page,origin,containerId,`Member-authored response ${width}`);
      const memberText='A member owns this private draft body.';
      await people.bob.page.getByRole('textbox',{name:'Page body',exact:true}).fill(memberText);
      await people.bob.page.locator('.editor-save-status').filter({hasText:/^Saved$/}).waitFor();
      const memberRead=()=>ok(people.bob.context,origin,'GET',`/api/pages/${memberDraft}`);
      const memberSnapshot=async()=>{const doc=await memberRead();return {page:doc.page,blocks:doc.blocks,grants:await ok(people.bob.context,origin,'GET',`/api/sharing/pages/${memberDraft}`),exposure:await ok(people.bob.context,origin,'GET',`/api/publishing/${memberDraft}`)};};
      const memberBefore=await memberSnapshot();
      assert.equal(memberBefore.page.lifecycle,'draft');assert.deepEqual(memberBefore.grants.items,[]);
      for(const method of ['GET','PATCH']) {
        const response=await call(context,origin,method,`/api/pages/${memberDraft}`,method==='PATCH'?{operationKey:randomUUID(),expectedRevisionId:memberBefore.page.revisionId,properties:{title:'Owner replacement'}}:undefined);
        assert.equal(response.status,404);assert.ok(!JSON.stringify(response.body).includes(memberText));
        assert.deepEqual(await memberSnapshot(),memberBefore);
      }
      await page.goto(`${origin}/app/pages/${memberDraft}`,{waitUntil:'networkidle'});
      await expect(page.locator('body')).not.toContainText(memberText);
      await people.bob.page.reload({waitUntil:'networkidle'});
      await expect(people.bob.page.locator('.page-document')).toContainText(memberText);
      await people.bob.page.screenshot({path:`${directory}/member-author.png`,fullPage:true});
      await page.screenshot({path:`${directory}/refused-owner.png`,fullPage:true});
      // An ordinary author selects a group through the same safe principal directory.
      const reviewers=(await ok(context,origin,'POST','/api/groups',{operationKey:randomUUID(),name:`Member draft reviewers ${width}`,memberIds:['browser-owner']})).value.id;
      await openSharing(people.bob.page);
      const authorPanel=people.bob.page.locator('.right');
      await authorPanel.locator('select[name="principal"]').selectOption(`group:${reviewers}`);
      await authorPanel.getByRole('button',{name:'Share page',exact:true}).click();
      await expect.poll(async()=>(await ok(people.bob.context,origin,'GET',`/api/sharing/pages/${memberDraft}`)).items.map(g=>[g.principalKind,g.principalId,g.status])).toEqual([['group',reviewers,'active']]);
      assert.equal((await call(people.bob.context,origin,'GET','/api/groups')).status,403);
      await people.bob.page.reload({waitUntil:'networkidle'});
      await openSharing(people.bob.page);
      await expect(people.bob.page.getByRole('combobox',{name:`Access for Member draft reviewers ${width}`,exact:true})).toHaveValue('view');
      await page.goto(`${origin}/app/pages/${memberDraft}`,{waitUntil:'networkidle'});
      await expect(page.locator('.page-document')).toContainText(memberText);
      await people.bob.page.screenshot({path:`${directory}/member-author-group.png`,fullPage:true});
      const memberGroupRow=authorPanel.locator('.grant-list > li').filter({has:people.bob.page.getByRole('combobox',{name:`Access for Member draft reviewers ${width}`,exact:true})});
      await memberGroupRow.locator('details > summary').click();await memberGroupRow.getByRole('button',{name:'Remove access',exact:true}).click();
      await expect.poll(async()=>(await ok(people.bob.context,origin,'GET',`/api/sharing/pages/${memberDraft}`)).effectiveItems).toEqual([]);
      assert.equal((await call(context,origin,'GET',`/api/pages/${memberDraft}`)).status,404);
      await page.reload({waitUntil:'networkidle'});await expect(page.locator('body')).not.toContainText(memberText);

      // The real delivered link admits a new guest, never an anonymous body reader.
      const guest=await context.browser().newContext({viewport:page.viewportSize()});
      try {
        await page.goto(address,{waitUntil:'networkidle'});await openSharing();
        const beforeMail=await inbox(origin);
        await panel.getByText('Invite by email',{exact:true}).click();
        const email=[`synthetic-slate-guest-${width}`,'test.invalid'].join('@');
        await panel.getByRole('textbox',{name:'Email address',exact:true}).fill(email);
        await panel.getByRole('button',{name:'Send invitation',exact:true}).click();
        await expect.poll(async()=>(await grants()).items.find(g=>g.invitationEmail===email)?.status).toBe('pending');
        await page.reload({waitUntil:'networkidle'});await openSharing();
        await expect(panel.locator('.grant-list')).toContainText(email);
        const invitation=(await grants()).items.find(g=>g.invitationEmail===email);
        assert.equal(invitation.effective,false);
        const delivered=await newOutboxLink(origin,beforeMail),visitor=await guest.newPage();
        await visitor.goto(delivered,{waitUntil:'networkidle'});
        await expect(visitor.getByRole('button',{name:'Accept invitation',exact:true})).toBeVisible();
        await expect(visitor.locator('body')).not.toContainText(text);
        await refused(guest,'GET',`/api/pages/${id}`,undefined,401);
        await visitor.getByRole('button',{name:'Accept invitation',exact:true}).click();
        await visitor.waitForURL(url=>url.pathname==='/app');
        await visitor.goto(address,{waitUntil:'networkidle'});await visitor.reload({waitUntil:'networkidle'});
        await expect(visitor.locator('.page-document')).toContainText(text);
        const accepted=(await grants()).items.find(g=>g.id===invitation.id);
        assert.equal(accepted.status,'active');assert.equal(accepted.effective,true);
        const session=await ok(guest,origin,'GET','/api/session');assert.equal(accepted.principalId,session.member.id);
        await page.reload({waitUntil:'networkidle'});await openSharing();
        await page.screenshot({path:`${directory}/accepted-guest-grant.png`,fullPage:true});
        await visitor.screenshot({path:`${directory}/session-bound-guest.png`,fullPage:true});
        const guestRow=panel.locator(`.grant-list > li[data-grant-id="${invitation.id}"]`);
        await guestRow.locator('details > summary').click();await guestRow.getByRole('button',{name:'Remove access',exact:true}).click();
        await expect.poll(async()=>(await grants()).items.find(g=>g.id===invitation.id)?.status).toBe('revoked');
        await refused(guest,'GET',`/api/pages/${id}`,undefined,404);
        await visitor.reload({waitUntil:'networkidle'});await expect(visitor.locator('body')).not.toContainText(text);
      } finally {await guest.close();}
      await ok(context,origin,'POST','/api/sharing',{operationKey:randomUUID(),targetKind:'container',targetId:containerId,id:authoringGrant,principalKind:'member',principalId:'browser-reader',level:'full',revoke:true});
    });
    console.log(`PROBE LIFE-002 browser ${width}: native draft creation and saved body -> link alone refused; address grant persisted; named reader read; profile switches retained draft; revoked session refused after reload`);
  } finally {
    try {await profile(original.policies['page.lifecycle.v1'],original.policies['page.access.v1']);} finally {await anonymous.close();}
  }
  await page.goto(returnUrl,{waitUntil:'networkidle'});
}
