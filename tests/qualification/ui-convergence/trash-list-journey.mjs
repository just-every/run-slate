import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {expect} from '@playwright/test';
import {ok} from './two-people-support.mjs';
import {tap,type,checkpoint} from './touch-controls.mjs';

/** Populated native trash controls, independent provenance and exact result membership. */
export async function trashListJourney(state,touch,f) {
  const {page,context,origin,containerId}=touch;
  const baseline=(await touch.api('/api/archive')).items.filter(item=>item.trashedAt).sort((a,b)=>a.id.localeCompare(b.id));
  const sibling=(await ok(context,origin,'POST','/api/pages',{operationKey:randomUUID(),containerId,title:'Other response memo'})).value;
  await ok(context,origin,'POST',`/api/archive/${sibling.pageId}`,{operationKey:randomUUID(),expectedRevisionId:sibling.revisionId,action:'trash'});
  const otherSpace=(await ok(state.context,origin,'POST','/api/containers',{operationKey:randomUUID(),name:'Other trash space',visibility:'private'})).value;
  const other=(await ok(state.context,origin,'POST','/api/pages',{operationKey:randomUUID(),containerId:otherSpace.id,title:'Other deleted memo'})).value;
  await ok(state.context,origin,'POST','/api/sharing',{operationKey:randomUUID(),targetKind:'container',targetId:otherSpace.id,principalKind:'member',principalId:'browser-reader',level:'view'});
  await ok(state.context,origin,'POST','/api/sharing',{operationKey:randomUUID(),targetKind:'page',targetId:other.pageId,principalKind:'member',principalId:'browser-reader',level:'view'});
  await ok(state.context,origin,'POST',`/api/archive/${other.pageId}`,{operationKey:randomUUID(),expectedRevisionId:other.revisionId,action:'trash'});
  await page.goto(`${origin}/app/pages/${f.root.pageId}`,{waitUntil:'networkidle'});
  await tap(page.getByRole('button',{name:'More',exact:true}));
  await tap(page.getByRole('menuitem',{name:'Move to trash',exact:true}));
  const dialog=page.getByRole('dialog',{name:'Move this page to trash?',exact:true});
  await type(page,dialog.getByRole('textbox',{name:'Reason',exact:true}),'Retain until an explicit restore.');
  const response=page.waitForResponse(response=>response.request().method()==='POST'&&new URL(response.url()).pathname===`/api/archive/${f.root.pageId}`);
  await tap(dialog.getByRole('button',{name:'Confirm',exact:true}));
  const deleted=await response;
  assert.equal(deleted.status(),200);
  const {receipt}=await deleted.json();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(origin+'/app/archive#trash');
  await expect(page.getByRole('button',{name:'Trash',exact:true})).toHaveAttribute('aria-pressed','true');
  const rows=(await touch.api('/api/archive')).items.filter(item=>f.ids.includes(item.id));
  assert.deepEqual(rows.map(item=>item.id).sort(),[...f.ids].sort());
  for(const item of rows) {
    const prior=f.originalInventory.find(row=>row.id===item.id);
    assert.equal(item.actorMemberId,'browser-reader');assert.equal(item.actorDisplayName,'Morgan Reader');
    assert.equal(item.trashedAt,receipt.committedAt);assert.equal(item.occurredAt,receipt.committedAt);
    assert.equal(item.priorContainerId,containerId);assert.equal(item.priorContainerName,touch.containerName);
    assert.equal(item.priorParentId,prior.parentPageId);assert.equal(item.priorPosition,prior.treePosition);
    assert.equal(item.priorParentTitle,item.id===f.root.pageId?'Retention parent':item.id===f.record.pageId?'Retained database':'Retained archive tree');
    assert.equal(item.priorOrder,f.originalInventory.filter(row=>row.parentPageId===prior.parentPageId).findIndex(row=>row.id===item.id)+1);
  }
  assert.deepEqual(await f.inventory(),f.originalInventory.filter(item=>!f.ids.includes(item.id)));
  await page.goto(origin+'/app/archive',{waitUntil:'networkidle'});
  await tap(page.getByRole('button',{name:'Trash',exact:true}));
  const list=page.locator('.archive-list');
  const membership=async expected=>expect.poll(async()=>list.locator(':scope > li').evaluateAll(rows=>rows.map(row=>row.dataset.pageId).sort())).toEqual([...expected].sort());
  const all=[...baseline.map(item=>item.id),...f.ids,sibling.pageId,other.pageId];
  await membership(all);
  const rootRow=list.locator(`li[data-page-id="${f.root.pageId}"]`);
  for(const item of rows) {
    const row=list.locator(`li[data-page-id="${item.id}"]`);
    await expect(row).toContainText('Deleted by Morgan Reader');
    await expect(row.locator('time')).toHaveAttribute('datetime',receipt.committedAt);
    await expect(row).toContainText(`Prior place: ${touch.containerName} → ${item.priorParentTitle}`);
    await expect(row).toContainText(`Restore position: ${item.priorOrder}`);
  }
  await checkpoint(page,'trash provenance and prior place');
  await page.reload({waitUntil:'networkidle'});
  await tap(page.getByRole('button',{name:'Trash',exact:true}));
  await membership(all);
  await page.getByLabel('Prior space',{exact:true}).selectOption(containerId);await membership([...f.ids,sibling.pageId]);
  const search=page.getByRole('searchbox',{name:'Search trash',exact:true});
  await type(page,search,'Retained');await membership(f.ids);
  await type(page,search,'Retention parent');await membership([f.root.pageId]);
  await type(page,search,'synthetic-slate-no-match');await membership([]);
  await expect(page.getByText('No trash matches these filters.',{exact:true})).toBeVisible();
  await tap(page.getByRole('button',{name:'Clear filters',exact:true}));await membership(all);
  await page.getByLabel('Prior space',{exact:true}).selectOption(otherSpace.id);await membership([other.pageId]);
  await page.getByLabel('Deleted by',{exact:true}).selectOption('browser-owner');await membership([other.pageId]);
  await page.getByLabel('Deleted by',{exact:true}).selectOption('browser-reader');await membership([]);
  await page.getByLabel('Deleted by',{exact:true}).selectOption('');await membership([other.pageId]);
  await page.getByLabel('Prior space',{exact:true}).selectOption(containerId);await membership([...f.ids,sibling.pageId]);
  await type(page,search,'Retained');await membership(f.ids);
  const day=receipt.committedAt.slice(0,10),nextDay=new Date(Date.parse(day+'T00:00:00.000Z')+86400000).toISOString().slice(0,10);
  await page.getByLabel('Deleted after',{exact:true}).fill(day);
  await page.getByLabel('Deleted before',{exact:true}).fill(day);await membership(f.ids);
  await page.getByLabel('Deleted after',{exact:true}).fill(nextDay);await membership([]);
  await page.getByLabel('Deleted after',{exact:true}).fill('');
  await page.getByLabel('Deleted before',{exact:true}).fill(new Date(Date.parse(day+'T00:00:00.000Z')-86400000).toISOString().slice(0,10));await membership([]);
  await tap(page.getByRole('button',{name:'Clear filters',exact:true}));await membership(all);
  await page.getByLabel('Prior space',{exact:true}).selectOption(containerId);
  await type(page,search,'Retained');
  const aged='2001-02-03T04:05:06.000Z';
  await state.fixtureSql(f.ids.flatMap(id=>[
    `UPDATE pages SET trashed_at='${aged}' WHERE id='${id}'`,
    `UPDATE content_archive_locations SET occurred_at='${aged}' WHERE page_id='${id}'`,
  ]));
  await state.runScheduled();await state.runScheduled();
  const agedRows=(await touch.api('/api/archive')).items.filter(item=>f.ids.includes(item.id));
  assert.deepEqual(agedRows.map(item=>item.id).sort(),[...f.ids].sort());
  for(const item of agedRows){assert.equal(item.trashedAt,aged);assert.equal(item.occurredAt,aged);}
  await page.reload({waitUntil:'networkidle'});await tap(page.getByRole('button',{name:'Trash',exact:true}));
  await page.getByLabel('Prior space',{exact:true}).selectOption(containerId);
  await type(page,search,'Retained');await membership(f.ids);
  await expect(rootRow.locator('time')).toHaveAttribute('datetime',aged);
  await checkpoint(page,'aged trash after repeated scheduled processing');
  const restored=page.waitForResponse(response=>response.request().method()==='POST'&&new URL(response.url()).pathname===`/api/archive/${f.root.pageId}`);
  await tap(rootRow.getByRole('button',{name:'Restore',exact:true}));
  assert.equal((await restored).status(),200);await membership([]);
  assert.deepEqual(await f.inventory(),f.originalInventory,'All descendants return between the same sibling pages in the same order.');
  assert.deepEqual(await f.snapshot(),f.before,'Native trash and restore preserve populated descendants.');
  await page.goto(`${origin}/app/pages/${f.root.pageId}`,{waitUntil:'networkidle'});
  await expect(page.getByText('Current retained body',{exact:true})).toBeVisible();
  await checkpoint(page,'trash subtree restored to prior parent');
  const baselineIds=new Set(baseline.map(item=>item.id));
  const retained=(await touch.api('/api/archive')).items.filter(item=>baselineIds.has(item.id)).sort((a,b)=>a.id.localeCompare(b.id));
  assert.deepEqual(retained,baseline,'Every earlier scenario trash row and its provenance remains unchanged.');
  console.log(`PROBE ARCH-005 native browser ${page.viewportSize().width}: exact who, receipt time, prior container, parent and order; title and location search, actor and space filters, inclusive dates and combined membership; actual aged trash survives two schedules; native restore retains populated subtree and sibling order`);
}
