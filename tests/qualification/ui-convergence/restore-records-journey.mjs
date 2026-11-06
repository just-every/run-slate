import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {expect} from '@playwright/test';
import {ok} from './two-people-support.mjs';

const key=()=>randomUUID();
const pagePath=id=>`/app/pages/${id}`;
const templateSnapshot=({id,title,description,category,revisionId,snapshot})=>({id,title,description,category,revisionId,snapshot});

/** Ordinary native database, versioned record and captured template in the exported subtree. */
export async function prepareRestoreRecords(state,fixture) {
  const {context,origin}=state;
  const database=(await ok(context,origin,'POST','/api/databases',{operationKey:key(),containerId:fixture.containerId,parentPageId:fixture.parent.id,title:'Transfer inventory'})).value;
  const field={id:key(),name:'Retained quantity',type:'number',config:{},position:0};
  await ok(context,origin,'POST',`/api/databases/${database.id}/fields`,{operationKey:key(),expectedRevisionId:database.revisionId,field});
  const created=(await ok(context,origin,'POST',`/api/databases/${database.id}/records`,{operationKey:key(),title:'Transfer inventory item',values:{[field.id]:7}})).value;
  const recordPath=`/api/databases/${database.id}/records/${created.pageId}`;
  const earlier=await ok(context,origin,'GET',recordPath);
  await ok(context,origin,'PATCH',recordPath,{operationKey:key(),expectedRevisionId:earlier.revisionId,values:{[field.id]:11}});
  const template=(await ok(context,origin,'POST','/api/templates',{operationKey:key(),sourcePageId:fixture.parent.id,includeChildren:false,containerId:null,title:'Transfer guide template',description:'Retained recovery instructions',category:'Transfer'})).value;
  const templatePath=`/app/templates/${template.id}`;
  const recordAddress=`/app/databases/${database.id}/records/${created.pageId}`;
  const databaseAddress=`/app/databases/${database.id}`;
  const blockId=key();
  const current=await ok(context,origin,'GET',`/api/pages/${fixture.groupChild.id}`);
  await ok(context,origin,'PUT',`/api/pages/${fixture.groupChild.id}/blocks`,{operationKey:key(),expectedRevisionId:current.page.revisionId,blocks:[...current.blocks.map(({id,parentBlockId,blockType,content,treePosition})=>({id,parentBlockId,blockType,content,treePosition})),{id:blockId,blockType:'paragraph',treePosition:'b',content:{text:[
    {text:'Open retained inventory',link:{href:databaseAddress}},{text:' · '},
    {text:'Open retained item',link:{href:recordAddress}},{text:' · '},
    {text:'Open retained template',link:{href:templatePath}},
  ]}}]});
  const records={database,field,recordId:created.pageId,recordPath,recordAddress,databaseAddress,templateId:template.id,templatePath,blockId,earlierRevision:earlier.revisionId};
  const original=fixture.originals[2];
  const sourceAsset=await context.request.get(origin+`/api/templates/${template.id}/assets/${original.id}`);
  assert.equal(sourceAsset.status(),200);assert.deepEqual(await sourceAsset.body(),original.bytes);
  return {...records,source:await recordSnapshot(context,origin,records)};
}

async function recordSnapshot(context,origin,fixture) {
  const history=await ok(context,origin,'GET',`/api/revisions/${fixture.recordId}`);
  const template=await ok(context,origin,'GET',`/api/templates/${fixture.templateId}`);
  return {
    database:await ok(context,origin,'GET',`/api/databases/${fixture.database.id}`),
    record:await ok(context,origin,'GET',fixture.recordPath),
    revisions:await Promise.all(history.items.map(item=>ok(context,origin,'GET',`/api/revisions/${fixture.recordId}/${item.id}`))),
    template:templateSnapshot(template),
  };
}

/** Read the actual stored projections, then follow each original link and reload its native screen. */
export async function proveRestoreRecords(state,fixture,evidence) {
  const {context,origin,page}=state,records=fixture.records;
  const destination=await recordSnapshot(context,origin,records);
  assert.deepEqual(destination,records.source,'Database fields and views, record values and history, and captured template retain every public projected field.');
  const original=fixture.originals[2];
  const restoredAsset=await context.request.get(origin+`/api/templates/${records.templateId}/assets/${original.id}`);
  assert.equal(restoredAsset.status(),200,'A captured template still serves its retained original after native restore.');
  assert.deepEqual(await restoredAsset.body(),original.bytes);
  assert.equal(destination.record.values[records.field.id],11);
  const earlier=destination.revisions.find(item=>item.id===records.earlierRevision);
  assert.ok(earlier);assert.equal(earlier.properties.databaseFields[records.field.id],7);
  for(const [label,address,check]of [
    ['Open retained inventory',records.databaseAddress,async linked=>{
      await expect(linked.getByRole('textbox',{name:'Page title',exact:true})).toHaveValue('Transfer inventory');
      await expect(linked.locator('.database-list')).toContainText('Transfer inventory item');
    }],
    ['Open retained item',records.recordAddress,async linked=>{
      await expect(linked.getByRole('textbox',{name:'Page title',exact:true})).toHaveValue('Transfer inventory item');
      const quantity=linked.locator('.record-field').filter({has:linked.locator('dt').getByText(records.field.name,{exact:true})});
      await expect(quantity.locator('dd')).toContainText('11');
    }],
    ['Open retained template',records.templatePath,async linked=>{
      await expect(linked.locator('.template-preview h2')).toHaveText('Transfer guide template');
      await expect(linked.locator('.template-preview')).toContainText('Confirm the transfer owner');
    }],
  ]) {
    await page.goto(origin+pagePath(fixture.groupChild.id),{waitUntil:'networkidle'});
    const link=page.locator(`[data-block-id="${records.blockId}"]`).getByRole('link',{name:label,exact:true});
    await expect(link).toHaveAttribute('href',address);
    const opened=page.waitForEvent('popup');await link.click({modifiers:['ControlOrMeta']});const linked=await opened;
    try {
      await expect(linked).toHaveURL(origin+address);await check(linked);
      await linked.reload({waitUntil:'networkidle'});await check(linked);
      await linked.screenshot({path:path.join(evidence,`${page.viewportSize().width}-restored-${label.split(' ').at(-1)}.png`),fullPage:true});
    } finally {await linked.close();}
  }
  assert.deepEqual(await recordSnapshot(context,origin,records),destination,'Following retained typed-record links changes no record, field, template or history.');
  console.log('PROBE PORT-002 typed records: retained database, versioned record and template addresses -> exact native source projections; original links open each record and survive reload');
  return {source:records.source,destination};
}
