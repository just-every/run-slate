import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from '@playwright/test';
import { reachable } from './touch-controls.mjs';

test('touch reachability waits for layout but still refuses an obscured control', async () => {
  const browser = await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});
  try {
    const context = await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
    const page = await context.newPage();
    await page.setContent(`<meta name="viewport" content="width=device-width,initial-scale=1">
      <style>dialog {width:300px;height:300px;overflow:auto} button {min-height:44px} #cover {position:fixed;inset:0;z-index:2}</style>
      <dialog><button autofocus>Close</button><div style="height:600px"></div><button>Review publication</button><div id="cover"></div></dialog>`);
    await page.evaluate(() => {
      const dialog = document.querySelector('dialog');
      dialog.showModal();
      // A scroll-driven layout update, rather than an elapsed-time sleep.
      dialog.addEventListener('scroll', () => {
        let frames = 8;
        const settle = () => {
          if (--frames) requestAnimationFrame(settle);
          else document.querySelector('#cover')?.remove();
        };
        requestAnimationFrame(settle);
      }, {once:true});
    });
    const button = page.getByRole('button',{name:'Review publication'});
    await reachable(button);
    await page.evaluate(() => {
      const cover = document.createElement('div');
      cover.id = 'cover';
      document.querySelector('dialog').append(cover);
    });
    await assert.rejects(reachable(button), /A touch control is wholly inside the visual viewport and unobscured/);
  } finally {
    await browser.close();
  }
});
