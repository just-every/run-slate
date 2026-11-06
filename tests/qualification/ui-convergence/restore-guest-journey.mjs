import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {expect} from '@playwright/test';
import {inbox,newOutboxLink,signInWithOutbox} from '../../e2e/outbox-auth.mjs';
import {call,ok,grant} from './two-people-support.mjs';

const key=()=>randomUUID();

async function invite(state,email,pageId) {
  const {context,origin}=state;
  const before=await inbox(origin);
  await ok(context,origin,'POST','/api/invitations',{operationKey:key(),email,kind:'guest',pageId,level:'view'});
  const link=new URL(await newOutboxLink(origin,before));
  const guest=await context.browser().newContext({viewport:state.page.viewportSize()});
  try {
    const accepted=await guest.request.post(origin+'/api/auth/invitation/accept',{headers:{origin},form:{token:link.searchParams.get('token')},maxRedirects:0});
    assert.equal(accepted.status(),303);
    return guest;
  } catch(error){await guest.close();throw error;}
}

/** A native scoped guest and a separate invitation landing preserve the selected page grants. */
export async function prepareRestoreGuest(state,fixture) {
  const {context,origin}=state;
  const email=[`synthetic-slate-restore-guest-${state.page.viewportSize().width}`,'test.invalid'].join('@');
  const landingId=(await ok(context,origin,'POST','/api/pages',{operationKey:key(),containerId:fixture.containerId,title:'Guest invitation landing'})).value.pageId;
  const guest=await invite(state,email,landingId);
  try {
    const who=await ok(guest,origin,'GET','/api/members/current');
    assert.equal(who.memberKind,'guest');
    await grant(context,origin,fixture.parent.id,who.id,'view');
    return {id:who.id,email,landingId,source:await guestAccess(guest,origin,fixture),session:(await guest.cookies(origin)).find(item=>item.name==='slate_session').value};
  } finally {await guest.close();}
}

async function guestAccess(context,origin,fixture) {
  const allowed=[];
  for(const item of [fixture.parent,fixture.groupChild]) {
    const result=await ok(context,origin,'GET',`/api/pages/${item.id}`);
    assert.equal(result.page.id,item.id);assert.equal(result.page.title,item.title);
    assert.equal(result.permissions.level,'view');assert.equal(result.permissions.canEdit,false);
    allowed.push({id:result.page.id,title:result.page.title,level:result.permissions.level,blocks:result.blocks});
  }
  const refused={};
  for(const route of [`/api/pages/${fixture.direct.id}`,`/api/pages/${fixture.denied.id}`,`/api/revisions/${fixture.denied.id}`,`/api/media/${fixture.originals[1].id}`]) {
    const result=await call(context,origin,'GET',route);assert.equal(result.status,404);
    assert.doesNotMatch(JSON.stringify(result.body),/owner-only annex|direct member appendix|annex-original/);
    refused[route]=result;
  }
  for(const route of ['/api/containers','/api/members','/api/groups']) {
    const result=await call(context,origin,'GET',route);assert.equal(result.status,403);refused[route]=result;
  }
  const image=fixture.originals[2];
  const bytes=await context.request.get(origin+`/api/media/${image.id}`);
  assert.equal(bytes.status(),200);assert.deepEqual(await bytes.body(),image.bytes);
  return {allowed,refused,image:{id:image.id,bytes:(await bytes.body()).length}};
}

/** Restored historical guest needs renewed invitation, fresh sign-in and the same limited authority. */
export async function proveRestoreGuest(state,fixture,evidence) {
  const {context,origin}=state,original=fixture.guest;
  const before=await inbox(origin);
  const requested=await context.request.post(origin+'/api/auth/magic',{headers:{Origin:origin},data:{email:original.email,requestKey:key()}});
  assert.equal(requested.status(),200);assert.equal((await requested.json()).accepted,true);
  assert.deepEqual(await inbox(origin),before,'Restored guest is historical until invited.');
  const guest=await invite(state,original.email,original.landingId);
  try {
    await guest.clearCookies();
    const fresh=await signInWithOutbox(origin,original.email);
    await guest.addCookies([{name:'slate_session',value:fresh.cookie.split('=')[1],url:origin}]);
    const who=await ok(guest,origin,'GET','/api/members/current');
    assert.equal(who.id,original.id);assert.equal(who.memberKind,'guest');
    const restored=await guestAccess(guest,origin,fixture);
    assert.deepEqual(restored,original.source,'Fresh restored guest retains the exact named scope and refusals.');
    const page=await guest.newPage();
    await page.goto(origin+`/app/pages/${fixture.parent.id}`,{waitUntil:'networkidle'});
    await expect(page.getByRole('textbox',{name:'Page title',exact:true})).toHaveValue(fixture.parent.title);
    await expect(page.locator('[data-page-editor] [contenteditable="true"]')).toHaveCount(0);
    const image=page.locator(`[data-block-id="${fixture.imageBlockId}"] img`);
    await expect(image).toHaveAttribute('src',new RegExp(fixture.originals[2].id));
    await expect.poll(()=>image.evaluate(element=>element.complete&&element.naturalWidth>0)).toBe(true);
    await page.reload({waitUntil:'networkidle'});
    await expect(page.getByRole('textbox',{name:'Page title',exact:true})).toHaveValue(fixture.parent.title);
    await expect.poll(()=>image.evaluate(element=>element.complete&&element.naturalWidth>0)).toBe(true);
    await page.screenshot({path:path.join(evidence,`${page.viewportSize().width}-restored-guest.png`),fullPage:true});
    await page.goto(origin+`/app/pages/${fixture.denied.id}`,{waitUntil:'networkidle'});
    await expect(page.locator('body')).not.toContainText('owner-only annex');
    console.log('PROBE PORT-002 guest: historical guest cannot sign in; renewed invitation and fresh native sign-in retain identity, named page scope, original image, read-only mode and refused workspace indexes');
    return {id:who.id,memberKind:who.memberKind,source:original.source,restored};
  } finally {await guest.close();}
}
