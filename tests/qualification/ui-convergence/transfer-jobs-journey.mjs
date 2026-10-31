import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {expect} from '@playwright/test';
import {runtime,signIn,root} from '../../portability/runtime.mjs';
import {unpack} from '../../portability/equivalence.mjs';
import {call} from './two-people-support.mjs';

const jobPanel = page => page.getByRole('region',{name:'Workspace transfer job',exact:true});
const jobPath = id => `/api/exports/jobs/${id}`;
const title = (kind,state) => `${kind==='export'?'Export':'Restore'} · ${state}`;

/** Native mutation, independent status read and rendered counts must describe the same persisted job. */
async function shown(state, job, expected) {
  const result=await call(state.context,state.origin,'GET',jobPath(job.id));
  assert.equal(result.status,200);
  const stored=result.body;
  assert.equal(stored.state,expected);
  assert.equal(stored.id,job.id);
  const panel=jobPanel(state.page);
  await expect(panel.getByRole('heading',{name:title(job.kind,expected),exact:true})).toBeVisible();
  if(!Object.keys(stored.counts).length) await expect(panel).toContainText('0 records completed');
  else {
    const all=panel.getByText(/^All archive counts/);
    if(await all.count()&&!await all.evaluate(element=>element.parentElement.open))await all.click();
    const labels={pages:'Pages',page_blocks:'Blocks',page_revisions:'Page versions',database_records:'Records',members:'People',files:'Files'};
    for(const [key,value]of Object.entries(stored.counts)) {
      const row=panel.locator('dl > div').filter({has:state.page.locator('dt',{hasText:new RegExp(`^${labels[key]??key.replaceAll('_',' ')}$`)})});
      await expect(row.locator('dd')).toHaveText(value.toLocaleString('en-US'));
    }
  }
  if(expected!=='completed') {
    assert.equal(stored.downloadPath,undefined);
    assert.equal(stored.restoreId,undefined);
    await expect(panel.getByRole('link')).toHaveCount(0);
    await expect(panel).not.toContainText(/fresh sign-in|Open restored workspace/);
  }
  if(expected==='failed') {
    assert.ok(stored.report.code);
    assert.ok(stored.report.message);
    await expect(panel).toContainText(stored.report.code);
    await expect(panel).toContainText(stored.report.message);
    assert.doesNotMatch(JSON.stringify(stored.report),/labelled late recovery fault|CREATE TRIGGER|INSERT INTO|qualification_transfer_abort/);
    const replay=await call(state.context,state.origin,'POST',jobPath(job.id)+'/run',{});
    assert.equal(replay.status,200);
    assert.deepEqual(replay.body,stored,'Replaying a failed job cannot turn it into a completion.');
    const download=await state.context.request.get(state.origin+`/api/exports/${job.id}/download`);
    assert.notEqual(download.status(),200,'A failed transfer cannot be downloaded by guessing its path.');
  }
  return stored;
}

async function openRestore(state) {
  await state.page.goto(state.origin+'/app',{waitUntil:'networkidle'});
  await state.page.getByRole('button',{name:'Restore an existing workspace',exact:true}).click();
}

/** Abort only the automatic run transport to retain a genuine native queued receipt across reload. */
async function stage(state, kind, bytes) {
  await state.page.route('**/api/exports/jobs/*/run',route=>route.abort('connectionfailed'),{times:1});
  const staged=state.page.waitForResponse(response=>new URL(response.url()).pathname===`/api/exports/jobs/${kind==='export'?'workspace':'restore'}`&&response.request().method()==='POST');
  if(kind==='restore')await state.page.getByLabel('Slate archive',{exact:true}).setInputFiles({name:'workspace.zip',mimeType:'application/zip',buffer:bytes});
  await state.page.getByRole('button',{name:kind==='export'?'Export workspace':'Restore workspace',exact:true}).click();
  const response=await staged;
  assert.equal(response.status(),202,await response.text());
  const job=await response.json();
  assert.equal(job.state,'queued');
  await expect(jobPanel(state.page).getByRole('button',{name:'Run queued transfer',exact:true})).toBeEnabled();
  await shown(state,job,'queued');
  await state.page.reload({waitUntil:'networkidle'});
  if(kind==='restore')await state.page.getByRole('button',{name:'Restore an existing workspace',exact:true}).click();
  await shown(state,job,'queued');
  return job;
}

async function run(state,job,expected,shot) {
  await state.transferGate('arm',job.kind==='export'?'createMultipartUpload':'get');
  let viewer;
  const finished=state.page.waitForResponse(response=>new URL(response.url()).pathname===jobPath(job.id)+'/run'&&response.request().method()==='POST');
  try {
    await jobPanel(state.page).getByRole('button',{name:'Run queued transfer',exact:true}).click();
    await expect.poll(async()=>(await state.transferGate('status')).reached).toBe(true);
    await shown(state,job,'running');
    // Keep the native run request alive while an independent document reloads its durable receipt.
    viewer=await state.context.newPage();
    await viewer.goto(state.page.url(),{waitUntil:'networkidle'});
    if(job.kind==='restore')await viewer.getByRole('button',{name:'Restore an existing workspace',exact:true}).click();
    await viewer.reload({waitUntil:'networkidle'});
    if(job.kind==='restore')await viewer.getByRole('button',{name:'Restore an existing workspace',exact:true}).click();
    await shown({...state,page:viewer},job,'running');
    await shot(viewer,`${job.kind}-running`);
  } finally {await state.transferGate('release');await viewer?.close();}
  const response=await finished;
  assert.equal(response.status(),200,await response.text());
  const result=await response.json();
  assert.equal(result.state,expected);
  if(job.kind!=='restore'||expected==='failed')await shown(state,job,expected);
  return result;
}

/** Actual Settings export and first-run restore, with native D1 failures and a separate destination. */
export async function transferJobsJourney(state) {
  const width=state.page.viewportSize().width;
  const evidence=process.env.SLATE_TRANSFER_EVIDENCE_DIR??path.join(root,'.artifacts/ui-convergence/transfers');
  await mkdir(evidence,{recursive:true});
  const shot=async(page,label)=>{await jobPanel(page).scrollIntoViewIfNeeded();await page.screenshot({path:path.join(evidence,`${width}-${label}.png`),fullPage:true});};
  const open=()=>state.page.goto(state.origin+'/app/settings?section=portability',{waitUntil:'networkidle'});
  await state.switchIdentity('owner');
  await open();
  await state.fixtureSql(["CREATE TRIGGER qualification_transfer_abort BEFORE UPDATE OF state ON federation_exports WHEN NEW.state='completed' BEGIN SELECT RAISE(ABORT,'labelled late recovery fault'); END"]);
  let failed;
  try {
    failed=await stage(state,'export');await shot(state.page,'export-queued');
    const result=await run(state,failed,'failed',shot);
    assert.equal(result.report.code,'EXPORT_COMMIT_FAILED');
    assert.match(result.report.message,/archive could not be committed/);
    await open();await shown(state,failed,'failed');await shot(state.page,'export-failed');
  } finally {await state.fixtureSql(['DROP TRIGGER qualification_transfer_abort']);}
  const exported=await stage(state,'export');
  const complete=await run(state,exported,'completed',shot);
  await open();await shown(state,exported,'completed');await shot(state.page,'export-completed');
  const pending=state.page.waitForEvent('download');
  await jobPanel(state.page).getByRole('link',{name:'Download workspace archive',exact:true}).click();
  const file=await pending;assert.equal(await file.failure(),null);
  const bytes=await readFile(await file.path()),archive=unpack(bytes);
  assert.ok(archive.manifest.tables.pages.length>0);
  assert.deepEqual(complete.counts,Object.fromEntries(Object.entries(archive.manifest.tables).map(([table,rows])=>[table,rows.length])));
  const owner=(await state.api('/api/session')).member;
  const scratch=await mkdtemp(path.join(root,'.artifacts/transfer-target-'));
  let target,context;
  try {
    target=await runtime(scratch,{email:owner.email});
    const [empty]=await target.sql('SELECT (SELECT COUNT(*) FROM pages) AS pages,(SELECT COUNT(*) FROM containers) AS containers');
    assert.deepEqual(empty.results,[{pages:0,containers:0}]);
    await target.start();
    const cookie=await signIn(target);
    context=await state.context.browser().newContext({viewport:state.page.viewportSize(),locale:'en-US'});
    await context.addCookies([{name:'slate_session',value:cookie.split('=')[1],url:target.origin}]);
    const page=await context.newPage();
    const destination={page,context,origin:target.origin,transferGate:target.transferGate};
    await openRestore(destination);
    await target.fixtureSql(["CREATE TRIGGER qualification_transfer_abort BEFORE INSERT ON page_blocks BEGIN SELECT RAISE(ABORT,'labelled late recovery fault'); END"]);
    try {
      const job=await stage(destination,'restore',bytes);await shot(page,'restore-queued');
      const result=await run(destination,job,'failed',shot);
      assert.equal(result.report.code,'RESTORE_COMMIT_FAILED');
      assert.match(result.report.message,/records could not be published.*destination was left unchanged/);
      await openRestore(destination);await shown(destination,job,'failed');await shot(page,'restore-failed');
      await page.goto('about:blank');await target.close();
      const [retained]=await target.sql('SELECT (SELECT COUNT(*) FROM pages) AS pages,(SELECT COUNT(*) FROM containers) AS containers,(SELECT COUNT(*) FROM files) AS files');
      assert.deepEqual(retained.results,[{pages:0,containers:0,files:0}],'A genuine late failure publishes no imported records.');
      await target.start();
    } finally {await target.fixtureSql(['DROP TRIGGER qualification_transfer_abort']);}
    await openRestore(destination);
    const restore=await stage(destination,'restore',bytes);
    const restored=await run(destination,restore,'completed',shot);
    assert.deepEqual(restored.counts,complete.counts);
    await expect(jobPanel(page).getByRole('link',{name:'Open restored workspace',exact:true})).toBeVisible();
    await expect(jobPanel(page).getByRole('link',{name:'Download workspace archive',exact:true})).toHaveCount(0);
    // Publication revokes the bootstrap session; reload only after genuine fresh owner sign-in.
    const fresh=await signIn(target);
    await context.clearCookies();await context.addCookies([{name:'slate_session',value:fresh.split('=')[1],url:target.origin}]);
    await page.goto(target.origin+'/app/settings?section=portability',{waitUntil:'networkidle'});
    await shown(destination,restore,'completed');await shot(page,'restore-completed');
    for(const original of archive.manifest.tables.pages){
      const current=await call(context,target.origin,'GET',`/api/pages/${original.id}`);
      assert.equal(current.status,200);assert.equal(current.body.page.title,original.title);
    }
    console.log(`PROBE PORT-003 1: failed native export and restore replay and reload -> failed, no download or successful restore action`);
    console.log(`PROBE PORT-003 2: Settings export and empty-deployment restore -> queued, running, completed and failed persisted; counts equal native archive; safe reports identify commit failures`);
  } finally {await context?.close();await target?.close();await rm(scratch,{recursive:true,force:true});}
}
