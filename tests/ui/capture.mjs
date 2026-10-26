/** Real-browser component evidence. This server never enters the Worker build. */
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import { checkInteractions } from './interactions.mjs';
import { retainedStoryIds } from './story-inventory.mjs';
const evidence = process.env.SLATE_UI_EVIDENCE_DIR;
if (!evidence) throw new Error('SLATE_UI_EVIDENCE_DIR must name the evidence output directory');
const base='http://127.0.0.1:4198';
const server=spawn('pnpm',['exec','vite','--config','tests/ui/vite.config.ts'],{stdio:['ignore','pipe','pipe'],detached:true});
let output=''; server.stdout.on('data',chunk=>output+=chunk);server.stderr.on('data',chunk=>output+=chunk);
let browser;
const results=[];
try {
 for(let i=0;;i++){ try {if((await fetch(base)).ok) break;}catch{} if(i===100)throw new Error(output);await delay(100);}
 browser=await chromium.launch();
 await mkdir(path.join(evidence,'screenshots'),{recursive:true});
 const interactions=await checkInteractions(browser,base);
 await writeFile(path.join(evidence,'interactions.json'),JSON.stringify(interactions,null,2)+'\n');
 const index=await browser.newPage();await index.goto(base);await index.locator('li a').first().waitFor();
 const stories=await index.locator('li a').evaluateAll(links=>links.map(a=>({id:new URL(a.href).searchParams.get('story'),title:a.textContent})));
 assert.deepEqual(stories.map(story => story.id).sort(), [...retainedStoryIds].sort(), 'the exact retained component story inventory must render');
 assert.equal(new Set(stories.map(s=>s.id)).size,stories.length,'story IDs must be unique');
 await index.close();
 const requested=process.env.SLATE_UI_STORIES?.split(',').filter(Boolean);
 const selected=requested ? stories.filter(story=>requested.includes(story.id)) : stories;
 if(requested)assert.equal(selected.length,new Set(requested).size,'every requested story must exist');
 const jobs=selected.flatMap(story=>[{name:'1440',width:1440,theme:'light'},{name:'390',width:390,theme:'light'},{name:'1440-dark',width:1440,theme:'dark'}].map(variant=>({story,variant})));
 const run = async ({story,variant}) => {
  const context=await browser.newContext({viewport:{width:variant.width,height:1000},colorScheme:variant.theme});const page=await context.newPage();const errors=[];
  page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(`${base}/?story=${story.id}&theme=${variant.theme}`,{waitUntil:'networkidle'});
  await page.screenshot({path:path.join(evidence,'screenshots',`${story.id}@${variant.name}.png`),fullPage:true,animations:'disabled'});
  const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
  results.push({story:story.id,variant:variant.name,errors,overflow,violations:axe.violations});
  await context.close();
 };
 await Promise.all(Array.from({length:4},async()=>{while(jobs.length){await run(jobs.shift());}}));
 results.sort((a,b)=>a.story.localeCompare(b.story)||a.variant.localeCompare(b.variant));
 await writeFile(path.join(evidence,'stories.md'),'# Component stories\n\nSample props under tests/ui; these exercise components, not product contracts.\n\n'+selected.map(s=>`- ${s.id}: ${s.title}`).join('\n')+'\n');
 await writeFile(path.join(evidence,'results.json'),JSON.stringify(results,null,2)+'\n');
 await writeFile(path.join(evidence,'axe.md'),'# Browser and accessibility results\n\n'+results.map(r=>`- ${r.story}@${r.variant}: ${r.violations.length} axe violations, ${r.errors.length} console/page errors, horizontal overflow ${r.overflow}`).join('\n')+'\n');
 const failed=results.filter(r=>r.errors.length||r.violations.length||r.overflow);
 console.log(JSON.stringify({captures:results.length,failed:failed.map(r=>({story:r.story,variant:r.variant,errors:r.errors,overflow:r.overflow,violations:r.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))}))},null,2));
 if(failed.length)process.exitCode=1;
} finally {
 await browser?.close();
 const exited=once(server,'exit');try {process.kill(-server.pid,'SIGTERM');}catch{}await exited;
}
