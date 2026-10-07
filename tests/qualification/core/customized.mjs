import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from '@playwright/test';
import {command} from '../local/process.mjs';
import {identity} from '../local/identity.mjs';
import {createRuntime} from '../local/runtime.mjs';
import {fixtureFirstOwner} from '../local/first-owner.mjs';
import {api,op} from './support.mjs';
const root=path.resolve(process.env.QUAL_ROOT??process.cwd()),evidence=path.resolve(process.env.QUAL_EVIDENCE);
await mkdir(evidence,{recursive:true});const directory=await mkdtemp(path.join(evidence,'customized-')),clone=path.join(directory,'repository'),before=await identity(root);
let r,browser;
try{
 await command('git',['clone','--no-hardlinks','--no-local',root,clone],{log:path.join(directory,'clone.log')});
 await command('git',['checkout','--detach',before.commit],{cwd:clone});
 const license=await readFile(path.join(root,'LICENSE'),'utf8');assert.equal(await readFile(path.join(clone,'LICENSE'),'utf8'),license);assert.ok(license.trim().length>0);
 const config=path.join(clone,'src/ext/config.ts'),source=await readFile(config,'utf8');assert.ok(source.includes('name: "Slate"'));await writeFile(config,source.replace('name: "Slate"','name: "Qualification owner knowledge"').replace('showFooterCredit: true','showFooterCredit: false'));
 await command('pnpm',['install','--frozen-lockfile'],{cwd:clone,log:path.join(directory,'install.log')});
 await command('pnpm',['build'],{cwd:clone,log:path.join(directory,'build.log')});
 r=await createRuntime({root:clone,evidence:directory,appPort:Number(process.env.QUAL_APP_PORT),inspectorPort:Number(process.env.QUAL_INSPECTOR_PORT)});
 browser=await chromium.launch({headless:true});const context=await browser.newContext(),page=await context.newPage();
 await page.goto(r.origin);await page.getByRole('heading',{name:'Qualification owner knowledge',exact:true}).waitFor();assert.equal(await page.getByText('Powered by Slate',{exact:false}).count(),0);await page.screenshot({path:path.join(directory,'owner-landing.png')});
 const first=await fixtureFirstOwner(r,context),cookie=(await context.cookies()).map(c=>c.name+'='+c.value).join('; ');
 const container=(await api(r,'/api/containers',cookie)).data.items.find(c=>c.visibility!=='personal');assert.ok(container);
 const created=await api(r,'/api/pages',cookie,{operationKey:op(),containerId:container.id,title:'Owner copy durable page'});assert.equal(created.status,200);const id=created.data.value.pageId;
 await r.restart();assert.equal((await api(r,'/api/pages/'+id,cookie)).data.page.title,'Owner copy durable page');await first.page.goto(r.origin+'/app');await first.page.getByTestId('workspace-name').waitFor();
 const after=await identity(clone);const changed=Object.keys(before.inputs).filter(p=>before.inputs[p]!==after.inputs[p]);assert.deepEqual(changed,['src/ext/config.ts']);assert.deepEqual((await identity(root)).inputs,before.inputs);
 await writeFile(path.join(directory,'customized.json'),JSON.stringify({clauses:['FLAG-002'],id:'independent-owner-copy-config-build-browser-restart-license-custody',date:new Date().toISOString(),commit:before.commit,artifact:after.artifactHash,passed:true,changedInputs:changed,licensePreserved:true,sourceUnchanged:true,limits:'Local source configuration customization, creation and restart only. Deep schema/provider divergence, update adoption, full restore and distribution remain separate evidence.'},null,2));console.log(directory);
}catch(error){await writeFile(path.join(directory,'failure.txt'),error.stack);throw error;}finally{await browser?.close();await r?.close();}
