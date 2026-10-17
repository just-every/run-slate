import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';
import { accessible } from './browser-support.mjs';
import { ok } from './two-people-support.mjs';

/** Run after setupWorkspace in a fresh two-person workspace, at 1440 and 390. */
export async function hubJourney(state, people) {
  const {alice,bob}=people, origin=state.origin;
  const space=(await ok(alice.context,origin,'POST','/api/containers',{operationKey:randomUUID(),name:'Company knowledge',description:'The team’s shared starting point.',visibility:'closed'})).value;
  await alice.page.goto(`${origin}/app/containers/${space.id}`,{waitUntil:'networkidle'});
  await expect(alice.page.getByRole('navigation',{name:'Space navigation'}).getByRole('button',{name:'Home',exact:true})).toHaveAttribute('aria-pressed','true');
  const homeTitle=alice.page.getByRole('textbox',{name:'Page title',exact:true});
  await expect(homeTitle).toHaveValue('Company knowledge home');
  await homeTitle.fill('Our company home');
  await homeTitle.press('Tab');
  await expect.poll(async()=>(await ok(alice.context,origin,'GET',`/api/pages/${space.homePageId}`)).page.title).toBe('Our company home');
  await alice.page.reload({waitUntil:'networkidle'});
  await expect(homeTitle).toHaveValue('Our company home');
  await accessible(alice.page,'editable space home');
  await people.shot('alice','editable space home');

  const create=async title=>(await ok(alice.context,origin,'POST','/api/pages',{operationKey:randomUUID(),containerId:space.id,title})).value.pageId;
  const guide=await create('Getting started'),keyPage=await create('Company handbook'),secret=await create('Private budget');
  await alice.page.getByRole('button',{name:'Change home page',exact:true}).click();
  const homeDialog=alice.page.getByRole('dialog',{name:'Space home page',exact:true});
  await homeDialog.getByLabel('Home page',{exact:true}).selectOption(guide);
  await accessible(alice.page,'choose existing space home');
  await homeDialog.getByRole('button',{name:'Save home page',exact:true}).click();
  await expect(homeDialog).toBeHidden();
  await expect(homeTitle).toHaveValue('Getting started');
  await people.shot('alice','chosen existing space home');
  const post=(await ok(alice.context,origin,'POST',`/api/blog/containers/${space.id}/posts`,{operationKey:randomUUID(),title:'Welcome to our new teammates',body:'The company handbook is ready for everyone joining this week.'})).value.pageId;
  const vocabulary=await ok(alice.context,origin,'GET','/api/status');
  if (!vocabulary.items.some(entry=>entry.key==='verified'&&entry.requiresVerification)) await ok(alice.context,origin,'POST','/api/status',{operationKey:randomUUID(),key:'verified',label:'Verified',color:'#228855',requiresVerification:true});
  const keyDocument=await ok(alice.context,origin,'GET',`/api/pages/${keyPage}`);
  await ok(alice.context,origin,'POST',`/api/pages/${keyPage}/open`,{operationKey:randomUUID(),revisionId:keyDocument.workingRevisionId});
  await ok(alice.context,origin,'POST',`/api/status/page/${keyPage}`,{operationKey:randomUUID(),expectedRevisionId:keyDocument.page.revisionId,statusKey:'verified',attestRevisionId:keyDocument.workingRevisionId});
  for (const pageId of [guide,keyPage,post]) await ok(alice.context,origin,'POST','/api/sharing',{operationKey:randomUUID(),targetKind:'page',targetId:pageId,principalKind:'member',principalId:bob.id,level:'view'});
  assert.deepEqual((await ok(bob.context,origin,'GET','/api/navigation')).recents,[],'The new member has not opened a page.');

  await alice.page.goto(`${origin}/app`,{waitUntil:'networkidle'});
  await alice.page.getByRole('button',{name:'Edit company hub',exact:true}).click();
  const dialog=alice.page.getByRole('dialog',{name:'Edit company hub'});
  await dialog.getByLabel('Hub title',{exact:true}).fill('Glad you’re here');
  await dialog.getByLabel('Welcome message',{exact:true}).fill('Your home for company updates and the knowledge you need to get started.');
  const choose=async(section,title)=>{
    await dialog.getByRole('group',{name:`Choose ${section}`,exact:true}).getByRole('checkbox',{name:new RegExp(`^${title}\\b`)}).click();
    const label=section[0].toUpperCase()+section.slice(1);
    await expect(dialog.getByRole('group',{name:label,exact:true}).getByRole('listitem').getByText(title,{exact:true})).toBeVisible();
  };
  await choose('quick links','Getting started');
  await choose('quick links','Private budget');
  await choose('announcements','Welcome to our new teammates');
  await choose('key pages','Company handbook');
  await accessible(alice.page,'company hub curation');
  await dialog.getByRole('button',{name:'Save company hub',exact:true}).click();
  await expect(dialog).toBeHidden();
  const ownerHub=alice.page.getByRole('region',{name:'Company hub',exact:true});
  await expect(ownerHub.getByRole('link',{name:/Private budget/})).toBeVisible();
  await people.shot('alice','curated company hub');

  await bob.page.goto(`${origin}/app`,{waitUntil:'networkidle'});
  const readerHub=bob.page.getByRole('region',{name:'Company hub',exact:true});
  await expect(readerHub.getByRole('heading',{name:'Glad you’re here',exact:true})).toBeVisible();
  await expect(readerHub.getByRole('link',{name:/Getting started/})).toBeVisible();
  await expect(readerHub.getByRole('link',{name:/Company handbook/})).toBeVisible();
  await expect(readerHub.getByText('✓ Verified',{exact:true})).toBeVisible();
  await expect(readerHub.getByRole('link',{name:'Welcome to our new teammates',exact:true})).toBeVisible();
  await expect(readerHub.getByText('Private budget',{exact:false})).toHaveCount(0);
  await expect(readerHub.locator(`a[href="/app/pages/${secret}"]`)).toHaveCount(0);
  await expect(readerHub.getByRole('button',{name:'Edit company hub'})).toHaveCount(0);
  const readerData=await ok(bob.context,origin,'GET','/api/hub');
  assert.ok(!JSON.stringify(readerData).includes(secret),'Unreadable IDs and titles never enter the hub response.');
  await accessible(bob.page,'new member first Home with hub');
  await people.shot('bob','new member first Home');
  assert.ok(await bob.page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),'Home fits the viewport.');
  await readerHub.getByRole('link',{name:/Company handbook/}).click();
  await expect(bob.page.getByRole('textbox',{name:'Page title',exact:true})).toHaveValue('Company handbook');
}
