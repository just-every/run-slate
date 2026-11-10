import {countBinaryProbe} from './journey-api.mjs';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {expect} from '@playwright/test';
import {runtime,signIn,root} from '../../portability/runtime.mjs';
import {unpack} from '../../portability/equivalence.mjs';
import {call} from './two-people-support.mjs';

const jobPanel = page => page.getByRole('region',{name:'Workspace transfer job',exact:true});
const jobPath = id => `/api/exports/jobs/${id}`;
const title = (kind,state) => `${kind==='export'?'Export':'Restore'} · ${state}`;

/** Author ordinary content through native doors; the ZIP never supplies its own expected values. */
async function authoredSubtree(state) {
  const receipts=[],documents=[],originals=[];
  const mutate=async(method,route,input)=>{
    const result=await call(state.context,state.origin,method,route,{operationKey:randomUUID(),...input});
    assert.equal(result.status,200,`${method} ${route}: ${JSON.stringify(result.body)}`);
    assert.ok(result.body.receipt?.revisionId,'Every authored change has a native commit receipt.');
    receipts.push({method,route,input,receipt:result.body.receipt,value:result.body.value});
    return result.body.value;
  };
  const space=(await state.api('/api/containers')).items.find(item=>item.visibility!=='personal');
  const group=await mutate('POST','/api/groups',{name:'Archive review team',memberIds:['browser-reader']});
  const create=async(label,parentPageId,treePosition)=>{
    const blockId=randomUUID(),anchorId=randomUUID();
    const created=await mutate('POST','/api/pages',{containerId:space.id,parentPageId,treePosition,title:`Archive ${label}`,properties:{labels:['synthetic-slate-401',label],icon:'📚',typeface:'serif',fullWidth:true},blocks:[{id:blockId,blockType:'paragraph',content:{text:[{text:`synthetic-slate-402: ${label} original body`,commentAnchorId:anchorId}]},treePosition:'a'}]});
    let document=await state.api(`/api/pages/${created.pageId}`);
    await mutate('PATCH',`/api/pages/${created.pageId}`,{expectedRevisionId:document.page.revisionId,properties:{title:`Archive ${label} reviewed`,labels:['synthetic-slate-403',label],icon:'🗂️',typeface:'mono',fullWidth:false}});
    document=await state.api(`/api/pages/${created.pageId}`);
    await mutate('PATCH',`/api/pages/${created.pageId}/blocks/${blockId}`,{expectedRevisionId:document.blocks[0].revisionId,content:{text:[{text:`synthetic-slate-404: ${label} reviewed body`,commentAnchorId:anchorId}]}});
    return {id:created.pageId,blockId,anchorId,parentPageId,treePosition};
  };
  const parent=await create('parent',null,'archive-a');
  // Create siblings in reverse order, so creation order cannot stand in for tree order.
  const second=await create('second child',parent.id,'b');
  const first=await create('first child',parent.id,'a');
  const grandchild=await create('grandchild',first.id,'a');
  const pages=[parent,first,second,grandchild];
  const grants=[];
  for(const [page,principalKind,principalId,level]of [[parent,'member','browser-reader','comment'],[first,'group',group.id,'view']]){
    const input={targetKind:'page',targetId:page.id,principalKind,principalId,level};
    const saved=await mutate('POST','/api/sharing',input);
    grants.push({...input,id:saved.id});
  }
  await mutate('POST','/api/sharing',{...grants[0],level:'edit'});
  await mutate('POST','/api/sharing',{...grants[1],revoke:true});
  await mutate('POST','/api/sharing',{...grants[1],level:'comment'});
  const revokedInput={targetKind:'page',targetId:second.id,principalKind:'member',principalId:'browser-reader',level:'edit'};
  const revoked=await mutate('POST','/api/sharing',revokedInput);
  await mutate('POST','/api/sharing',{...revokedInput,id:revoked.id,revoke:true});
  await mutate('POST','/api/sharing',{targetKind:'page',targetId:second.id,principalKind:'member',principalId:'browser-owner',level:'full'});
  const privateChild=await state.api(`/api/pages/${second.id}`);
  await mutate('PUT',`/api/sharing/pages/${second.id}/inheritance`,{expectedRevisionId:privateChild.page.revisionId,restricted:true});
  const current=await state.api(`/api/pages/${parent.id}`);
  const discussion=await mutate('POST',`/api/comments/page/${parent.id}`,{kind:'inline',blockId:parent.blockId,anchor:{anchorId:parent.anchorId,quote:'synthetic-slate-404: parent reviewed body'},anchorRevisionId:current.workingRevisionId,body:[{text:'synthetic-slate-405: preserve this anchored discussion'}]});
  await mutate('POST',`/api/comments/page/${parent.id}`,{threadId:discussion.threadId,parentCommentId:discussion.id,body:[{text:'synthetic-slate-406: preserve this reply'}]});
  let comments=await state.api(`/api/comments/page/${parent.id}`);
  await mutate('PATCH',`/api/comments/${discussion.id}`,{expectedRevisionId:comments.comments.find(comment=>comment.id===discussion.id).revisionId,body:[{text:'synthetic-slate-408: edited anchored discussion'}]});
  comments=await state.api(`/api/comments/page/${parent.id}`);
  await mutate('POST',`/api/comments/thread/${discussion.threadId}/resolve`,{expectedRevisionId:comments.threads.find(thread=>thread.id===discussion.threadId).revision_id,resolved:true});
  comments=await state.api(`/api/comments/page/${parent.id}`);
  const thread=comments.threads.find(thread=>thread.id===discussion.threadId);
  assert.equal(thread.state,'resolved');
  assert.equal(thread.block_id,parent.blockId);
  assert.equal(thread.anchor_revision_id,current.workingRevisionId);
  assert.deepEqual(JSON.parse(thread.anchor_json),{anchorId:parent.anchorId,quote:'synthetic-slate-404: parent reviewed body'});
  assert.deepEqual(comments.comments.find(comment=>comment.id===discussion.id).body,[{text:'synthetic-slate-408: edited anchored discussion'}]);
  assert.equal(comments.comments.find(comment=>comment.parentCommentId===discussion.id).threadId,discussion.threadId);
  const access=async()=>{
    await state.switchIdentity('reader');
    try{
      const allowed=await call(state.context,state.origin,'GET',`/api/pages/${parent.id}`);
      assert.equal(allowed.status,200,'The active edited grant still serves its authored page.');
      assert.equal(allowed.body.page.id,parent.id);
      const denied=await call(state.context,state.origin,'GET',`/api/pages/${second.id}`);
      assert.equal(denied.status,404,'A retained revoked grant discloses no private child.');
      return {allowed:{id:parent.id,status:allowed.status,title:allowed.body.page.title},revoked:{id:second.id,status:denied.status,body:denied.body}};
    }finally{await state.switchIdentity('owner');}
  };
  const accessBefore=await access();
  for(const [page,name,bytes]of [[parent,'archive-notes.txt',Buffer.from('synthetic-slate-407: original notes\nwith a retained newline\n')],[grandchild,'archive-original.png',Buffer.from([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,1,0,0,0,1,8,4,0,0,0,181,28,12,2,0,0,0,11,73,68,65,84,120,218,99,252,255,31,0,3,3,2,0,239,191,157,100,0,0,0,0,73,69,78,68,174,66,96,130])]]){
    const response=await state.context.request.post(state.origin+'/api/media',{headers:{Origin:state.origin},multipart:{operationKey:randomUUID(),pageId:page.id,file:{name,mimeType:name.endsWith('.txt')?'text/plain':'image/png',buffer:bytes}}});
    assert.equal(response.status(),200,await response.text());
    const uploaded=await response.json();
    receipts.push({method:'POST',route:'/api/media',receipt:uploaded.receipt,value:uploaded.value});
    const downloaded=await state.context.request.get(state.origin+`/api/media/${uploaded.value.id}`);
    assert.equal(downloaded.status(),200);assert.deepEqual(await downloaded.body(),bytes);
    originals.push({id:uploaded.value.id,pageId:page.id,name,bytes,hash:createHash('sha256').update(bytes).digest('hex')});
  }
  for(const page of pages){
    const document=await state.api(`/api/pages/${page.id}`);
    assert.equal(document.parentPageId,page.parentPageId);
    const history=await state.api(`/api/revisions/${page.id}`);
    assert.equal(history.items.length,page.id===second.id?4:3,'Creation, property and body edits retain three versions; the restricted child also retains its access-boundary version.');
    const revisions=[];
    for(const version of history.items)revisions.push(await state.api(`/api/revisions/${page.id}/${version.id}`));
    documents.push({id:page.id,document,history,revisions,sharing:await state.api(`/api/sharing/pages/${page.id}`),discussion:await state.api(`/api/comments/page/${page.id}`)});
  }
  const tree=(await state.api(`/api/pages?containerId=${space.id}`)).items;
  assert.deepEqual(tree.filter(page=>page.parentPageId===parent.id).map(page=>page.id),[first.id,second.id]);
  const ids=pages.map(page=>page.id);
  for(const id of [...ids,group.id])assert.match(id,/^[a-z0-9-]+$/i);
  const list=ids.map(id=>`'${id}'`).join(',');
  const selections={
    pages:`id IN (${list})`,
    page_blocks:`page_id IN (${list})`,
    page_revisions:`page_id IN (${list})`,
    page_labels:`page_id IN (${list})`,
    page_grants:`page_id IN (${list})`,
    comment_threads:`page_id IN (${list})`,
    comments:`thread_id IN (SELECT id FROM comment_threads WHERE page_id IN (${list}))`,
    files:`page_id IN (${list})`,
    record_revisions:`entity_kind='comment-thread' AND entity_id IN (SELECT id FROM comment_threads WHERE page_id IN (${list}))`,
    core_entity_revisions:`(entity_kind='page-grant' AND entity_id IN (SELECT id FROM page_grants WHERE page_id IN (${list}))) OR (entity_kind='group' AND entity_id='${group.id}')`,
    groups:`id='${group.id}'`,
    group_members:`group_id='${group.id}'`,
  };
  // Independent read-only D1 snapshots include every stored field, including fields omitted by UI projections.
  const snapshot=async()=>{
    const results=await state.atRest(Object.entries(selections).map(([table,where])=>`SELECT * FROM ${table} WHERE ${where};`).join('\n'));
    return Object.fromEntries(Object.keys(selections).map((table,index)=>[table,results[index].results]));
  };
  const before=await snapshot();
  for(const receipt of receipts.filter(item=>item.route==='/api/sharing'||item.route==='/api/groups')){
    const history=before.core_entity_revisions.find(row=>row.id===receipt.receipt.revisionId);
    assert.ok(history,'Every native group or page-grant commit has retained history before export.');
    assert.equal(history.entity_id,receipt.value.id);
    if(receipt.route==='/api/sharing'){
      assert.equal(history.entity_kind,'page-grant');
      const content=JSON.parse(history.content_json);
      assert.equal(content.targetId,receipt.input.targetId);
      assert.equal(content.revoked,!!receipt.input.revoke);
      assert.equal(content.level,receipt.input.level);
    }
  }
  for(const receipt of receipts.filter(item=>item.route.startsWith('/api/comments/'))){
    const history=before.record_revisions.find(row=>row.id===receipt.receipt.revisionId);
    assert.ok(history,'Every native discussion commit has retained history before export.');
    assert.equal(history.entity_kind,'comment-thread');
    assert.equal(history.entity_id,discussion.threadId);
  }
  return {pages,documents,receipts,originals,snapshot,before,access,accessBefore};
}

const ordered=rows=>rows.map(row=>JSON.stringify(Object.fromEntries(Object.entries(row).sort(([a],[b])=>a.localeCompare(b))))).sort();

async function reconcileSubtree(state,source,archive,bytes,job,evidence){
  const selected={};
  const pageIds=new Set(source.pages.map(page=>page.id)),threadIds=new Set(source.before.comment_threads.map(thread=>thread.id));
  const groupId=source.before.groups[0].id;
  const grantIds=new Set(source.before.page_grants.map(row=>row.id));
  const includes={
    pages:row=>pageIds.has(row.id),
    comments:row=>threadIds.has(row.thread_id),
    groups:row=>row.id===groupId,
    group_members:row=>row.group_id===groupId,
    record_revisions:row=>row.entity_kind==='comment-thread'&&threadIds.has(row.entity_id),
    core_entity_revisions:row=>(row.entity_kind==='page-grant'&&grantIds.has(row.entity_id))||(row.entity_kind==='group'&&row.entity_id===groupId),
  };
  for(const [table,expected]of Object.entries(source.before)){
    assert.ok(expected.length,`The source snapshot for ${table} is populated.`);
    selected[table]=archive.manifest.tables[table].filter(includes[table]??(row=>pageIds.has(row.page_id)));
    assert.deepEqual(ordered(selected[table]),ordered(expected),`The Settings ZIP retains every source field in ${table}.`);
  }
  for(const page of source.pages){
    const archived=selected.pages.find(row=>row.id===page.id),native=source.documents.find(row=>row.id===page.id);
    assert.equal(archived.parent_page_id,page.parentPageId);
    assert.equal(archived.tree_position,page.treePosition);
    assert.deepEqual(selected.page_revisions.filter(row=>row.page_id===page.id).map(row=>row.id).sort(),native.history.items.map(row=>row.id).sort());
    for(const revision of native.revisions){
      const row=selected.page_revisions.find(row=>row.id===revision.id);
      assert.deepEqual(JSON.parse(row.body_json),revision.blocks);
      assert.deepEqual(JSON.parse(row.properties_json),revision.properties);
    }
  }
  const originalReceipts=[];
  for(const file of source.originals){
    const row=selected.files.find(row=>row.id===file.id),blob=archive.manifest.blobs.find(blob=>blob.key===row.storage_key);
    assert.ok(blob,`Original ${file.name} is present in the ZIP.`);
    assert.equal(row.original_name,file.name);assert.equal(row.page_id,file.pageId);
    assert.equal(row.size_bytes,file.bytes.length);assert.equal(blob.size,file.bytes.length);assert.equal(blob.hash,file.hash);
    const actual=Buffer.from(archive.entries[blob.entry]);
    assert.deepEqual(actual,file.bytes);assert.equal(createHash('sha256').update(actual).digest('hex'),file.hash);
    originalReceipts.push({id:file.id,pageId:file.pageId,name:file.name,blob,bytes:[...actual]});
  }
  for(const file of source.originals){
    const downloaded=await state.context.request.get(state.origin+`/api/media/${file.id}`);
    assert.equal(downloaded.status(),200);
    assert.deepEqual(await downloaded.body(),file.bytes,'Export leaves each native original download unchanged.');
  }
  const accessAfter=await source.access();
  assert.deepEqual(accessAfter,source.accessBefore,'Export cannot reactivate a revoked grant or revoke an active grant.');
  const after=await source.snapshot();
  for(const table of Object.keys(source.before))assert.deepEqual(ordered(after[table]),ordered(source.before[table]),`Export leaves source ${table} unchanged.`);
  const sourceIdentity={head:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),journeySha256:createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex')};
  const receipt={scope:'Ordinary authored page subtree only; other workspace families and requirement-wide completeness remain unproven.',sourceIdentity,viewport:state.page.viewportSize(),jobId:job.id,archive:{bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')},mutations:source.receipts,nativeReads:source.documents,sourceBefore:source.before,archived:selected,originals:originalReceipts,accessBefore:source.accessBefore,accessAfter,sourceAfter:after};
  await writeFile(path.join(evidence,`${state.page.viewportSize().width}-authored-subtree.json`),JSON.stringify(receipt,null,2)+'\n');
  console.log(`PROBE PORT-001 1: native authored subtree -> Settings workspace ZIP retains ${source.pages.length} ordered pages, bodies, properties, thirteen revisions, changed, revoked and regranted member and group grants, edited and resolved anchored thread and reply with retained histories`);
  console.log(`PROBE PORT-001 2: native original downloads -> Settings ZIP has both exact original byte sequences and SHA-256 hashes; independent source snapshots unchanged`);
}

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
    await countBinaryProbe(state.context, state.origin, 'GET', `/api/exports/${job.id}/download`);
    const download=await state.context.request.get(state.origin+`/api/exports/${job.id}/download`);
    assert.notEqual(download.status(),200,'A failed transfer cannot be downloaded by guessing its path.');
  }
  return stored;
}

async function openRestore(state) {
  await state.page.goto(state.origin+'/app',{waitUntil:'networkidle'});
  await state.page.getByRole('button',{name:'Restore an existing workspace',exact:true}).click();
}

/** Hold the automatic run request, without substituting any response, while another document reloads Queued. */
async function stage(state, kind, bytes) {
  let resume;
  const held=new Promise(resolve=>{resume=resolve;});
  await state.page.route('**/api/exports/jobs/*/run',async route=>{await held;await route.continue();},{times:1});
  const staged=state.page.waitForResponse(response=>new URL(response.url()).pathname===`/api/exports/jobs/${kind==='export'?'workspace':'restore'}`&&response.request().method()==='POST');
  if(kind==='restore')await state.page.getByLabel('Slate archive',{exact:true}).setInputFiles({name:'workspace.zip',mimeType:'application/zip',buffer:bytes});
  await state.page.getByRole('button',{name:kind==='export'?'Export workspace':'Restore workspace',exact:true}).click();
  const response=await staged;
  assert.equal(response.status(),202,await response.text());
  const job=await response.json();
  assert.equal(job.state,'queued');
  await shown(state,job,'queued');
  const viewer=await state.context.newPage();
  try {
    await viewer.goto(state.page.url(),{waitUntil:'networkidle'});
    await viewer.reload({waitUntil:'networkidle'});
    if(kind==='restore')await viewer.getByRole('button',{name:'Restore an existing workspace',exact:true}).click();
    await shown({...state,page:viewer},job,'queued');
    await expect(jobPanel(viewer).getByRole('button',{name:'Run queued transfer',exact:true})).toBeEnabled();
  } catch(cause) {resume();await viewer.close();throw cause;}
  return {...job,resume,viewer};
}

async function run(state,job,expected,shot) {
  await state.transferGate('arm',job.kind==='export'?'createMultipartUpload':'get');
  const viewer=job.viewer;
  const finished=state.page.waitForResponse(response=>new URL(response.url()).pathname===jobPath(job.id)+'/run'&&response.request().method()==='POST');
  try {
    job.resume();
    await expect.poll(async()=>(await state.transferGate('status')).reached).toBe(true);
    await shown(state,job,'running');
    // The reloaded Queued document must follow native progress without a manual refresh.
    await shown({...state,page:viewer},job,'running');
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
  const returnUrl=state.page.url();
  const width=state.page.viewportSize().width;
  const evidence=process.env.SLATE_TRANSFER_EVIDENCE_DIR??path.join(root,'.artifacts','ui-convergence','transfers');
  await mkdir(evidence,{recursive:true});
  const shot=async(page,label)=>{await jobPanel(page).scrollIntoViewIfNeeded();await page.screenshot({path:path.join(evidence,`${width}-${label}.png`),fullPage:true});};
  const open=()=>state.page.goto(state.origin+'/app/settings?section=portability',{waitUntil:'networkidle'});
  await state.switchIdentity('owner');
  await open();
  const source=await authoredSubtree(state);
  const spaces=await state.api('/api/containers');
  const created=await call(state.context,state.origin,'POST','/api/pages',{operationKey:crypto.randomUUID(),containerId:spaces.items.find(item=>item.visibility!=='personal').id,title:'Transfer recovery notes',blocks:[{id:crypto.randomUUID(),blockType:'paragraph',content:{text:[{text:'synthetic-slate-301: retained recovery content'}]},treePosition:'a'}]});
  assert.equal(created.status,200);
  const original=Buffer.from('synthetic-slate-302: original recovery attachment');
  const upload=await state.context.request.post(state.origin+'/api/media',{headers:{Origin:state.origin},multipart:{operationKey:crypto.randomUUID(),pageId:created.body.value.pageId,file:{name:'recovery-notes.txt',mimeType:'text/plain',buffer:original}}});
  assert.equal(upload.status(),200,await upload.text());
  const uploaded=await upload.json();
  await state.fixtureSql(["CREATE TRIGGER qualification_transfer_abort BEFORE UPDATE OF state ON federation_exports WHEN NEW.state='completed' BEGIN SELECT RAISE(ABORT,'labelled late recovery fault'); END"]);
  let failed;
  try {
    failed=await stage(state,'export');await shot(state.page,'export-queued');
    const result=await run(state,failed,'failed',shot);
    assert.equal(result.report.code,'EXPORT_COMMIT_FAILED');
    assert.match(result.report.message,/archive could not be committed/);
    assert.deepEqual((await state.transferGate('objects',['federation','exports',failed.id,''].join('/'))).keys,[],'A failed export retains no downloadable archive.');
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
  await reconcileSubtree(state,source,archive,bytes,exported,evidence);
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
      assert.deepEqual((await target.transferGate('objects',['federation','restore',''].join('/'))).keys,[],'A late failed restore removes staged original files.');
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
    const recoveredFile=await context.request.get(target.origin+`/api/media/${uploaded.value.id}`);
    assert.equal(recoveredFile.status(),200);assert.deepEqual(await recoveredFile.body(),original);
    console.log(`PROBE PORT-003 1: failed native export and restore replay and reload -> failed, no download or successful restore action`);
    console.log(`PROBE PORT-003 2: Settings export and empty-deployment restore -> queued, running, completed and failed persisted; counts equal native archive; safe reports identify commit failures`);
  } finally {await context?.close();await target?.close();await rm(scratch,{recursive:true,force:true});}
  await state.page.goto(returnUrl,{waitUntil:'networkidle'});
}
