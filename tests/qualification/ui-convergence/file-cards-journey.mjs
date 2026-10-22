import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {expect} from '@playwright/test';
import {folderFixture} from '../../helpers/folder-edge.mjs';
import {root} from '../../e2e/runtime-harness.mjs';
import {accessible} from './browser-evidence.mjs';
import {ok} from './two-people-support.mjs';
/** Existing insert dialog, real Worker and member authority; provider fixtures only. */
export async function fileCardsJourney(state){
 const {page,context,origin,api,setFileCardFixture,switchIdentity}=state,width=page.viewportSize().width;
 const evidence=path.join(root,'evidence/file-cards');await mkdir(evidence,{recursive:true});
 const shot=async name=>{await accessible(page,'file cards '+name);await page.screenshot({path:path.join(evidence,`files-${width}-${name}.png`),fullPage:true});};
 const space=(await api('/api/containers')).items.find(item=>item.name==='Handbook');
 await ok(context,origin,'POST','/api/sharing',{operationKey:randomUUID(),targetKind:'container',targetId:space.id,principalKind:'member',principalId:'browser-reader',level:'view'});
 const {value:{pageId}}=await ok(context,origin,'POST','/api/pages',{operationKey:randomUUID(),containerId:space.id,title:'Recovery records by reference'});
 const connections=[],titles=[];
 for(const provider of ['google-drive','sharepoint']){
  const fixture=folderFixture(provider);
  await ok(context,origin,'PUT','/api/imports/provider-folders/policy',{operationKey:randomUUID(),provider,enabled:true});
  const connection=(await ok(context,origin,'POST','/api/imports/provider-folders/connections',{operationKey:randomUUID(),provider,token:fixture.token,...(provider==='sharepoint'?{driveId:fixture.driveId}:{})})).value;
  connections.push(connection);
  await page.goto(`${origin}/app/pages/${pageId}`,{waitUntil:'networkidle'});
  await page.getByRole('button',{name:'Add block',exact:true}).click();
  await page.getByRole('option',{name:'Connected file',exact:true}).click();
  const picker=page.getByRole('dialog',{name:'Insert connected file',exact:true});
  await picker.getByLabel('Connected account',{exact:true}).selectOption(connection.id);
  await picker.getByRole('button',{name:'Browse files',exact:true}).click();
  const source=fixture.documents[0];titles.push(source.name);
  await expect(picker.getByRole('radio',{name:source.name,exact:true})).toBeVisible();
  await picker.getByRole('radio',{name:source.name,exact:true}).check();await shot(provider+'-picker');
  await picker.getByRole('button',{name:'Insert reference',exact:true}).click();
  const card=page.getByRole('region',{name:`${provider==='google-drive'?'Google Drive':'SharePoint / OneDrive'} file card`,exact:true});
  await expect(card.getByRole('link',{name:source.name,exact:true})).toBeVisible();
  await expect(card).toContainText('Alex Owner');await expect(card.locator('time')).toHaveAttribute('datetime','2026-10-20T09:30:00.000Z');await expect(card).toContainText(source.mimeType);await expect(card).toContainText('You can open this file.');
  await shot(provider+'-readable');
  const renamed='Recovery notes revised '+(provider==='google-drive'?'Drive':'SharePoint');
  await setFileCardFixture({renamed:{[source.id]:renamed}});
  await card.getByRole('button',{name:'Refresh file',exact:true}).click();
  await expect(card.getByRole('link',{name:renamed,exact:true})).toBeVisible();await expect(card).not.toContainText(source.name);await shot(provider+'-renamed');
 }
 const stored=await api(`/api/pages/${pageId}`),references=stored.blocks.filter(block=>block.blockType==='file-card');
 assert.equal(references.length,2);
 for(const block of references)assert.deepEqual(Object.keys(block.content).sort(),['fileId','provider','url']);
 for(const provider of ['google-drive','sharepoint'])assert.ok(!JSON.stringify(stored).includes(folderFixture(provider).token));
 await switchIdentity('reader');await page.goto(`${origin}/app/pages/${pageId}`,{waitUntil:'networkidle'});
 for(const card of await page.getByRole('region',{name:/file card$/}).all()){
  await expect(card.getByRole('link',{name:'Request access',exact:true})).toBeVisible();await expect(card.getByRole('link',{name:'Connect your account',exact:true})).toBeVisible();await expect(card).not.toContainText('Alex Owner');
 }
 await shot('no-connection');
 for(const provider of ['google-drive','sharepoint']){
  const fixture=folderFixture(provider);await ok(context,origin,'POST','/api/imports/provider-folders/connections',{operationKey:randomUUID(),provider,token:fixture.readerToken,...(provider==='sharepoint'?{driveId:fixture.driveId}:{})});
 }
 await page.reload({waitUntil:'networkidle'});
 for(const card of await page.getByRole('region',{name:/file card$/}).all()){
  await expect(card.getByRole('link',{name:'Request access',exact:true})).toBeVisible();await expect(card.getByRole('link',{name:'Connect your account',exact:true})).toHaveCount(0);await expect(card.locator('time')).toHaveCount(0);await expect(card).not.toContainText('Alex Owner');await expect(card).not.toContainText('Recovery notes revised');
 }
 await shot('reader-denied');
 await switchIdentity('owner');await setFileCardFixture({deleted:[folderFixture('google-drive').documents[0].id,folderFixture('sharepoint').documents[0].id]});
 await page.reload({waitUntil:'networkidle'});await expect(page.getByText('File unavailable.',{exact:true})).toHaveCount(2);await expect(page.getByRole('region',{name:/file card$/}).first()).not.toContainText('Recovery notes revised');await shot('deleted');
 await setFileCardFixture({deleted:[],failed:[folderFixture('google-drive').documents[0].id,folderFixture('sharepoint').documents[0].id]});
 await page.reload({waitUntil:'networkidle'});await expect(page.getByText('File access could not be checked.',{exact:true})).toHaveCount(2);await expect(page.getByRole('region',{name:/file card$/}).first().locator('time')).toHaveCount(0);await shot('provider-failed');
 await setFileCardFixture({failed:[]});
 for(const connection of connections)await ok(context,origin,'DELETE',`/api/imports/provider-folders/connections/${connection.id}`,{operationKey:randomUUID(),expectedRevisionId:connection.revisionId});
 await page.reload({waitUntil:'networkidle'});await expect(page.getByRole('link',{name:'Request access',exact:true})).toHaveCount(2);await expect(page.getByRole('link',{name:'Connect your account',exact:true})).toHaveCount(2);await shot('disconnected');
 assert.deepEqual((await api(`/api/pages/${pageId}`)).blocks.filter(block=>block.blockType==='file-card').map(block=>block.content),references.map(block=>block.content));
 await page.getByRole('button',{name:'Add block',exact:true}).click();await page.getByRole('option',{name:'Connected file',exact:true}).click();await expect(page.getByRole('dialog',{name:'Insert connected file'}).getByRole('link',{name:'Connect your account',exact:true})).toBeVisible();await shot('empty-picker');await page.getByRole('dialog',{name:'Insert connected file'}).getByRole('button',{name:'Cancel',exact:true}).click();
}
