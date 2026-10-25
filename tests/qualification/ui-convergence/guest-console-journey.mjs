import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';
import { inbox, newOutboxLink } from '../../e2e/outbox-auth.mjs';
import { ok } from './two-people-support.mjs';

/** ADMIN-003: real invitations, three signed-in guests, owner policy and bulk revocation. */
export async function guestConsoleJourney(state) {
  const {page,context,origin,api}=state,width=page.viewportSize().width;
  const space=(await api('/api/containers')).items.find(item=>item.name==='Handbook');
  const {value:{pageId}}=await ok(context,origin,'POST','/api/pages',{operationKey:randomUUID(),containerId:space.id,title:'Partner onboarding guide',blocks:Array.from({length:32},(_,i)=>({id:randomUUID(),blockType:'paragraph',treePosition:String(i).padStart(4,'0'),content:{text:[{text:`Step ${i+1}: agree on the delivery owner, review the partner access list and record the handover in this guide.`}]}}))});
  await page.goto(`${origin}/app/settings?section=members`,{waitUntil:'networkidle'});
  const console=page.getByRole('region',{name:'Guest management'});
  await console.getByRole('button',{name:'Guest settings',exact:true}).click();
  const settings=page.getByRole('dialog',{name:'Guest settings',exact:true});
  await settings.getByLabel('Default guest expiry (days)').fill('14');
  await settings.getByLabel('Allowed email domains').fill('test.invalid, blocked.invalid');
  await settings.getByLabel('Denied email domains').fill('blocked.invalid');
  await page.screenshot({path:`.artifacts/ui-convergence/guest-console-${width}-settings.png`,fullPage:false});
  await settings.getByRole('button',{name:'Save guest settings',exact:true}).click();
  await expect(settings).toHaveCount(0);
  const guests=[];
  try {
    for(const name of ['avery-partner','blair-partner','casey-partner']){
      const before=await inbox(origin);
      await console.getByRole('button',{name:'Invite a guest',exact:true}).click();
      const invite=page.getByRole('dialog',{name:'Invite a guest',exact:true});
      await invite.getByLabel('Guest email').fill(`${name}@test.invalid`);
      await invite.getByLabel('Page to share').selectOption(pageId);
      if(name==='avery-partner')await page.screenshot({path:`.artifacts/ui-convergence/guest-console-${width}-invite.png`,fullPage:false});
      await invite.getByRole('button',{name:'Send invitation',exact:true}).click();
      await expect(invite).toHaveCount(0);
      const link=await newOutboxLink(origin,before);
      const guestContext=await context.browser().newContext({viewport:page.viewportSize()});
      guests.push(guestContext);
      const guestPage=await guestContext.newPage();
      await guestPage.goto(link,{waitUntil:'domcontentloaded'});
      await guestPage.getByRole('button',{name:'Accept invitation',exact:true}).click();
      await guestPage.goto(`${origin}/app/pages/${pageId}`,{waitUntil:'networkidle'});
      await expect(guestPage.getByRole('textbox',{name:'Page title',exact:true})).toHaveValue('Partner onboarding guide');
    }
    await page.reload({waitUntil:'networkidle'});
    await console.getByRole('button',{name:'Set expiry for casey-partner',exact:true}).click();
    const expiry=page.getByRole('dialog',{name:'Guest expiry for casey-partner'});
    const future=new Date(Date.now()+2*86400000);
    const local=new Date(future.getTime()-future.getTimezoneOffset()*60000).toISOString().slice(0,16);
    await expiry.getByLabel('Expiry (your local time)').fill(local);
    await page.screenshot({path:`.artifacts/ui-convergence/guest-console-${width}-expiry.png`,fullPage:false});
    await expiry.getByRole('button',{name:'Save guest expiry',exact:true}).click();
    await expect(expiry).toHaveCount(0);
    assert.ok((await api('/api/guests')).items.some(guest=>guest.email==='casey-partner@test.invalid'&&guest.expiresAt===new Date(local).toISOString()));

    for(const name of ['avery-partner','blair-partner','casey-partner'])await expect(console).toContainText(`${name}@test.invalid`);
    await expect(console).toContainText('Alex Owner');
    await expect(console.getByRole('link',{name:'Partner onboarding guide',exact:true})).toHaveCount(3);
    for(const guest of (await api('/api/guests')).items){assert.ok(guest.lastActiveAt);assert.ok(guest.expiresAt);await expect(console).toContainText(new Date(guest.expiresAt).toLocaleString('en-US'));}
    await page.screenshot({path:`.artifacts/ui-convergence/guest-console-${width}-three.png`,fullPage:true});
    await console.getByRole('checkbox',{name:'avery-partner',exact:true}).check();
    await console.getByRole('checkbox',{name:'blair-partner',exact:true}).check();
    await console.getByRole('button',{name:'Revoke selected guests',exact:true}).click();
    await page.screenshot({path:`.artifacts/ui-convergence/guest-console-${width}-revoke.png`,fullPage:false});
    await page.getByRole('dialog',{name:'Revoke selected guests?'}).getByRole('button',{name:'Revoke guests',exact:true}).click();
    await expect(console.getByRole('checkbox')).toHaveCount(1);
    await page.screenshot({path:`.artifacts/ui-convergence/guest-console-${width}-revoked.png`,fullPage:true});
    for(const guest of guests.slice(0,2))assert.equal((await guest.request.get(`${origin}/api/pages/${pageId}`)).status(),401,'Revocation ends the guest’s open native session.');
    assert.equal((await guests[2].request.get(`${origin}/api/pages/${pageId}`)).status(),200);
    await console.getByRole('button',{name:'Invite a guest',exact:true}).click();
    const denied=page.getByRole('dialog',{name:'Invite a guest',exact:true});
    await denied.getByLabel('Guest email').fill('new-partner@blocked.invalid');
    await denied.getByLabel('Page to share').selectOption(pageId);
    const refusal=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/invitations'&&response.request().method()==='POST'&&response.status()===403);
    await denied.getByRole('button',{name:'Send invitation',exact:true}).click();
    assert.equal((await (await refusal).json()).code,'GUEST_DOMAIN_DENIED');
    await expect(denied.getByRole('alert')).toBeVisible();
    await expect(denied.getByLabel('Guest email')).toHaveValue('new-partner@blocked.invalid');
    await page.screenshot({path:`.artifacts/ui-convergence/guest-console-${width}-denied.png`,fullPage:true});
    await denied.getByRole('button',{name:'Cancel',exact:true}).click();
    await page.goto(`${origin}/app/pages/${pageId}`,{waitUntil:'networkidle'});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollHeight>innerHeight*1.5),'Sidebar proof uses a genuinely long page.');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Long page fits the viewport.');
    await page.screenshot({path:`.artifacts/ui-convergence/sidebar-long-${width}.png`,fullPage:true});
    if(width===390){await page.getByRole('button',{name:'Open navigation',exact:true}).click();await expect(page.locator('.sidebar')).toBeVisible();await page.screenshot({path:`.artifacts/ui-convergence/sidebar-long-${width}-menu.png`,fullPage:false});}
  } finally {for(const guest of guests)await guest.close();}
}
