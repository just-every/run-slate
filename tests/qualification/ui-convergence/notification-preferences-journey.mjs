import assert from 'node:assert/strict';
import {expect} from '@playwright/test';
import {accessible} from './browser-evidence.mjs';
/** Folded into existing Settings journeys; assertions run at 1440, with the same screen captured at 390. */
export async function notificationPreferencesJourney(state,width){
 const {page,origin}=state;
 await page.goto(origin+'/app/settings/preferences',{waitUntil:'networkidle'});
 const panel=page.getByRole('region',{name:'Notification preferences'});
 await expect(panel.getByRole('heading',{name:'Email notifications'})).toBeVisible();
 const delivery=panel.getByRole('combobox',{name:'mention delivery',exact:true});
 if(width===1440){
  await expect(delivery).toHaveValue('default');
  for(const mode of ['immediate','daily','weekly','in-app','default']){
   await delivery.selectOption(mode);await expect(panel.getByRole('status')).toHaveText('Notification preferences saved.');
   await page.reload({waitUntil:'networkidle'});await expect(delivery).toHaveValue(mode);
   const stored=await state.api('/api/notifications/preferences');assert.equal(stored.items.find(item=>item.event==='mention').mode,mode);
  }
  const names=panel.getByRole('checkbox',{name:'Section names in notifications'});
  await expect(names).not.toBeChecked();await names.check();await expect(panel.getByRole('status')).toHaveText('Notification preferences saved.');
  await page.reload({waitUntil:'networkidle'});await expect(names).toBeChecked();
  assert.equal((await state.api('/api/notifications/preferences')).sectionNames,true);
  await names.uncheck();await expect(panel.getByRole('status')).toHaveText('Notification preferences saved.');
 }
 await accessible(page,`notification preferences ${width}`,{fullPage:true});
 const controls=await panel.locator('select,input').evaluateAll(elements=>elements.map(element=>({size:parseFloat(getComputedStyle(element).fontSize),name:element.getAttribute('aria-label')??element.closest('label')?.textContent})));
 assert.ok(controls.every(control=>control.size>=13&&control.name),'Notification controls have readable text and labels.');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Settings fit the viewport.');
}
