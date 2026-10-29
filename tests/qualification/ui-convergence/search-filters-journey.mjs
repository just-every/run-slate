import assert from 'node:assert/strict';
import {expect} from '@playwright/test';
import {ok} from './two-people-support.mjs';
import {accessible} from './browser-evidence.mjs';

/** Filter real retained content without replacing the query or the network. */
export async function searchFiltersJourney(state) {
 const {page,context,origin,api,switchIdentity}=state;
 const mutate=(method,path,data)=>ok(context,origin,method,path,{operationKey:crypto.randomUUID(),...data});
 const space=(await mutate('POST','/api/containers',{name:'Release operations',visibility:'default'})).value.id;
 const create=async(title,text)=> (await mutate('POST','/api/pages',{containerId:space,title,blocks:[{id:crypto.randomUUID(),blockType:'paragraph',treePosition:'a',content:{text:[{text}]}}]})).value.pageId;
 const guide=await create('Release handover checklist','The amber handover checklist records the release owner.');
 await switchIdentity('reader');
 let support;try {support=await create('Support rotation','The blue checklist for handover tracks customer updates.');}finally{await switchIdentity('owner');}
 const archived=await create('Archived checklist','The retired handover checklist documents the old incident procedure.');
 const trashed=await create('Removed checklist','The obsolete handover checklist describes the abandoned escalation.');
 await mutate('POST','/api/status',{key:'search-ready',label:'Ready for release',color:'#145a3d',requiresVerification:false});
 await mutate('POST','/api/status/page/'+guide,{expectedRevisionId:(await api('/api/pages/'+guide)).page.revisionId,statusKey:'search-ready'});
 for(const [id,action]of [[archived,'archive'],[trashed,'trash']])await mutate('POST','/api/archive/'+id,{expectedRevisionId:(await api('/api/pages/'+id)).page.revisionId,action});
 const query='handover checklist';
 await page.goto(origin+'/app/search?'+new URLSearchParams({q:query,containerId:space}),{waitUntil:'networkidle'});
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
 const other=(await api('/api/containers')).items.find(item=>item.id!==space&&item.visibility==='default');assert.ok(other);
 await source.selectOption(other.id);await titles([]);await source.selectOption(space);await titles(['Release handover checklist','Support rotation']);
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
 await input.fill('"handover checklist"');await page.getByRole('button',{name:'Search',exact:true}).click();
 await expect.poll(async()=>(await page.locator('.search-results h2').allTextContents()).sort()).toEqual(['Archived checklist','Release handover checklist','Removed checklist']);
 await expect(page.locator('.search-results a').filter({hasText:'Support rotation'})).toHaveCount(0);
 await accessible(page,'quoted phrase excludes reordered words');
 await searchNoResultsJourney(state,space);
}

/** Empty search describes the actual controls and creates only the requested page. */
export async function searchNoResultsJourney({page,origin,api,modelRequests},space) {
 const query='Unwritten release briefing';
 const input=page.getByRole('searchbox',{name:'Search your workspace',exact:true});
 await input.fill(query);await page.getByRole('button',{name:'Search',exact:true}).click();
 const kind=page.getByRole('combobox',{name:'Look in',exact:true});
 const source=page.getByRole('combobox',{name:'Space',exact:true});
 const contributor=page.getByRole('combobox',{name:'Contributor',exact:true});
 const status=page.getByRole('combobox',{name:'Status',exact:true});
 const label=page.getByLabel('Label',{exact:true});
 const from=page.getByLabel('Updated from',{exact:true}),until=page.getByLabel('Updated until',{exact:true});
 const archive=page.getByRole('checkbox',{name:'Include archive',exact:true});
 const trash=page.getByRole('checkbox',{name:'Include trash',exact:true});
 await kind.selectOption('page');await source.selectOption(space);await contributor.selectOption('browser-owner');await status.selectOption('search-ready');await label.fill('synthetic-slate-7');
 await from.fill('2000-01-01');await until.fill('2099-01-01');await archive.check();await trash.check();
 const empty=page.locator('.search-empty');
 await expect(empty.getByText(`No matches for “${query}”.`,{exact:true})).toBeVisible();
 await expect(empty.locator('.search-filter-summary')).toHaveText('Filters: Pages · Space: Release operations · Contributor: Alex Owner · Status: Ready for release · Label: synthetic-slate-7 · Updated from 2000-01-01 · Updated until 2099-01-01 · Including archive · Including trash');
 await expect(input).toHaveValue(query);
 await expect(page.locator('.search-results')).toHaveCount(0);
 await expect(page.getByRole('region',{name:'Retained answer',exact:true})).toHaveCount(0);
 await expect(page.getByText('0 results within your access.',{exact:true})).toBeVisible();
 const clear=empty.getByRole('button',{name:'Clear all filters',exact:true});
 const create=empty.getByRole('button',{name:`Create a page titled “${query}”`,exact:true});
 await expect(clear).toHaveCount(1);await expect(create).toHaveCount(1);
 const before=(await api('/api/pages')).items.map(item=>item.id).sort();
 assert.equal((await api('/api/search?'+new URLSearchParams({q:query}))).total,0,'No matching content exists before the explicit create action.');
 await accessible(page,'no results restates query and every filter');
 await clear.click();
 await expect(empty.locator('.search-filter-summary')).toHaveText('Filters: None');
 await expect(input).toHaveValue(query);
 for(const control of [kind,source,contributor,status,label,from,until,page.getByRole('combobox',{name:'Sort results',exact:true})])await expect(control).toHaveValue('');
 await expect(archive).not.toBeChecked();await expect(trash).not.toBeChecked();await expect(clear).toHaveCount(0);
 await expect.poll(()=>new URL(page.url()).search).toBe('?'+new URLSearchParams({q:query}));
 await expect(page.locator('.search-results')).toHaveCount(0);
 await expect(page.getByRole('region',{name:'Retained answer',exact:true})).toHaveCount(0);
 assert.deepEqual((await api('/api/pages')).items.map(item=>item.id).sort(),before,'Clearing filters never creates content.');
 assert.deepEqual(modelRequests,[],'An empty search does not ask a model to invent an answer.');
 await accessible(page,'no results clears all filters and retains query');
 await create.click();
 await page.waitForURL(url=>url.pathname.startsWith('/app/pages/'));
 const id=new URL(page.url()).pathname.split('/').at(-1);
 const created=(await api('/api/pages/'+id)).page;
 assert.equal(created.title,query);
 assert.equal((await api('/api/containers')).items.find(item=>item.id===created.containerId)?.permissions.canCreatePages,true,'The created page belongs to an authorized destination.');
 assert.deepEqual((await api('/api/pages')).items.map(item=>item.id).sort(),[...before,id].sort(),'One create action makes exactly one persisted page.');
 await expect(page.getByLabel('Page title',{exact:true})).toHaveValue(query);
 await page.reload({waitUntil:'networkidle'});
 await expect(page.getByLabel('Page title',{exact:true})).toHaveValue(query);
 await accessible(page,'no results creates one readable page with the query title');
 await page.goto(origin+'/app/search?'+new URLSearchParams({q:query}),{waitUntil:'networkidle'});
 await expect(page.locator('.search-results h2')).toHaveText([query]);
 await expect(page.locator('.search-results a')).toHaveAttribute('href',new RegExp(`/app/pages/${id}\\?`));
}
