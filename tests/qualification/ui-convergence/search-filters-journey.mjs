import assert from 'node:assert/strict';
import {expect} from '@playwright/test';
import {ok} from './two-people-support.mjs';
import {accessible} from './browser-evidence.mjs';

/** Filter real retained content without replacing the query or the network. */
export async function searchFiltersJourney(state) {
 const {page,context,origin,api,switchIdentity}=state;
 const mutate=(method,path,data)=>ok(context,origin,method,path,{operationKey:crypto.randomUUID(),...data});
 const space=(await mutate('POST','/api/containers',{name:'Release operations',visibility:'default'})).value.id;
 const create=async(title,text,containerId=space)=> (await mutate('POST','/api/pages',{containerId,title,blocks:[{id:crypto.randomUUID(),blockType:'paragraph',treePosition:'a',content:{text:[{text}]}}]})).value.pageId;
 const guide=await create('Release handover checklist','The amber handover checklist records the release owner.');
 await switchIdentity('reader');
 let support;try {support=await create('Support rotation','The blue checklist for handover tracks customer updates.');}finally{await switchIdentity('owner');}
 const archived=await create('Archived checklist','The retired handover checklist documents the old incident procedure.');
 const trashed=await create('Removed checklist','The obsolete handover checklist describes the abandoned escalation.');
 await mutate('POST','/api/status',{key:'search-ready',label:'Ready for release',color:'#145a3d',requiresVerification:false});
 await mutate('POST','/api/status/page/'+guide,{expectedRevisionId:(await api('/api/pages/'+guide)).page.revisionId,statusKey:'search-ready'});
 for(const [id,action]of [[archived,'archive'],[trashed,'trash']])await mutate('POST','/api/archive/'+id,{expectedRevisionId:(await api('/api/pages/'+id)).page.revisionId,action});
 const other=(await api('/api/containers')).items.find(item=>item.id!==space&&item.visibility==='default');assert.ok(other);
 await create('Outside space checklist','The handover checklist for another space.',other.id);
 const query='handover checklist';
 await page.goto(origin+'/app/containers/'+space,{waitUntil:'networkidle'});
 await expect(page.getByRole('heading',{name:'Release operations',exact:true})).toBeVisible();
 await page.getByRole('link',{name:'Search this space',exact:true}).click();
 await expect(page).toHaveURL(url=>url.pathname==='/app/search'&&url.searchParams.get('containerId')===space);
 await page.getByRole('searchbox',{name:'Search your workspace',exact:true}).fill(query);
 await page.getByRole('button',{name:'Search',exact:true}).click();
 await expect(page.locator('.search-filter-summary')).toContainText('Space: Release operations');
 const input=page.getByRole('searchbox',{name:'Search your workspace',exact:true});
 const clear=page.getByRole('button',{name:'Clear search',exact:true});
 await clear.focus();await expect.poll(()=>clear.evaluate(element=>getComputedStyle(element,'::after').opacity)).toBe('1');
 await input.focus();await clear.hover();await expect.poll(()=>clear.evaluate(element=>getComputedStyle(element,'::after').opacity)).toBe('1');
 await page.screenshot({path:'.artifacts/ui-convergence/evidence/search-clear-tooltip-'+page.viewportSize().width+'.png',fullPage:true});
 // Result order is irrelevant to filtering; compare independently sorted titles.
 const titles=async expected=>{
  await expect.poll(async()=>(await page.locator('.search-results h2').allTextContents()).sort()).toEqual([...expected].sort());
  await expect(input).toHaveValue(query);
  await expect(page.getByText(/^Filters:/)).toBeVisible();
 };
 await titles(['Release handover checklist','Support rotation']);
 await page.locator('.search-options > summary').click();
 const kind=page.getByRole('combobox',{name:'Look in',exact:true});
 await kind.selectOption('record');await titles([]);await kind.selectOption('page');await titles(['Release handover checklist','Support rotation']);
 await page.getByText('Refine your search',{exact:true}).click();
 const source=page.getByRole('combobox',{name:'Space',exact:true});await expect(source).toHaveValue(space);
 await source.selectOption(other.id);await titles(['Outside space checklist']);await source.selectOption(space);await titles(['Release handover checklist','Support rotation']);
 const contributor=page.getByRole('combobox',{name:'Contributor',exact:true});
 await contributor.selectOption('browser-reader');await titles(['Support rotation']);await expect(page.locator('.search-filter-summary')).toContainText('Morgan Reader');await contributor.selectOption('');
 const status=page.getByRole('combobox',{name:'Status',exact:true});
 await status.selectOption('search-ready');await titles(['Release handover checklist']);await expect(page.locator('.search-filter-summary')).toContainText('Ready for release');await status.selectOption('');
 const from=page.getByLabel('Updated from',{exact:true}),until=page.getByLabel('Updated until',{exact:true});
 await from.fill('2099-01-01');await titles([]);await from.fill('2000-01-01');await titles(['Release handover checklist','Support rotation']);
 await until.fill('2000-01-01');await titles([]);await until.fill('2099-01-01');await titles(['Release handover checklist','Support rotation']);
 await page.getByRole('checkbox',{name:'Include archive',exact:true}).check();await titles(['Archived checklist','Release handover checklist','Support rotation']);
 await page.getByRole('checkbox',{name:'Include trash',exact:true}).check();await titles(['Archived checklist','Removed checklist','Release handover checklist','Support rotation']);
 for(const visible of ['Release operations','Updated from 2000-01-01','Updated until 2099-01-01','Including archive','Including trash'])await expect(page.locator('.search-filter-summary')).toContainText(visible);
 await accessible(page,'search filters and retained results');
 // The controls display every filter in force alongside real results, and reload retains them.
 await page.reload({waitUntil:'networkidle'});await titles(['Archived checklist','Removed checklist','Release handover checklist','Support rotation']);
 await page.locator('.search-options > summary').click();await page.getByText('Refine your search',{exact:true}).click();
 await expect(source).toHaveValue(space);await expect(kind).toHaveValue('page');await expect(from).toHaveValue('2000-01-01');await expect(until).toHaveValue('2099-01-01');
 await expect(page.getByRole('checkbox',{name:'Include archive',exact:true})).toBeChecked();await expect(page.getByRole('checkbox',{name:'Include trash',exact:true})).toBeChecked();
 await expect(contributor).toHaveValue('');await expect(status).toHaveValue('');
 // Retain non-default contributor and status together with the entire scoped filter set.
 await contributor.selectOption('browser-owner');await titles(['Archived checklist','Removed checklist','Release handover checklist']);
 await status.selectOption('search-ready');await titles(['Release handover checklist']);
 await page.reload({waitUntil:'networkidle'});await titles(['Release handover checklist']);
 await page.locator('.search-options > summary').click();await page.getByText('Refine your search',{exact:true}).click();
 for(const [control,value]of [[source,space],[kind,'page'],[contributor,'browser-owner'],[status,'search-ready'],[from,'2000-01-01'],[until,'2099-01-01']])await expect(control).toHaveValue(value);
 for(const name of ['Include archive','Include trash'])await expect(page.getByRole('checkbox',{name,exact:true})).toBeChecked();
 for(const visible of ['Pages','Space: Release operations','Contributor: Alex Owner','Status: Ready for release','Updated from 2000-01-01','Updated until 2099-01-01','Including archive','Including trash'])await expect(page.locator('.search-filter-summary')).toContainText(visible);
 await accessible(page,'scoped search retains every active filter after reload');
 await page.screenshot({path:'.artifacts/ui-convergence/evidence/search-scoped-filters-'+page.viewportSize().width+'.png',fullPage:true});
 await status.selectOption('');await contributor.selectOption('');await titles(['Archived checklist','Removed checklist','Release handover checklist','Support rotation']);
 await input.fill('"handover checklist"');await page.getByRole('button',{name:'Search',exact:true}).click();
 await expect.poll(async()=>(await page.locator('.search-results h2').allTextContents()).sort()).toEqual(['Archived checklist','Release handover checklist','Removed checklist']);
 await expect(page.locator('.search-results a').filter({hasText:'Support rotation'})).toHaveCount(0);
 await accessible(page,'quoted phrase excludes reordered words');
}
