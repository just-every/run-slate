import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {expect,request} from '@playwright/test';
import {inbox,newOutboxLink} from '../../e2e/outbox-auth.mjs';
import {accessible} from './browser-evidence.mjs';
import {call as nativeCall,ok as nativeOk,caretAtEnd,elapsedUntil} from './two-people-support.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {root} from '../../e2e/runtime-harness.mjs';

// These settings callers already exercise a populated workspace. Reserve read
// and command slots below normal operator admission rather than changing limits.
let nextRequestAt=0;
async function pace() {
  const at=Math.max(Date.now(),nextRequestAt);
  nextRequestAt=at+150;
  const delay=at-Date.now();
  if(delay>0)await new Promise(resolve=>setTimeout(resolve,delay));
}
async function call(...args) {await pace();return nativeCall(...args);}
async function ok(...args) {await pace();return nativeOk(...args);}

/** Named page and space grants admit a guest without workspace membership. */
export async function guestScopeJourney(state,width) {
  const readApi=state.api;
  state={...state,api:async(...args)=>{await pace();return readApi(...args);}};
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
  const adminPage=await admin.newPage(),proof={width,changes:[],deadlines:[],publication:[],invitations:[],policies:[]};
  const read=()=>api(`/api/containers/${space}`);
  const workspace=()=>api('/api/workspace');
  const grant=(targetKind,targetId,principalId,level,id)=>ok(context,origin,'POST','/api/sharing',{operationKey:key(),targetKind,targetId,principalKind:'member',principalId,level,...(id?{id}:{})});
  const publicRead=async(actor,id)=>{
    const response=await actor.request.get(`${origin}/p/native-switch-${id}`,{maxRedirects:0});
    return {status:response.status(),body:await response.text()};
  };
  const firstPublications=new Map();
  const publish=async(id,actor=context)=>{
    const document=await api(`/api/pages/${id}`);
    const input={operationKey:key(),expectedRevisionId:document.page.revisionId,host:new URL(origin).host,slug:`native-switch-${id}`,headerControls:[],theme:'default'};
    const result=await call(actor,origin,'POST',`/api/publishing/${id}`,input);
    if(actor===context&&result.status===200&&!firstPublications.has(id))firstPublications.set(id,{input,result});
    return result;
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
    await actorPage.keyboard.press('Tab');
    await close.focus();
    await expect(close).toHaveAttribute('data-tooltip',/\S+\s+\S+/);
    await expect.poll(()=>close.evaluate(element=>getComputedStyle(element,'::after').opacity)).toBe('1');
    if(!proof.changes.some(change=>change.scope===scope)) {
      await dialog.locator('select[name="anonymousAccess"]').scrollIntoViewIfNeeded();
      await accessible(actorPage,`native ${scope} external switches ${width}`);
    }
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
    const adminGrant=await grant('container',space,'browser-reader','full');
    assert.equal((await ok(admin,origin,'GET',`/api/containers/${space}`)).permissions.canManage,true);
    // A full grant for one space gives no administration over another.
    const ordinary=(await ok(context,origin,'POST','/api/containers',{operationKey:key(),name:'Unrelated external-switch control',visibility:'private'})).value.id;
    await grant('container',ordinary,'browser-reader','view');
    const unrelated=await api(`/api/containers/${ordinary}`);
    assert.ok([403,404].includes((await call(admin,origin,'POST','/api/sharing/container-settings',{operationKey:key(),id:ordinary,expectedRevisionId:unrelated.revisionId,visibility:'private',...switches(unrelated),guestAccess:'forbidden'})).status));
    assert.deepEqual(await api(`/api/containers/${ordinary}`),unrelated,'Ordinary-member refusal changes nothing.');
    const personal=(await api('/api/containers')).items.find(item=>item.visibility==='personal');
    assert.equal((await call(context,origin,'POST','/api/sharing/container-settings',{operationKey:key(),id:personal.id,expectedRevisionId:personal.revisionId,visibility:'private',guestAccess:'allowed',publicLinkAccess:'allowed',anonymousAccess:'allowed'})).status,403);
    assert.deepEqual(await api(`/api/containers/${personal.id}`),personal,'Even its owner cannot open a personal container.');
    for(const setting of SWITCHES) {
      const before=await workspace();
      assert.equal((await call(admin,origin,'PUT','/api/workspace',{name:before.name,mark:before.mark,description:before.description,policies:before.policies,...switches(before),operationKey:key(),expectedRevisionId:before.revisionId,[setting]:'forbidden'})).status,403);
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
    // The same non-owner member must hold full access for the external act.
    const publicationSnapshot=async(id=editable)=>({
      document:await api(`/api/pages/${id}`),
      exposure:await api(`/api/publishing/${id}`),
      grants:await api(`/api/sharing/containers/${space}`),
    });
    await grant('container',space,'browser-reader','edit',adminGrant.value.id);
    assert.equal((await ok(admin,origin,'GET',`/api/pages/${editable}`)).permissions.level,'edit');
    const editBefore=await publicationSnapshot(),editRefusal=await publish(editable,admin);
    assert.equal(editRefusal.status,404);
    assert.equal(editRefusal.body.code,'NOT_FOUND');
    assert.deepEqual(await publicationSnapshot(),editBefore,'An edit-level publication attempt changes neither content, exposure nor grants.');
    const memberPage=(await ok(context,origin,'POST','/api/pages',{operationKey:key(),containerId:space,title:'Member publication intake'})).value.pageId;
    const newBefore=await publicationSnapshot(memberPage),newRefusal=await publish(memberPage,admin);
    assert.equal(newBefore.exposure.exposure,null);
    assert.equal(newRefusal.status,404);
    assert.equal(newRefusal.body.code,'NOT_FOUND');
    assert.deepEqual(await publicationSnapshot(memberPage),newBefore,'An edit-only member cannot create the first exposure either.');
    assert.equal((await publicRead(anonymous,memberPage)).status,404);
    await grant('container',space,'browser-reader','full',adminGrant.value.id);
    const firstMemberPublication=await publish(memberPage,admin);
    assert.equal(firstMemberPublication.status,200,JSON.stringify(firstMemberPublication.body));
    assert.equal((await publicRead(anonymous,memberPage)).status,200,'Full access admits first publication while both scopes permit it.');
    proof.publication.push({actor:'ordinary member first publication',edit:newRefusal,unchanged:newBefore,full:firstMemberPublication});
    const memberPublished=await publish(editable,admin);
    assert.equal(memberPublished.status,200,JSON.stringify(memberPublished.body));
    assert.equal((await publicRead(anonymous,editable)).status,200);
    proof.publication.push({actor:'ordinary member',edit:editRefusal,unchanged:editBefore,full:memberPublished});
    const exposure=(await api(`/api/publishing/${editable}`)).exposure;
    const retainedBlocks=(await api(`/api/pages/${editable}`)).blocks;
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
      assert.equal((await call(guest,origin,'GET',`/api/containers/${space}`)).status,guestExpected?200:404);
      const publicResult=await publicRead(anonymous,editable);
      assert.equal(publicResult.status,publicExpected?200:404);
      assert.equal(publicResult.body.includes(marker),publicExpected);
      assert.equal((await publicRead(context,editable)).status,forbidden&&setting==='publicLinkAccess'?404:200,'Anonymous veto retains a currently authorized signed-in reader.');
      assert.equal((await publish(editable)).status,forbidden&&setting==='publicLinkAccess'?403:200,'Only the public-links veto forbids publication.');
      const beforePublication=await publicationSnapshot(),publication=await publish(editable,admin);
      assert.equal(publication.status,forbidden&&setting==='publicLinkAccess'?403:200,'Full access still requires effective container and workspace publication permission.');
      if(publication.status===403)assert.deepEqual(await publicationSnapshot(),beforePublication,'Refused publication leaves all content, exposure and grants unchanged.');
      proof.publication.push({scope,setting,forbidden,status:publication.status,receipt:publication.body.receipt,...(publication.status===403?{unchanged:beforePublication}:{})});
      if(forbidden&&setting==='publicLinkAccess') {
        const capture=firstPublications.get(editable),beforeReplay=await publicationSnapshot();
        const replay=await call(context,origin,'POST',`/api/publishing/${editable}`,capture.input);
        assert.ok([200,403].includes(replay.status),JSON.stringify(replay));
        if(replay.status===200)assert.deepEqual(replay.body,capture.result.body,'A replay can return only its original receipt.');
        assert.deepEqual(await publicationSnapshot(),beforeReplay,'A previously successful publication capture cannot change a vetoed exposure.');
        assert.equal((await publicRead(anonymous,editable)).status,404);
        proof.publication.push({scope,replayedCapture:capture.input.operationKey,status:replay.status,unchanged:beforeReplay});
      }

      for(const target of [{pageId:editable},{containerId:space}]) {
        const snapshot=async()=>({
          invitations:await api('/api/invitations'),
          pageGrants:await api(`/api/sharing/pages/${editable}`),
          spaceGrants:await api(`/api/sharing/containers/${space}`),
        });
        const beforeInvitation=await snapshot();
        const invitation=await call(context,origin,'POST','/api/invitations',{operationKey:key(),email:[`synthetic-slate-${key()}`,'test.invalid'].join('@'),kind:'guest',...target,level:'view'});
        assert.equal(invitation.status,forbidden&&setting==='guestAccess'?403:200,'Only the guest veto forbids either kind of guest invitation.');
        if(invitation.status===403) {
          assert.equal(invitation.body.code,'GUESTS_FORBIDDEN');
          assert.deepEqual(await snapshot(),beforeInvitation,'A refused invitation issues no invitation or resource grant.');
        }
        proof.invitations.push({scope,setting,forbidden,target,status:invitation.status,code:invitation.body.code,receipt:invitation.body.receipt,...(invitation.status===403?{unchanged:beforeInvitation}:{})});
      }
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
          assert.deepEqual((await api(`/api/pages/${editable}`)).blocks,retainedBlocks,'Refused typing changes no stored block, revision or content.');
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
        await policyVetoProof({context,origin,api,space,proof,check:()=>assertAccess(setting,true,scope)});
        await change(scope,setting,'allowed');
        await assertAccess(setting,false,scope);
        console.log(`PROBE CONT-007 ${scope} ${setting} ${width}: native settings persisted; independent veto, retained address and authority reconciled`);
      } finally {
        if(held)await held.abort();
        await view.unroute(matches,hold);
      }
    }
    assert.deepEqual(await api(`/api/containers/${ordinary}`),unrelated);
    await automationVetoProof(state,{space,anonymous,publicRead,publish,change,proof});
    await tokenVetoProof(state,{space,editable,anonymous,publicRead,change,proof});
    proof.localPublication={native:true,anonymousBeforeVeto:200,retainedExposure:exposure};
  } finally {
    const directory=path.join(root,'.artifacts/ui-convergence');
    await mkdir(directory,{recursive:true});
    await writeFile(path.join(directory,`external-switches-${width}.json`),JSON.stringify(proof,null,2));
    await anonymous.close();await admin.close();
  }
}

/** Every supported content-policy value is independent of the three vetoes. */
async function policyVetoProof({context,origin,api,space,proof,check}) {
  const original=await api('/api/workspace'),container=await api(`/api/containers/${space}`);
  const alternate={
    'page.lifecycle.v1':'draft-then-publish','page.access.v1':'container-general',
    'page.public-access.v1':'link','page.version.v1':'labelled',
    'page.status.v1':'open-vocabulary','record.page-parity.v1':'record-is-row',
    'automation.scope.v1':'site','container.access.v1':'grant-led',
  };
  const save=async policies=>{
    const current=await api('/api/workspace');
    return ok(context,origin,'PUT','/api/workspace',{operationKey:randomUUID(),expectedRevisionId:current.revisionId,
      name:current.name,mark:current.mark,description:current.description,...switches(current),policies});
  };
  try {
    for(const policies of [alternate,{...alternate,'automation.scope.v1':'container'}]) {
      const result=await save(policies),after=await api('/api/workspace');
      assert.deepEqual(after.policies,policies);
      assert.deepEqual(switches(after),switches(original));
      assert.deepEqual(await api(`/api/containers/${space}`),container,'Changing policy values rewrites no container switch or grant.');
      await check();
      proof.policies.push({policies,workspace:switches(after),container:switches(container),receipt:result.receipt});
    }
  } finally {await save(original.policies);}
}

/** Native event processing may move or create content, never publish through a veto. */
async function automationVetoProof(state,{space,anonymous,publicRead,publish,change,proof}) {
  const {context,origin,api}=state,key=()=>randomUUID();
  await change('container','publicLinkAccess','forbidden');
  await change('container','anonymousAccess','forbidden');
  const source=(await ok(context,origin,'POST','/api/containers',{operationKey:key(),name:'Publication automation source',visibility:'private'})).value.id;
  const id=(await ok(context,origin,'POST','/api/pages',{operationKey:key(),containerId:source,title:'Published automation input'})).value.pageId;
  assert.equal((await publish(id)).status,200);
  assert.equal((await publicRead(anonymous,id)).status,200);
  const exposure=(await api(`/api/publishing/${id}`)).exposure;
  const title=`synthetic-slate-${key()}`;
  const definition={name:'Move and create without publication authority',scope:'site',trigger:{event:'properties'},conditions:[],
    actions:[{type:'move',containerId:space},{type:'create-page',containerId:space,title}]};
  const rule=(await ok(context,origin,'POST','/api/automation',{operationKey:key(),...definition})).value;
  const document=await api(`/api/pages/${id}`);
  const command={operationKey:key(),expectedRevisionId:document.page.revisionId,properties:{title:'Moved published automation input'}};
  const update=await ok(context,origin,'PATCH',`/api/pages/${id}`,command);
  await state.runScheduled();
  await state.runScheduled();
  const runs=(await api(`/api/automation/${rule.id}/runs`)).items;
  const run=runs.find(item=>item.trigger.pageId===id&&item.state==='success');
  assert.ok(run,JSON.stringify(runs));
  assert.equal((await api(`/api/pages/${id}`)).page.containerId,space,'The rule really moved the already exposed page into the vetoing space.');
  assert.deepEqual((await api(`/api/publishing/${id}`)).exposure,exposure);
  const created=(await api(`/api/pages?containerId=${space}`)).items.filter(item=>item.title===title);
  assert.equal(created.length,1,'The native rule created exactly one real page in the destination.');
  for(const pageId of [id,created[0].id]) {
    const before={document:await api(`/api/pages/${pageId}`),exposure:await api(`/api/publishing/${pageId}`),grants:await api(`/api/sharing/pages/${pageId}`)};
    assert.equal((await publicRead(anonymous,pageId)).status,404);
    const denied=await publish(pageId);
    assert.equal(denied.status,403);
    assert.equal(denied.body.code,'PUBLICATION_FORBIDDEN');
    assert.deepEqual({document:await api(`/api/pages/${pageId}`),exposure:await api(`/api/publishing/${pageId}`),grants:await api(`/api/sharing/pages/${pageId}`)},before);
  }
  assert.equal((await api(`/api/publishing/${created[0].id}`)).exposure,null,'Creating content never creates a public exposure.');
  const replaySnapshot=async()=>({pages:await api(`/api/pages?containerId=${space}`),moved:await api(`/api/pages/${id}`),
    created:await api(`/api/pages/${created[0].id}`),exposure:await api(`/api/publishing/${id}`),grants:await api(`/api/sharing/pages/${id}`)});
  const beforeReplay=await replaySnapshot();
  const replay=await ok(context,origin,'PATCH',`/api/pages/${id}`,command);
  assert.deepEqual(replay.receipt,update.receipt,'The replay retains the original mutation receipt while its document reflects the current moved page.');
  assert.deepEqual(replay.value,update.value);
  await state.runScheduled();
  assert.deepEqual(await replaySnapshot(),beforeReplay,'Replayed input changes no moved or created content, exposure, grants or page inventory.');
  assert.equal((await api(`/api/pages?containerId=${space}`)).items.filter(item=>item.title===title).length,1);
  assert.equal((await publicRead(anonymous,id)).status,404,'Replay cannot restore anonymous resolution.');
  const beforeRules=await api('/api/automation');
  for(const action of [{type:'publish',pageId:id},{type:'container-settings',containerId:space,publicLinkAccess:'allowed'}]) {
    const result=await call(context,origin,'POST','/api/automation',{operationKey:key(),...definition,actions:[action]});
    assert.equal(result.status,400,'The native rule door exposes neither publication nor switch mutation.');
  }
  assert.deepEqual(await api('/api/automation'),beforeRules,'Unsupported actions create no rule.');
  await ok(context,origin,'POST','/api/automation',{operationKey:key(),...definition,id:rule.id,expectedRevisionId:rule.revisionId,disabled:true});
  proof.automation={rule:rule.id,run,sourcePage:id,createdPage:created[0].id,retainedExposure:exposure,replayedReceipt:replay.receipt};
  await change('container','publicLinkAccess','allowed');
  assert.equal((await publicRead(anonymous,id)).status,404,'The independent anonymous veto survives the rule and public-link allowance.');
  assert.equal((await publicRead(context,id)).status,200);
  await change('container','anonymousAccess','allowed');
  assert.equal((await publicRead(anonymous,id)).status,200);
  assert.equal((await publicRead(anonymous,created[0].id)).status,404);
}

/** A real write-scoped owner token cannot call signed-in publication or settings doors. */
async function tokenVetoProof(state,{space,editable,anonymous,publicRead,change,proof}) {
  const {context,origin,api}=state,key=()=>randomUUID();
  const transport=await request.newContext(),credentialContext=context;
  const owner=await api('/api/members/current'),beforeProof=await inbox(origin);
  const challenge=await call(credentialContext,origin,'POST','/auth/step-up',{action:'credentials:mint',returnTo:'/app/settings?section=developer'});
  assert.equal(challenge.status,202);
  const confirmation=new URL(await newOutboxLink(origin,beforeProof));
  const confirmed=await credentialContext.request.post(confirmation.href,{headers:{origin},form:{token:confirmation.searchParams.get('token')},maxRedirects:0});
  assert.equal(confirmed.status(),303,'The existing native session confirms the sensitive operation through its own mailbox.');
  assert.equal((await ok(credentialContext,origin,'GET','/api/members/current')).id,owner.id);
  let tokenId;
  try {
    const minted=await ok(credentialContext,origin,'POST','/api/developer/tokens',{operationKey:key(),name:'Publication boundary proof',scopes:[{containerId:space,level:'write'}]});
    tokenId=minted.value.id;
    const headers={authorization:`Bearer ${minted.secret}`,origin};
    const invoke=async(method,route,data)=>{
      const response=await transport.fetch(origin+route,{method,headers,data});
      return {status:response.status(),body:await response.json()};
    };
    assert.equal((await invoke('GET',`/api/v1/pages/${editable}`)).status,200,'The token is valid for ordinary content access.');
    await change('container','publicLinkAccess','forbidden');
    const snapshot=async()=>({workspace:await api('/api/workspace'),container:await api(`/api/containers/${space}`),
      exposure:await api(`/api/publishing/${editable}`),document:await api(`/api/pages/${editable}`),
      grants:await api(`/api/sharing/containers/${space}`)});
    const before=await snapshot(),document=before.document;
    const publication={operationKey:key(),expectedRevisionId:document.page.revisionId,host:new URL(origin).host,slug:`native-switch-${editable}`};
    const setting={operationKey:key(),id:space,expectedRevisionId:before.container.revisionId,visibility:'private',...switches(before.container),publicLinkAccess:'allowed'};
    const attempts=[];
    for(const [method,route,data,status] of [
      ['POST',`/api/publishing/${editable}`,publication,401],
      ['POST','/api/sharing/container-settings',setting,401],
      ['PUT','/api/workspace',{...before.workspace,operationKey:key(),publicLinkAccess:'allowed'},401],
      ['POST',`/api/v1/publishing/${editable}`,publication,404],
      ['POST','/api/v1/sharing/container-settings',setting,404],
      ['PUT','/api/v1/workspace',{operationKey:key(),publicLinkAccess:'allowed'},404],
    ]) {
      const result=await invoke(method,route,data);
      assert.equal(result.status,status,JSON.stringify(result.body));
      attempts.push({method,route,status:result.status});
    }
    const spec=await invoke('GET','/api/v1/openapi.json');
    assert.equal(spec.status,200);
    assert.ok(!Object.entries(spec.body.paths).some(([route,operations])=>/publishing|workspace|sharing|container-settings/.test(route)
      ||Object.values(operations).some(operation=>/publish|switch/i.test(operation.operationId))),'The public operation catalog exposes no privileged publication or switch operation.');
    assert.deepEqual(await snapshot(),before,'Token attempts change no settings, grants, page or public exposure.');
    assert.equal((await publicRead(anonymous,editable)).status,404);
    await ok(credentialContext,origin,'POST',`/api/developer/tokens/${tokenId}/revoke`,{operationKey:key()});
    assert.equal((await invoke('GET',`/api/v1/pages/${editable}`)).status,401,'Revocation ends the issued credential immediately.');
    assert.equal((await invoke('POST',`/api/v1/publishing/${editable}`,publication)).status,401,'A revoked capture cannot regain publication.');
    proof.token={id:tokenId,scope:{containerId:space,level:'write'},stepUp:{requested:challenge.status,confirmed:confirmed.status(),actor:owner.id},attempts,revokedRead:401};
  } finally {
    await transport.dispose();
    if(tokenId)await ok(credentialContext,origin,'POST',`/api/developer/tokens/${tokenId}/revoke`,{operationKey:key()});
    await change('container','publicLinkAccess','allowed');
  }
}
