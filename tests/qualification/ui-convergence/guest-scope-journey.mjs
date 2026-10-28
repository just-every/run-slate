import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {expect} from '@playwright/test';
import {inbox,newOutboxLink} from '../../e2e/outbox-auth.mjs';
import {accessible} from './browser-evidence.mjs';
import {call,ok} from './two-people-support.mjs';

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
    const view=await guest.newPage();
    await view.goto(`${origin}/app/pages/${shared}`,{waitUntil:'networkidle'});
    await expect(view.getByRole('textbox',{name:'Page title',exact:true})).toHaveValue('Partner scope response guide');
    await accessible(view,'guest sees only the named page');
    await ok(context,origin,'POST','/api/sharing',{operationKey:key(),targetKind:'container',targetId:space,principalKind:'member',principalId:who.id,level:'view'});
    assert.equal((await ok(guest,origin,'GET',`/api/pages/${secret}`)).page.title,'Partner scope private plan');
    const current=await api(`/api/containers/${space}`);
    await ok(context,origin,'POST','/api/sharing/container-settings',{operationKey:key(),id:space,expectedRevisionId:current.revisionId,visibility:'private',guestAccess:'forbidden',publicLinkAccess:current.publicLinkAccess,anonymousAccess:current.anonymousAccess});
    for(const id of [shared,secret])assert.equal((await call(guest,origin,'GET',`/api/pages/${id}`)).status,404,'The space veto wins over both named page and space grants.');
    const denied=await ok(guest,origin,'GET','/api/search?q=Partner%20scope');
    assert.ok(!denied.items.some(item=>[shared,secret].includes(item.id)));
    await view.reload({waitUntil:'networkidle'});
    await expect(view.locator('body')).not.toContainText('Partner scope response guide');
    await expect(view.locator('body')).not.toContainText('Partner scope private plan');
    await accessible(view,'guest space veto hides previously shared content');
    await ok(context,origin,'POST','/api/guests/revoke',{operationKey:key(),memberIds:[who.id]});
    assert.equal((await call(guest,origin,'GET','/api/session')).status,401);
  } finally {await guest.close();}
}
