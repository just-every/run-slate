import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {expect} from '@playwright/test';
import {inbox,newOutboxLink,signInWithOutbox} from '../../e2e/outbox-auth.mjs';
import {accessible} from './browser-evidence.mjs';
import {call,ok} from './two-people-support.mjs';

/** Invite twice before joining, then remove through Settings with both sessions live. */
export async function memberRemovalJourney(state,width) {
  const {page,context,origin,api}=state,key=()=>randomUUID(),email=['casey',`removal-${width}.invalid`].join('@');
  const links=[];
  for(let index=0;index<2;index++) {
    const before=await inbox(origin);
    await ok(context,origin,'POST','/api/invitations',{operationKey:key(),email,kind:'member'});
    links.push(await newOutboxLink(origin,before));
  }
  const colleague=await context.browser().newContext({viewport:page.viewportSize()}),second=await context.browser().newContext();
  try {
    const accepted=await colleague.request.post(origin+'/api/auth/invitation/accept',{headers:{origin},form:{token:new URL(links[0]).searchParams.get('token')},maxRedirects:0});
    assert.equal(accepted.status(),303);
    const person=await ok(colleague,origin,'GET','/api/members/current');
    const profile=await ok(colleague,origin,'GET',`/api/people/${person.id}`);
    await ok(colleague,origin,'PUT',`/api/people/${person.id}`,{operationKey:key(),expectedRevisionId:profile.revisionId,displayName:'Casey Chen'});
    const session=await signInWithOutbox(origin,email);
    await second.addCookies([{name:'slate_session',value:session.cookie.split('=')[1],url:origin}]);
    const privateSpace=(await ok(colleague,origin,'GET','/api/containers')).items.find(item=>item.visibility==='personal');
    const personal=(await ok(colleague,origin,'POST','/api/pages',{operationKey:key(),containerId:privateSpace.id,title:'Casey private notes',blocks:[{id:key(),blockType:'paragraph',content:{text:[{text:'Private departure notes remain private.'}]},treePosition:'0'}]})).value.pageId;
    const space=(await ok(context,origin,'POST','/api/containers',{operationKey:key(),name:'Departure handover',visibility:'private'})).value.id;
    await ok(context,origin,'POST','/api/sharing',{operationKey:key(),targetKind:'container',targetId:space,principalKind:'member',principalId:person.id,level:'full'});
    const pages=[];
    for(const title of ['Support handover','Release handover']) {
      const id=(await ok(colleague,origin,'POST','/api/pages',{operationKey:key(),containerId:space,title})).value.pageId;
      await ok(colleague,origin,'POST','/api/sharing',{operationKey:key(),targetKind:'page',targetId:id,principalKind:'member',principalId:'browser-owner',level:'full'});
      pages.push({id,title});
    }
    assert.equal((await call(context,origin,'GET',`/api/pages/${personal}`)).status,404);
    const beforeActivity=(await api(`/api/activity?actorId=${person.id}&limit=100`)).items;
    assert.ok(beforeActivity.some(item=>item.action==='page.create'&&item.actor.displayName==='Casey Chen'));
    await page.goto(origin+'/app/settings?section=members',{waitUntil:'networkidle'});
    const row=page.locator('.settings-list li').filter({has:page.getByText('Casey Chen',{exact:true})});
    await row.getByRole('button',{name:'Remove',exact:true}).click();
    const dialog=page.getByRole('dialog',{name:'Remove Casey Chen?',exact:true});
    await accessible(page,'member removal confirmation');
    await dialog.getByRole('button',{name:'Remove member',exact:true}).click();
    await expect(dialog).toBeHidden();
    await expect(row).toHaveCount(0);
    await accessible(page,'removed member absent from settings');
    for(const actor of [colleague,second]) {
      assert.equal((await call(actor,origin,'GET','/api/session')).status,401);
      assert.equal((await call(actor,origin,'GET',`/api/pages/${pages[0].id}`)).status,401);
    }
    const unused=await second.request.get(links[1],{maxRedirects:0});
    assert.equal(unused.status(),400,'The unused invitation cannot restore removed membership.');
    for(const [kind,id] of [['containers',space],...pages.map(item=>['pages',item.id])]) {
      const grants=await api(`/api/sharing/${kind}/${id}`);
      assert.ok(grants.items.filter(grant=>grant.principalId===person.id).every(grant=>grant.revokedAt),'Removed personal grants are inactive.');
    }
    assert.equal((await call(context,origin,'GET',`/api/pages/${personal}`)).status,404);
    assert.ok(!(await api('/api/containers?archived=true')).items.some(item=>item.id===privateSpace.id),'Archived personal content is never exposed to the owner.');
    for(const {id} of pages)assert.equal((await api(`/api/pages/${id}`)).properties.ownerMemberId,null);
    const retained=(await api(`/api/activity?actorId=${person.id}&limit=100`)).items;
    for(const item of beforeActivity) {
      assert.equal(retained.find(entry=>entry.id===item.id)?.actor?.displayName,'Casey Chen','Removal keeps existing activity attribution.');
    }
    await page.goto(`${origin}/app/settings?section=containers&container=${space}`,{waitUntil:'networkidle'});
    await page.getByRole('navigation',{name:'Space navigation',exact:true}).getByRole('button',{name:'Bulk',exact:true}).click();
    for(const {title} of pages)await page.getByRole('checkbox',{name:title,exact:true}).check();
    await page.getByRole('button',{name:'Change owner',exact:true}).click();
    const bulk=page.getByRole('dialog',{name:'owner 2 selected pages',exact:true});
    await bulk.getByRole('combobox',{name:'New owner',exact:true}).selectOption('browser-owner');
    await accessible(page,'bulk reassignment of removed member pages');
    await bulk.getByRole('button',{name:'Apply to selected pages',exact:true}).click();
    await expect(bulk).toBeHidden();
    await expect(page.getByRole('list',{name:'Bulk results',exact:true})).toContainText('Saved');
    for(const {id} of pages)assert.equal((await api(`/api/pages/${id}`)).properties.ownerMemberId,'browser-owner');
    await accessible(page,'removed member pages reassigned in bulk');
    // Only an explicit new invitation can re-admit Casey. It preserves the old
    // archived personal space while creating a separate current personal space.
    const before=await inbox(origin);
    await ok(context,origin,'POST','/api/invitations',{operationKey:key(),email,kind:'member'});
    const fresh=new URL(await newOutboxLink(origin,before));
    assert.equal((await colleague.request.post(origin+'/api/auth/invitation/accept',{headers:{origin},form:{token:fresh.searchParams.get('token')},maxRedirects:0})).status(),303);
    assert.equal((await ok(colleague,origin,'GET','/api/members/current')).id,person.id);
    const archived=(await ok(colleague,origin,'GET','/api/containers?archived=true')).items.find(item=>item.id===privateSpace.id);
    assert.ok(archived?.archivedAt,'Removal archives the personal space rather than deleting it.');
    const preserved=await ok(colleague,origin,'GET',`/api/pages/${personal}`);
    assert.equal(preserved.page.lifecycle,'archived');
    assert.equal(preserved.blocks[0].content.text[0].text,'Private departure notes remain private.');
    assert.equal((await call(context,origin,'GET',`/api/pages/${personal}`)).status,404);
    assert.equal((await second.request.get(links[1],{maxRedirects:0})).status(),400,'A fresh invitation never reactivates the old unused capture.');
    await ok(context,origin,'POST','/api/members/remove',{operationKey:key(),memberId:person.id});
    assert.equal((await call(colleague,origin,'GET','/api/session')).status,401);
    const refused=await call(context,origin,'POST','/api/members/remove',{operationKey:key(),memberId:'browser-owner'});
    assert.equal(refused.status,409,'The last owner cannot remove themselves.');
    assert.equal((await api('/api/members/current')).role,'owner');
  } finally {await colleague.close();await second.close();}
}
