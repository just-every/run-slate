import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {build} from 'vite';
import {chromium} from '@playwright/test';
const evidence=process.env.QUAL_EVIDENCE;if(!evidence)throw Error('QUAL_EVIDENCE required');await mkdir(evidence,{recursive:true});
await build({configFile:false,define:{'process.env.NODE_ENV':'"production"'},build:{outDir:path.join(evidence,'hook-artifact'),emptyOutDir:true,lib:{entry:path.resolve('tests/qualification/offline-refresh/hook-probe.tsx'),formats:['iife'],name:'HookProbe',fileName:()=> 'probe.js'},minify:false}});
let browser;const checks=[];
try {
 browser=await chromium.launch({headless:true});const page=await browser.newPage();page.on('pageerror',error=>console.error(error));
 await page.setContent('<div id="root"></div>');await page.addScriptTag({content:await readFile(path.join(evidence,'hook-artifact/probe.js'),'utf8')});
 const ready=()=>page.waitForFunction(()=>window.probe?.resource?.data?.path==='/api/A');await ready();
 const reload=mode=>page.evaluate(async mode=>{window.mode=mode;return window.probe.resource.reload();},mode);
 assert.equal(await reload('transport'),false);await page.waitForFunction(()=>!window.probe.resource.data&&window.probe.resource.error);checks.push('Default consumer clears .data on transport failure, including consumers outside RequestState');
 await reload('ok');await ready();await page.evaluate(()=>window.probe.setRetain(true));await page.waitForTimeout(25);
 assert.equal(await reload('transport'),false);await page.waitForFunction(()=>window.probe.resource.data?.path==='/api/A'&&window.probe.resource.error);checks.push('Explicit transport opt-in retains same-path data but reload returns false');
 for(const mode of ['denial','server','malformed','programmer']){await reload('ok');await ready();assert.equal(await reload(mode),false);await page.waitForFunction(()=>!window.probe.resource.data&&window.probe.resource.error);checks.push(mode+' clears retained data');}
 await reload('ok');await ready();await page.evaluate(()=>{window.mode='delayed';window.probe.old=window.probe.resource.reload();});await page.waitForFunction(()=>window.releases.length===1);
 await page.evaluate(()=>{window.mode='denial';window.probe.newer=window.probe.resource.reload();});await page.waitForFunction(()=>!!window.probe.resource.error);
 await page.evaluate(()=>window.releases.shift()(new Response(JSON.stringify({path:'/api/A'}))));await page.waitForTimeout(25);assert.equal(await page.evaluate(()=>!!window.probe.resource.data),false);checks.push('Superseded old successful read cannot undo newer denial');
 await reload('ok');await ready();await page.evaluate(()=>{window.mode='delayed';window.probe.setPath('/api/B');});await page.waitForFunction(()=>window.releases.length===1);assert.equal(await page.evaluate(()=>!!window.probe.resource.data),false);
 await page.evaluate(()=>window.probe.setPath(null));await page.waitForFunction(()=>!window.probe.resource.loading);assert.equal(await page.evaluate(()=>!!window.probe.resource.data),false);
 await page.evaluate(()=>window.releases.shift()(new Response(JSON.stringify({path:'/api/B'}))));await page.waitForTimeout(25);assert.equal(await page.evaluate(()=>!!window.probe.resource.data),false);checks.push('Route A to B to null hides old data immediately and rejects stale response');
 await page.evaluate(()=>{window.mode='ok';window.probe.setPath('/api/A');});await ready();await page.evaluate(()=>{window.mode='delayed';window.probe.setIdentity('member-B:workspace-B');});await page.waitForFunction(()=>window.releases.length===1);assert.equal(await page.evaluate(()=>!!window.probe.resource.data),false);checks.push('Identity keyed remount never exposes previous identity data');
 await page.evaluate(()=>{window.probe.savedReload=window.probe.resource.reload;window.probe.setMounted(false);});await page.getByText('Unmounted').waitFor();assert.equal(await page.evaluate(()=>window.probe.savedReload()),false);await page.evaluate(()=>window.releases.shift()(new Response(JSON.stringify({path:'/api/A'}))));assert.equal(await page.locator('output').count(),0);checks.push('Unmount cancels pending delivery and later reload returns false');
 await writeFile(path.join(evidence,'hook.json'),JSON.stringify({checks,limits:'Production hook in actual Chromium; labelled synthetic fetch failures and responses only in test harness.'},null,2));
}finally{await browser?.close();}
