import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {chromium,expect} from '@playwright/test';
import {createRuntime} from '../local/runtime.mjs';
import {fixtureFirstOwner} from '../local/first-owner.mjs';
import {actorFixture} from '../interface/actors.mjs';
const evidence=process.env.QUAL_EVIDENCE;
if(!evidence)throw Error('QUAL_EVIDENCE required');
let runtime,browser,page;const checks=[];
const check=name=>checks.push({name,passed:true});
try {
 runtime=await createRuntime({root:process.cwd(),evidence,appPort:8742,inspectorPort:8743});
 browser=await chromium.launch({headless:true});
 const context=await browser.newContext();({page}=await fixtureFirstOwner(runtime,context));
 const {items}=await(await context.request.get(runtime.origin+'/api/pages')).json();const id=items[0].id,path=runtime.origin+'/api/pages/'+id;
 const read=async()=>await(await context.request.get(path)).json();
 await page.goto(runtime.origin+'/app/pages/'+id);
 const empty=page.locator('[data-slate-editable]').first();await empty.fill('Committed original');await page.getByRole('status').filter({hasText:/^Saved /}).first().waitFor();
 const paragraph=page.getByRole('textbox',{name:'Paragraph',exact:true}).first();await paragraph.waitFor();
 // Native appearance mutation starts a real same-page background read. Hold only its transport.
 await page.getByRole('button',{name:'Add icon',exact:true}).click();await page.getByLabel('Icon',{exact:true}).fill('🧭');
 let release,started;const gate=new Promise(resolve=>release=resolve),arrived=new Promise(resolve=>started=resolve);
 await page.route(path,async route=>{if(route.request().method()!=='GET')return route.continue();started();await gate;await route.continue().catch(()=>{});});
 await page.getByRole('button',{name:'Save appearance',exact:true}).click();await arrived;
 await paragraph.evaluate(node=>{window.retainedEditor=node;});
 await context.setOffline(true);await paragraph.click();await page.keyboard.press('Meta+A');await page.keyboard.type('Exact keyboard draft — café 42');release();
 await page.getByRole('alert').filter({hasText:'Current server state is unconfirmed'}).waitFor();
 await page.getByRole('status').filter({hasText:/Offline —/}).waitFor();
 assert.equal(await paragraph.evaluate(node=>window.retainedEditor===node),true);
 assert.equal(await paragraph.textContent(),'Exact keyboard draft — café 42');
 const journal=await page.evaluate(()=>Object.entries(sessionStorage).find(([k])=>k.startsWith('slate:draft:'))?.[1]);assert.ok(journal.includes('Exact keyboard draft — café 42'));
 await page.screenshot({path:runtime.directory+'/retained-offline.png',fullPage:true});
 check('Native appearance read fails offline without replacing the keyboard editor node, draft, or journal; Offline and unconfirmed read notice visible');
 await page.unroute(path);await context.setOffline(false);
 await page.getByRole('button',{name:'Retry page refresh',exact:true}).click();
 await expect(page.getByRole('button',{name:'Retry page refresh',exact:true})).toHaveCount(0);
 assert.equal(await paragraph.textContent(),'Exact keyboard draft — café 42');assert.ok(!JSON.stringify((await read()).blocks).includes('Exact keyboard draft'));
 await page.waitForTimeout(3500);assert.ok(!JSON.stringify((await read()).blocks).includes('Exact keyboard draft'));
 check('Explicit read retry and reconnect preserve unsaved block without replaying its write');
 await page.reload();await page.getByText(/An unsaved edit was recovered in this tab/).waitFor();assert.equal(await paragraph.textContent(),'Exact keyboard draft — café 42');
 await page.getByRole('button',{name:'Try saving again',exact:true}).click();await page.getByRole('status').filter({hasText:/^Saved /}).waitFor();assert.ok(JSON.stringify((await read()).blocks).includes('Exact keyboard draft — café 42'));
 check('Exact tab recovery remains unsaved until explicit operation-key save retry commits');
 // One authoritative event read: an older real response must not undo the newer response.
 const saveIcon=async icon=>{const doc=await read();const response=await context.request.patch(path,{data:{operationKey:crypto.randomUUID(),expectedRevisionId:doc.page.revisionId,properties:{icon}}});assert.equal(response.status(),200);};
 await saveIcon('①');
 let held=false,releaseOld,oldReady;const oldGate=new Promise(resolve=>releaseOld=resolve),oldArrived=new Promise(resolve=>oldReady=resolve);
 await page.route(path,async route=>{if(route.request().method()!=='GET'||held)return route.continue();held=true;const response=await route.fetch();oldReady();await oldGate;await route.fulfill({response}).catch(()=>{});});
 const announce=()=>page.evaluate(pageId=>window.dispatchEvent(new CustomEvent('slate:page-mutated',{detail:{pageId}})),id);
 try {await announce();await oldArrived;await saveIcon('②');await announce();await page.locator('.page-appearance > .stored-page-icon').filter({hasText:'②'}).waitFor();releaseOld();await page.waitForTimeout(100);assert.equal(await page.locator('.page-appearance > .stored-page-icon').textContent(),'②');}
 finally {releaseOld();await page.unroute(path);}
 check('One authoritative page-mutated read: a held older real Worker response cannot undo a newer successful read');
 // Actual ACL changes, with a labelled second identity fixture; application APIs own grants.
 const ownerGrant=await context.request.post(runtime.origin+'/api/sharing',{data:{operationKey:crypto.randomUUID(),targetKind:'page',targetId:id,principalKind:'member',principalId:'qualification-owner',level:'full'}});assert.equal(ownerGrant.status(),200,await ownerGrant.text());
 const beforeRestrict=await read();const restricted=await context.request.put(runtime.origin+'/api/sharing/pages/'+id+'/inheritance',{data:{operationKey:crypto.randomUUID(),expectedRevisionId:beforeRestrict.page.revisionId,restricted:true}});assert.equal(restricted.status(),200,await restricted.text());
 const initialGrants=await(await context.request.get(runtime.origin+'/api/sharing/pages/'+id)).json();
 for(const general of initialGrants.items.filter(g=>['workspace','container'].includes(g.principalKind)&&!g.revokedAt)){const revokedGeneral=await context.request.post(runtime.origin+'/api/sharing',{data:{operationKey:crypto.randomUUID(),targetKind:'page',targetId:id,id:general.id,principalKind:general.principalKind,principalId:general.principalId,level:general.level,revoke:true}});assert.equal(revokedGeneral.status(),200,await revokedGeneral.text());}
 const actor=await actorFixture({runtime,browser,id:'offline-reader'});
 const grant=async(level,revoke=false)=>{const grants=await(await context.request.get(runtime.origin+'/api/sharing/pages/'+id)).json();const existing=grants.items.find(g=>g.principalId===actor.id);const result=await context.request.post(runtime.origin+'/api/sharing',{data:{operationKey:crypto.randomUUID(),targetKind:'page',targetId:id,id:existing?.id,principalKind:'member',principalId:actor.id,level,revoke}});assert.equal(result.status(),200,await result.text());return result.json();};
 await grant('full');await actor.page.goto(runtime.origin+'/app/pages/'+id);await actor.page.getByRole('textbox',{name:'Paragraph',exact:true}).waitFor();
 await grant('view');await expect(actor.page.getByRole('textbox',{name:'Page title',exact:true})).toHaveAttribute('readonly','');await expect(actor.page.locator('[contenteditable=true]')).toHaveCount(0);await actor.page.getByText('This page is read-only with your current access.',{exact:false}).waitFor();
 check('Real grant narrowing propagates through collaboration and removes editing controls');
 await grant('full');await actor.page.getByRole('textbox',{name:'Paragraph',exact:true}).waitFor();
 const grants=await(await context.request.get(runtime.origin+'/api/sharing/pages/'+id)).json();const ownGrant=grants.items.find(g=>g.principalId===actor.id);assert.ok(ownGrant);
 const revoked=await context.request.post(runtime.origin+'/api/sharing',{data:{operationKey:crypto.randomUUID(),targetKind:'page',targetId:id,id:ownGrant.id,principalKind:'member',principalId:actor.id,level:'full',revoke:true}});assert.equal(revoked.status(),200,await revoked.text());
 const deniedRead=await actor.context.request.get(path);assert.ok([401,403,404].includes(deniedRead.status()),'Actual revoked read: '+deniedRead.status()+' '+await deniedRead.text());
 await actor.page.getByRole('heading',{name:'Content unavailable',exact:true}).waitFor().catch(async error=>{await writeFile(runtime.directory+'/actor-failure.html',await actor.page.content());throw error;});await expect(actor.page.getByRole('textbox',{name:'Page title',exact:true})).toHaveCount(0);assert.ok(!(await actor.page.locator('body').textContent()).includes('Exact keyboard draft'));
 check('Real grant revocation removes private content and actions through collaboration denial');
 await actor.context.close();
 await context.clearCookies();await page.getByText('Your session has ended.',{exact:false}).waitFor();await expect(paragraph).toHaveCount(0);
 check('Actual session loss removes the private editor');
 await writeFile(runtime.directory+'/native.json',JSON.stringify({checks,artifact:runtime.artifact,limits:'Local emitted Worker, native UI/network and real ACL APIs. Identity fixtures substitute mailbox possession; no provider/release acceptance.'},null,2));console.log(runtime.directory);
} catch(error) {if(runtime){await writeFile(runtime.directory+'/failure.json',JSON.stringify({checks,error:error.stack},null,2));await page?.screenshot({path:runtime.directory+'/failure.png',fullPage:true}).catch(()=>{});}throw error;}
finally {await browser?.close();await runtime?.close();}
