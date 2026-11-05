import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {expect} from '@playwright/test';
import {inbox,newOutboxLink} from '../../e2e/outbox-auth.mjs';
import {accessible} from './browser-evidence.mjs';
import {call,ok,caretAtEnd,elapsedUntil} from './two-people-support.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {root} from '../../e2e/runtime-harness.mjs';

/** Named page and space grants admit a guest without workspace membership. */
export async function guestScopeJourney(state,width) {
  const {page,context,origin,api}=state,key=()=>randomUUID();
  const space=(await ok(context,origin,'POST','/api/containers',{operationKey:key(),name:'Partner response guides',visibility:'private'})).value.id;
  const create=async title=>(await ok(context,origin,'POST','/api/pages',{operationKey:key(),containerId:space,title})).value.pageId;
  const shared=await create('Partner scope response guide'),secret=await create('Partner scope private plan');
  const members=await api('/api/members'),before=await inbox(origin);
  await ok(context,origin,'POST','/api/invitations',{operationKey:key(),email:[`avery-scope-${width}`,'test.invalid'].join('@'),kind:'guest',pageId:shared,level:'view'});
  const link=new URL(await newOutboxLink(origin,before));
  const guest=await context.browser().newContext({viewport:page.viewportSize()});
  try {
    assert.equal((await guest.request.post(origin+'/api/auth/invitation/accept',{headers:{origin},form:{token:link.searchParams.get('token')},maxRedirects:0})).status(),303);
    const who=await ok(guest,origin,'GET','/api/members/current');
    assert.equal(who.memberKind,'guest');
    assert.deepEqual(await api('/api/members'),members,'An admitted guest changes neither the member list nor its count.');
    for(const route of ['/api/containers','/api/members'])assert.equal((await call(guest,origin,'GET',route)).status,403);
    assert.equal((await ok(guest,origin,'GET',`/api/pages/${shared}`)).page.title,'Partner scope response guide');
    assert.equal((await call(guest,origin,'GET',`/api/pages/${secret}`)).status,404);
    const results=await ok(guest,origin,'GET','/api/search?q=Partner%20scope');
    assert.ok(results.items.some(item=>item.id===shared));
    assert.ok(!results.items.some(item=>item.id===secret));
    assert.deepEqual(results.items.map(item=>item.id),[shared],'Search exposes the named page only, with a real ungranted page present.');
    const view=await guest.newPage();
    await view.goto(`${origin}/app/pages/${shared}`,{waitUntil:'networkidle'});
    await expect(view.getByRole('textbox',{name:'Page title',exact:true})).toHaveValue('Partner scope response guide');
    await accessible(view,'guest sees only the named page');
    const grant={operationKey:key(),targetKind:'container',targetId:space,principalKind:'member',principalId:who.id,level:'view'};
    await ok(context,origin,'POST','/api/sharing',grant);
    assert.equal((await ok(guest,origin,'GET',`/api/containers/${space}`)).name,'Partner response guides');
    assert.equal((await ok(guest,origin,'GET',`/api/pages/${secret}`)).page.title,'Partner scope private plan');
    const granted=await ok(guest,origin,'GET','/api/search?q=Partner%20scope');
    assert.deepEqual(granted.items.map(item=>item.id).sort(),[shared,secret].sort(),'A named container grant immediately admits both contained pages to search.');
    for(const route of ['/api/containers','/api/members'])assert.equal((await call(guest,origin,'GET',route)).status,403,'A container grant gives no workspace index authority.');
    assert.deepEqual(await api('/api/members'),members);
    const current=await api(`/api/containers/${space}`);
    await ok(context,origin,'POST','/api/sharing/container-settings',{operationKey:key(),id:space,expectedRevisionId:current.revisionId,visibility:'private',guestAccess:'forbidden',publicLinkAccess:current.publicLinkAccess,anonymousAccess:current.anonymousAccess});
    assert.equal((await call(guest,origin,'GET',`/api/containers/${space}`)).status,404);
    for(const id of [shared,secret])assert.equal((await call(guest,origin,'GET',`/api/pages/${id}`)).status,404,'The space veto wins over both named page and space grants.');
    const denied=await ok(guest,origin,'GET','/api/search?q=Partner%20scope');
    assert.ok(!denied.items.some(item=>[shared,secret].includes(item.id)));
    await view.reload({waitUntil:'networkidle'});
    await expect(view.locator('body')).not.toContainText('Partner scope response guide');
    await expect(view.locator('body')).not.toContainText('Partner scope private plan');
    await accessible(view,'guest space veto hides previously shared content');
    await externalSwitchesJourney(state,width,{guest,who,view,space,shared,secret});
    await ok(context,origin,'POST','/api/guests/revoke',{operationKey:key(),memberIds:[who.id]});
    assert.equal((await call(guest,origin,'GET','/api/session')).status,401);
    await ok(context,origin,'POST','/api/sharing',grant);
    assert.equal((await guest.request.post(origin+'/api/auth/invitation/accept',{headers:{origin},form:{token:link.searchParams.get('token')},maxRedirects:0})).status(),400,'Replaying the accepted invitation cannot restore a revoked guest.');
    for(const route of ['/api/session',`/api/pages/${shared}`,'/api/search?q=Partner%20scope'])assert.equal((await call(guest,origin,'GET',route)).status,401,'Replayed sharing cannot restore the revoked session.');
    assert.deepEqual(await api('/api/members'),members);
  } finally {await guest.close();}
}

const SWITCHES=['guestAccess','publicLinkAccess','anonymousAccess'];
const switches=value=>Object.fromEntries(SWITCHES.map(name=>[name,value[name]]));

/** CONT-007: native settings, issued guest sessions and real retained public addresses. */
async function externalSwitchesJourney(state,width,{guest,who,view,space,shared,secret}) {
  const {page,context,origin,api}=state,key=()=>randomUUID();
  const admin=await context.browser().newContext({viewport:page.viewportSize()});
  const anonymous=await context.browser().newContext({viewport:page.viewportSize()});
  await admin.addCookies([{name:'slate_session',value:state.readerCookie.split('=')[1],url:origin}]);
  const adminPage=await admin.newPage(),proof={width,changes:[],deadlines:[]};
  const read=()=>api(`/api/containers/${space}`);
  const workspace=()=>api('/api/workspace');
  const grant=(targetKind,targetId,principalId,level)=>ok(context,origin,'POST','/api/sharing',{operationKey:key(),targetKind,targetId,principalKind:'member',principalId,level});
  const publicRead=async(actor,id)=>{
    const response=await actor.request.get(`${origin}/p/native-switch-${id}`,{maxRedirects:0});
    return {status:response.status(),body:await response.text()};
  };
  const publish=async id=>{
    const document=await api(`/api/pages/${id}`);
    return call(context,origin,'POST',`/api/publishing/${id}`,{operationKey:key(),expectedRevisionId:document.page.revisionId,host:new URL(origin).host,slug:`native-switch-${id}`,headerControls:[],theme:'default'});
  };
  // Use the same controls people use; the response supplies the actual commit boundary.
  const change=async(scope,setting,value,{actor=scope==='workspace'?context:admin,actorPage=scope==='workspace'?page:adminPage,beforeSave}={})=>{
    const before=scope==='workspace'?await workspace():await read();
    await actorPage.goto(scope==='workspace'?`${origin}/app/settings`:`${origin}/app/containers/${space}`,{waitUntil:'networkidle'});
    if(scope==='workspace')await actorPage.getByRole('button',{name:'Edit workspace & policies',exact:true}).click();
    else {
      await actorPage.getByRole('navigation',{name:'Space navigation',exact:true}).getByRole('button',{name:'Settings',exact:true}).click();
      await actorPage.getByRole('button',{name:/^(Visibility & public access|External access)$/}).click();
    }
    const dialog=actorPage.getByRole('dialog',{name:scope==='workspace'?'Workspace settings':'Space access',exact:true});
    for(const name of SWITCHES)await expect(dialog.locator(`select[name="${name}"]`)).toHaveValue(before[name]);
    await dialog.locator(`select[name="${setting}"]`).selectOption(value);
    const close=dialog.getByRole('button',{name:'Close dialog',exact:true});
    await close.focus();
    await expect(close).toHaveAttribute('data-tooltip',/\S+\s+\S+/);
    await expect.poll(()=>close.evaluate(element=>getComputedStyle(element,'::after').opacity)).toBe('1');
    if(proof.changes.length<2)await accessible(actorPage,`native ${scope} external switches ${width}`);
    await beforeSave?.();
    const route=scope==='workspace'?'/api/workspace':'/api/sharing/container-settings';
    const responsePromise=actorPage.waitForResponse(response=>new URL(response.url()).pathname===route&&response.request().method()===(scope==='workspace'?'PUT':'POST'));
    await dialog.getByRole('button',{name:'Save settings',exact:true}).click();
    const response=await responsePromise,receipt=await response.json();
    assert.equal(response.status(),200,JSON.stringify(receipt));
    await expect(dialog).toBeHidden();
    const after=scope==='workspace'?await workspace():await read();
    assert.deepEqual(switches(after),{...switches(before),[setting]:value},'Each control changes its own switch only.');
    await actorPage.reload({waitUntil:'networkidle'});
    assert.deepEqual(switches(scope==='workspace'?await workspace():await read()),switches(after),'Settings survive native reload.');
    proof.changes.push({scope,setting,value,actor:actor===admin?'container administrator':'workspace owner',before:switches(before),after:switches(after),receipt:receipt.receipt});
    return Date.parse(receipt.receipt.committedAt);
  };
  try {
    assert.equal((await ok(admin,origin,'GET','/api/members/current')).role,'member');
    await grant('container',space,'browser-reader','full');
    assert.equal((await ok(admin,origin,'GET',`/api/containers/${space}`)).permissions.canManage,true);
    // Ordinary members cannot administer this container before receiving its full grant.
    const ordinary=(await ok(context,origin,'POST','/api/containers',{operationKey:key(),name:'Unrelated external-switch control',visibility:'private'})).value.id;
    await grant('container',ordinary,'browser-reader','view');
    const unrelated=await api(`/api/containers/${ordinary}`);
    assert.equal((await call(admin,origin,'POST','/api/sharing/container-settings',{operationKey:key(),id:ordinary,expectedRevisionId:unrelated.revisionId,visibility:'private',...switches(unrelated),guestAccess:'forbidden'})).status,404);
    assert.deepEqual(await api(`/api/containers/${ordinary}`),unrelated,'Ordinary-member refusal changes nothing.');
    const personal=(await api('/api/containers')).items.find(item=>item.visibility==='personal');
    assert.equal((await call(context,origin,'POST','/api/sharing/container-settings',{operationKey:key(),id:personal.id,expectedRevisionId:personal.revisionId,visibility:'private',guestAccess:'allowed',publicLinkAccess:'allowed',anonymousAccess:'allowed'})).status,403);
    assert.deepEqual(await api(`/api/containers/${personal.id}`),personal,'Even its owner cannot open a personal container.');
    for(const setting of SWITCHES) {
      const before=await workspace();
      assert.equal((await call(admin,origin,'PUT','/api/workspace',{...before,operationKey:key(),expectedRevisionId:before.revisionId,[setting]:'forbidden'})).status,403);
      assert.deepEqual(await workspace(),before,'A container administrator cannot change a global switch.');
      if(before[setting]!=='allowed')await change('workspace',setting,'allowed');
      if((await read())[setting]!=='allowed')await change('container',setting,'allowed');
    }
    await grant('container',space,who.id,'edit');
    const block=key(),marker=`synthetic-slate-${key().slice(0,8)}`;
    const editable=(await ok(context,origin,'POST','/api/pages',{operationKey:key(),containerId:space,title:marker,blocks:[{id:block,blockType:'paragraph',treePosition:'0',content:{text:[{text:'Retained native text.'}]}}]})).value.pageId;
    const control=(await ok(context,origin,'POST','/api/pages',{operationKey:key(),containerId:ordinary,title:`Unrelated ${marker}`})).value.pageId;
    await grant('container',ordinary,who.id,'view');
    for(const id of [editable,control]) {
      const document=await api(`/api/pages/${id}`);
      assert.equal(document.page.lifecycle,'live','Native always-live pages provide an explicit published-revision precondition.');
      assert.ok(document.publishedRevisionId);
      const result=await publish(id);
      assert.equal(result.status,200,JSON.stringify(result.body));
      const exposed=await publicRead(anonymous,id);
      assert.equal(exposed.status,200,'A real local publication is readable without a session before any veto.');
      assert.ok(exposed.body.includes(marker));
    }
    const exposure=(await api(`/api/publishing/${editable}`)).exposure;
    const visible=async()=>{
      const [document,tree,search,inbox]=await Promise.all([
        call(guest,origin,'GET',`/api/pages/${editable}`),ok(guest,origin,'GET','/api/pages'),
        ok(guest,origin,'GET',`/api/search?q=${marker}`),ok(guest,origin,'GET','/api/notifications'),
      ]);
      return {page:document.status===200,tree:tree.items.some(item=>item.id===editable),search:search.items.some(item=>item.id===editable),inbox:inbox.items.some(item=>item.pageId===editable)};
    };
    const assertAccess=async(setting,forbidden,scope)=>{
      const guestExpected=!(forbidden&&setting==='guestAccess'),publicExpected=!(forbidden&&setting!=='guestAccess');
      for(const id of [shared,secret,editable])assert.equal((await call(guest,origin,'GET',`/api/pages/${id}`)).status,guestExpected?200:404);
      const publicResult=await publicRead(anonymous,editable);
      assert.equal(publicResult.status,publicExpected?200:404);
      assert.equal(publicResult.body.includes(marker),publicExpected);
      assert.equal((await publicRead(context,editable)).status,forbidden&&setting==='publicLinkAccess'?404:200,'Anonymous veto retains a currently authorized signed-in reader.');
      assert.equal((await publish(editable)).status,forbidden&&setting==='publicLinkAccess'?403:200,'Only the public-links veto forbids publication.');
      const invitation=await call(context,origin,'POST','/api/invitations',{operationKey:key(),email:[`synthetic-slate-${key()}`,'test.invalid'].join('@'),kind:'guest',pageId:editable,level:'view'});
      assert.equal(invitation.status,forbidden&&setting==='guestAccess'?403:200,'Only the guest veto forbids a guest invitation.');
      assert.deepEqual((await api(`/api/publishing/${editable}`)).exposure,exposure,'Vetoes preserve the exact host, slug and exposure settings.');
      assert.deepEqual(await api(`/api/containers/${ordinary}`),unrelated,'Editing a switch never rewrites an unrelated container.');
      assert.equal((await call(guest,origin,'GET',`/api/pages/${control}`)).status,forbidden&&setting==='guestAccess'&&scope==='workspace'?404:200);
      assert.equal((await publicRead(anonymous,control)).status,forbidden&&setting!=='guestAccess'&&scope==='workspace'?404:200);
    };
    for(const scope of ['container','workspace'])for(const setting of SWITCHES) {
      let held;
      const matches=url=>url.pathname===`/api/pages/${editable}/blocks/${block}`;
      const hold=route=>{if(route.request().method()==='PATCH')held=route;else void route.continue();};
      const unsent=` Unsent native ${scope} veto`;
      if(setting==='guestAccess') {
        await ok(context,origin,'POST',`/api/comments/page/${editable}`,{operationKey:key(),kind:'page',body:[{text:'Guest review '},{text:'Guest',mention:{kind:'person',id:who.id,label:'Guest'}}]});
        assert.deepEqual(await visible(),{page:true,tree:true,search:true,inbox:true},'The guest starts with populated, readable projections.');
        await view.goto(`${origin}/app/pages/${editable}`,{waitUntil:'networkidle'});
      }
      try {
        const since=await change(scope,setting,'forbidden',{beforeSave:setting==='guestAccess'?async()=>{
          await view.route(matches,hold);
          await caretAtEnd(view,block);
          await view.keyboard.type(unsent);
          await expect.poll(()=>!!held).toBe(true);
        }:undefined});
        if(setting==='guestAccess') {
          const response=await held.fetch({maxRetries:0});
          assert.equal(response.status(),404,'The captured native guest write is refused on its very next request.');
          await held.fulfill({response});held=undefined;
          const editorMs=await elapsedUntil(()=>view.getByRole('heading',{name:'Access needed',exact:true}).isVisible(),{timeout:5000,since});
          const projectionsMs=await elapsedUntil(async()=>Object.values(await visible()).every(value=>!value),{timeout:5000,since});
          assert.ok(editorMs<=5000&&projectionsMs<=5000,JSON.stringify({editorMs,projectionsMs}));
          await expect(view.locator('.request-notice')).toContainText('Your access to this page changed while it was open.');
          const draft=view.getByRole('region',{name:'Your unsaved text'});
          await expect(draft).toContainText(unsent.trim());
          await expect(draft).toContainText('It was not saved to the workspace');
          assert.ok(!JSON.stringify((await api(`/api/pages/${editable}`)).blocks).includes(unsent.trim()),'Refused typing changes no stored page content.');
          await accessible(view,`native ${scope} guest veto preserves unsaved text ${width}`);
          await draft.getByRole('button',{name:'Discard',exact:true}).click();
          proof.deadlines.push({scope,setting,nextWrite:response.status(),editorMs,projectionsMs});
        } else {
          const result=await publicRead(anonymous,editable),refusalMs=Date.now()-since;
          assert.equal(result.status,404);assert.ok(refusalMs<=5000,`Anonymous next request took ${refusalMs} ms.`);
          proof.deadlines.push({scope,setting,nextRead:result.status,refusalMs});
        }
        // A stored local allowance cannot widen the effective workspace veto.
        if(scope==='workspace')await change('container',setting,'allowed');
        await assertAccess(setting,true,scope);
        await change(scope,setting,'allowed');
        await assertAccess(setting,false,scope);
        console.log(`PROBE CONT-007 ${scope} ${setting} ${width}: native settings persisted; independent veto, retained address and authority reconciled`);
      } finally {
        if(held)await held.abort();
        await view.unroute(matches,hold);
      }
    }
    assert.deepEqual(await api(`/api/containers/${ordinary}`),unrelated);
    proof.localPublication={native:true,anonymousBeforeVeto:200,retainedExposure:exposure};
  } finally {
    const directory=path.join(root,'.artifacts/ui-convergence');
    await mkdir(directory,{recursive:true});
    await writeFile(path.join(directory,`external-switches-${width}.json`),JSON.stringify(proof,null,2));
    await anonymous.close();await admin.close();
  }
}
