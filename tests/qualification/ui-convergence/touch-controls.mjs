import assert from 'node:assert/strict';
import {expect} from '@playwright/test';
import {accessible} from './browser-evidence.mjs';

/** Touch actions use the visual viewport, including its keyboard-dependent bounds. */
export async function reachable(locator) {
  await locator.scrollIntoViewIfNeeded();
  await expect(locator).toBeVisible();
  assert.ok(await locator.evaluate(element => {
    const r=element.getBoundingClientRect(),v=window.visualViewport;
    const left=v?.offsetLeft??0,top=v?.offsetTop??0;
    const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
    return r.width>0&&r.height>0&&r.left>=left&&r.top>=top
      &&r.right<=left+(v?.width??innerWidth)&&r.bottom<=top+(v?.height??innerHeight)
      &&(hit===element||element.contains(hit));
  }), 'A touch control is wholly inside the visual viewport and unobscured.');
}
export async function tap(locator) {await reachable(locator);await locator.tap();}
export async function type(page,locator,text) {
  await tap(locator);await page.keyboard.press('ControlOrMeta+A');await page.keyboard.type(text);
}
export async function checkpoint(page,label) {
  await accessible(page,`touch ${label}`,{fullPage:false});
}
export async function touchReorder(page,handle,target) {
  await reachable(handle);await reachable(target);
  const from=await handle.boundingBox(),to=await target.boundingBox();
  const cdp=await page.context().newCDPSession(page);
  try {
    const x=from.x+from.width/2,y=from.y+from.height/2,end=to.y+to.height/2;
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
    for(let step=1;step<=8;step++) await cdp.send('Input.dispatchTouchEvent',{
      type:'touchMove',touchPoints:[{x,y:y+(end-y)*step/8}],
    });
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  } finally {await cdp.detach();}
}
