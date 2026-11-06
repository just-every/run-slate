import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {expect} from '@playwright/test';
import {inbox,newOutboxLink,signInWithOutbox} from '../../e2e/outbox-auth.mjs';
import {unpack,equivalent} from '../../portability/equivalence.mjs';
import {requestWithHost} from '../../e2e/runtime-harness.mjs';
import {call,ok,editable,grant} from './two-people-support.mjs';
import {openNavigation,openPageAction} from './browser-support.mjs';

import {prepareRestoreRecords,proveRestoreRecords} from './restore-records-journey.mjs';

import {prepareRestoreGuest,proveRestoreGuest} from './restore-guest-journey.mjs';

const key=()=>randomUUID();
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const pagePath=id=>`/app/pages/${id}`;
const bodyText='Confirm the transfer owner';
const oldText='synthetic-slate-311: earlier accepted instructions';
const commentText='synthetic-slate-312: retain this exact selected text';
const documentFields=doc=>Object.fromEntries(['page','blocks','properties','parentPageId','workingRevisionId','publishedRevisionId','authorMemberId','createdAt','updatedAt'].map(field=>[field,doc[field]]));

/** A native ordinary subtree, with distinct direct, inherited and revoked access. */
export async function prepareReferentialRestore(state,evidence) {
  const {context,origin,page}=state;
  const owner=(await ok(context,origin,'GET','/api/session')).member;
  const readerContext=await context.browser().newContext({viewport:page.viewportSize()});
  await readerContext.addCookies([{name:'slate_session',value:state.readerCookie.split('=')[1],url:origin}]);
  try {
    const reader=(await ok(readerContext,origin,'GET','/api/session')).member;
    const containerId=(await ok(context,origin,'POST','/api/containers',{operationKey:key(),name:'Transfer field guide',visibility:'private'})).value.id;
    const create=async(title,treePosition,parentPageId,text,link)=>{
      const blockId=key();
      const result=await ok(context,origin,'POST','/api/pages',{operationKey:key(),containerId,parentPageId,title,treePosition,blocks:[{id:blockId,blockType:'paragraph',content:{text:[{text},...(link?[{text:'Open group checklist',link:{href:pagePath(link)}}]:[])]},treePosition:'a'}]});
      return {id:result.value.pageId,blockId,title};
    };
    const parent=await create('Transfer guide','a',undefined,oldText);
    // Deliberately create the siblings in an order different from their retained positions.
    const groupChild=await create('Group checklist','c',parent.id,'synthetic-slate-313: inherited group checklist');
    const denied=await create('Owner annex','b',parent.id,'synthetic-slate-314: owner-only annex');
    const direct=await create('Member appendix','a',parent.id,'synthetic-slate-315: direct member appendix. ',groupChild.id);
    const pages=[parent,direct,denied,groupChild];
    const groupId=(await ok(context,origin,'POST','/api/groups',{operationKey:key(),name:'Transfer reviewers',memberIds:[reader.id]})).value.id;
    await ok(context,origin,'POST','/api/sharing',{operationKey:key(),targetKind:'page',targetId:parent.id,principalKind:'group',principalId:groupId,level:'edit'});
    for(const child of [direct,denied]) {
      await grant(context,origin,child.id,owner.id,'full');
      const doc=await ok(context,origin,'GET',`/api/pages/${child.id}`);
      await ok(context,origin,'PUT',`/api/sharing/pages/${child.id}/inheritance`,{operationKey:key(),expectedRevisionId:doc.page.revisionId,restricted:true});
    }
    await grant(context,origin,direct.id,reader.id,'view');
    const revoked=await grant(context,origin,denied.id,reader.id,'view');
    await grant(context,origin,denied.id,reader.id,'view',{id:revoked.value.id,revoke:true});
    const initial=await ok(context,origin,'GET',`/api/pages/${parent.id}`);
    const revision=initial.workingRevisionId;
    const originals=[];
    for(const [item,name,mimeType,bytes]of [
      [parent,'transfer-original.txt','text/plain',Buffer.from('synthetic-slate-316: original text Ω\nKeep every byte.\n')],
      [denied,'annex-original.pdf','application/pdf',Buffer.concat([Buffer.from('%PDF-1.7\n'),Buffer.from(Array.from({length:2053},(_,i)=>(i*73+19)%256)),Buffer.from('\n%%EOF')])],
      [parent,'transfer-figure.png','image/png',Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64')],
    ]) {
      const upload=await context.request.post(origin+'/api/media',{headers:{Origin:origin},multipart:{operationKey:key(),pageId:item.id,file:{name,mimeType,buffer:bytes}}});
      assert.equal(upload.status(),200,await upload.text());
      originals.push({id:(await upload.json()).value.id,pageId:item.id,name,mimeType,bytes});
    }
    const current=await ok(context,origin,'GET',`/api/pages/${parent.id}`);
    await ok(context,origin,'PATCH',`/api/pages/${parent.id}/blocks/${parent.blockId}`,{operationKey:key(),expectedRevisionId:current.blocks[0].revisionId,content:{text:[{text:bodyText},{text:'. '},{text:'Open member appendix',link:{href:pagePath(direct.id)}},{text:' · '},{text:direct.title,mention:{kind:'page',id:direct.id,label:direct.title}},{text:' · '},{text:reader.displayName,mention:{kind:'person',id:reader.id,label:reader.displayName}},{text:' · '},{text:'Transfer reviewers',mention:{kind:'group',id:groupId,label:'Transfer reviewers'}}]}});
    const imageBlockId=key();
    const withMentions=await ok(context,origin,'GET',`/api/pages/${parent.id}`);
    await ok(context,origin,'PUT',`/api/pages/${parent.id}/blocks`,{operationKey:key(),expectedRevisionId:withMentions.page.revisionId,blocks:[
      ...withMentions.blocks.map(({id,parentBlockId,blockType,content,treePosition})=>({id,parentBlockId,blockType,content,treePosition})),
      {id:imageBlockId,blockType:'media',treePosition:'b',content:{kind:'image',source:{fileId:originals[2].id,url:`/api/media/${originals[2].id}`,name:originals[2].name},caption:'',alt:'Retained transfer figure'}},
    ]});
    await page.goto(origin+pagePath(parent.id),{waitUntil:'networkidle'});
    await editable(page,parent.blockId).focus();
    await page.keyboard.press('ControlOrMeta+Home');
    for(let i=0;i<bodyText.length;i++)await page.keyboard.press('Shift+ArrowRight');
    await page.getByRole('button',{name:'Comment',exact:true}).click();
    await page.getByRole('textbox',{name:'Comment text',exact:true}).fill(commentText);
    await page.getByRole('button',{name:'Send comment',exact:true}).click();
    await expect(page.locator('.comment-thread')).toContainText(commentText);
    const discussion=await ok(context,origin,'GET',`/api/comments/page/${parent.id}`);
    const thread=discussion.threads.find(item=>JSON.parse(item.anchor_json??'null')?.quote===bodyText);
    assert.ok(thread,'The native selection creates an anchored discussion.');
    assert.equal(thread.block_id,parent.blockId);
    const comment=discussion.comments.find(item=>item.threadId===thread.id);
    assert.ok(comment);
    await ok(context,origin,'POST',`/api/pages/${parent.id}/expansion`,{operationKey:key(),expanded:true});
    const live=await ok(context,origin,'GET',`/api/pages/${parent.id}`);
    if(live.publishedRevisionId!==live.workingRevisionId)await ok(context,origin,'POST',`/api/pages/${parent.id}/publish`,{operationKey:key(),expectedRevisionId:live.page.revisionId});
    const publication=await ok(context,origin,'GET',`/api/pages/${parent.id}`);
    const publicInput={host:new URL(origin).host,slug:'synthetic-slate-restore-guide',theme:'dark',indexable:false,socialPreview:{title:'Transfer guide preview',description:'Retained source publication'}};
    await ok(context,origin,'POST',`/api/publishing/${parent.id}`,{operationKey:key(),expectedRevisionId:publication.page.revisionId,...publicInput});
    const sourcePublic=await requestWithHost(origin,`/p/${publicInput.slug}`,publicInput.host);
    assert.equal(sourcePublic.status,200);assert.match(sourcePublic.body,new RegExp(bodyText));
    const exposure=(await ok(context,origin,'GET',`/api/publishing/${parent.id}`)).exposure;
    assert.equal(exposure.revokedAt,null);
    const fixture={containerId,groupId,ownerId:owner.id,readerId:reader.id,readerName:reader.displayName,pages,parent,direct,denied,groupChild,revision,threadId:thread.id,commentId:comment.id,originals,imageBlockId,publicInput,exposure};
    fixture.records=await prepareRestoreRecords(state,fixture);
    fixture.guest=await prepareRestoreGuest(state,fixture);
    fixture.sourceSessions=[fixture.guest.session,(await context.cookies(origin)).find(item=>item.name==='slate_session').value,state.readerCookie.split('=')[1]];
    fixture.source=await snapshot(context,origin,fixture);
    fixture.sourceAccess=await access(readerContext,origin,fixture);
    assert.deepEqual(fixture.sourceAccess.levels,['edit','view','edit']);
    assert.equal(fixture.sourceAccess.denied.status,404);
    await treeScreen(page,origin,fixture,evidence,'source');
    await mentionScreen(page,origin,fixture,evidence,'source');
    return fixture;
  } finally {await readerContext.close();}
}

async function snapshot(context,origin,fixture) {
  const documents={},revisions={},grants={};
  for(const item of fixture.pages) {
    documents[item.id]=documentFields(await ok(context,origin,'GET',`/api/pages/${item.id}`));
    const history=await ok(context,origin,'GET',`/api/revisions/${item.id}`);
    revisions[item.id]=await Promise.all(history.items.map(itemRevision=>ok(context,origin,'GET',`/api/revisions/${item.id}/${itemRevision.id}`)));
    const sharing=await ok(context,origin,'GET',`/api/sharing/pages/${item.id}`);
    grants[item.id]={restricted:sharing.restricted,items:sharing.items,inheritedItems:sharing.inheritedItems};
  }
  const tree=(await ok(context,origin,'GET',`/api/pages?containerId=${fixture.containerId}`)).items;
  return {documents,revisions,grants,tree,discussion:await ok(context,origin,'GET',`/api/comments/page/${fixture.parent.id}`),group:(await ok(context,origin,'GET','/api/groups')).items.find(item=>item.id===fixture.groupId)};
}

async function access(context,origin,fixture) {
  const {parent,direct,groupChild,denied}=fixture;
  const levels=[];
  for(const item of [parent,direct,groupChild])levels.push((await ok(context,origin,'GET',`/api/pages/${item.id}`)).permissions.level);
  const refused={};
  for(const route of [`/api/pages/${denied.id}`,`/api/revisions/${denied.id}`,`/api/comments/page/${denied.id}`,`/api/media/${fixture.originals[1].id}`]) {
    const result=await call(context,origin,'GET',route);
    assert.equal(result.status,404,`${route} refuses the restored member.`);
    assert.doesNotMatch(JSON.stringify(result.body),/owner-only annex|annex-original/);
    refused[route]=result;
  }
  const doc=await ok(context,origin,'GET',`/api/pages/${direct.id}`);
  const write=await call(context,origin,'PATCH',`/api/pages/${direct.id}`,{operationKey:key(),expectedRevisionId:doc.page.revisionId,properties:{title:'An unauthorized replacement'}});
  assert.equal(write.status,404);
  assert.deepEqual(documentFields(await ok(context,origin,'GET',`/api/pages/${direct.id}`)),documentFields(doc),'A refused write changes no restored page state.');
  const original=await context.request.get(origin+`/api/media/${fixture.originals[0].id}`);
  assert.equal(original.status(),200);assert.deepEqual(await original.body(),fixture.originals[0].bytes);
  return {levels,denied:refused[`/api/pages/${denied.id}`],refused,write};
}

/** Compare actual selected archive rows, without treating derived storage keys as record identity. */
function selected(archive,fixture) {
  const ids=new Set(fixture.pages.map(item=>item.id)),files=new Set(fixture.originals.map(item=>item.id));
  const rules={pages:row=>ids.has(row.id),page_blocks:row=>ids.has(row.page_id),page_revisions:row=>ids.has(row.page_id),page_grants:row=>ids.has(row.page_id),comment_threads:row=>row.id===fixture.threadId,comments:row=>row.thread_id===fixture.threadId,groups:row=>row.id===fixture.groupId,group_members:row=>row.group_id===fixture.groupId,files:row=>files.has(row.id)};
  return Object.fromEntries(Object.entries(rules).map(([table,choose])=>[table,archive.manifest.tables[table].filter(choose).map(row=>table==='files'?{...row,storage_key:'restored-original'}:row).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))]));
}

async function treeScreen(page,origin,fixture,evidence,label) {
  await page.goto(origin+pagePath(fixture.parent.id),{waitUntil:'networkidle'});
  await openNavigation(page);
  const nav=page.getByRole('navigation',{name:'Pages',exact:true});
  const space=nav.locator('.space-group').filter({has:page.getByRole('textbox',{name:'Filter pages in Transfer field guide',exact:true})});
  const names=fixture.pages.map(item=>item.title);
  const links=space.locator(fixture.pages.map(item=>`.page-tree a[href="${pagePath(item.id)}"]`).join(','));
  await expect.poll(()=>links.allTextContents()).toEqual(names);
  await page.reload({waitUntil:'networkidle'});await openNavigation(page);
  await expect(links).toHaveCount(names.length);
  assert.deepEqual(await links.allTextContents(),names,'Reload retains parent and all three siblings in source order.');
  await page.screenshot({path:path.join(evidence,`${page.viewportSize().width}-${label}-tree.png`),fullPage:true});
}

/** Follow the native page mention and read the person and group labels after reload. */
async function mentionScreen(page,origin,fixture,evidence,label) {
  await page.goto(origin+pagePath(fixture.parent.id),{waitUntil:'networkidle'});
  const block=page.locator(`[data-block-id="${fixture.parent.blockId}"]`);
  const mention=block.locator('[data-mention-kind="page"]').getByRole('link',{name:fixture.direct.title,exact:true});
  await expect(mention).toHaveAttribute('href',pagePath(fixture.direct.id));
  await expect(block.locator('[data-mention-kind="person"]')).toHaveText('@'+fixture.readerName);
  await expect(block.locator('[data-mention-kind="group"]')).toHaveText('@Transfer reviewers');
  await mention.click();
  await expect(page).toHaveURL(origin+pagePath(fixture.direct.id));
  await expect(page.getByRole('textbox',{name:'Page title',exact:true})).toHaveValue(fixture.direct.title);
  await page.reload({waitUntil:'networkidle'});
  await expect(page.locator(`[data-block-id="${fixture.direct.blockId}"]`)).toContainText('direct member appendix');
  await page.goto(origin+pagePath(fixture.parent.id),{waitUntil:'networkidle'});
  await page.reload({waitUntil:'networkidle'});
  await expect(mention).toHaveAttribute('href',pagePath(fixture.direct.id));
  await expect(block.locator('[data-mention-kind="person"]')).toHaveText('@'+fixture.readerName);
  await expect(block.locator('[data-mention-kind="group"]')).toHaveText('@Transfer reviewers');
  await page.screenshot({path:path.join(evidence,`${page.viewportSize().width}-${label}-mentions.png`),fullPage:true});
}

/** Inert restored public custody preserves the address until an authorized explicit action. */
async function publicReadback(state,fixture,evidence,readerContext) {
  const {context,page,origin}=state;
  const read=async()=>(await ok(context,origin,'GET',`/api/publishing/${fixture.parent.id}`)).exposure;
  const exposure=await read();
  assert.ok(exposure.revokedAt,'Restore deactivates the retained exposure.');
  assert.deepEqual({...exposure,revokedAt:null},fixture.exposure,'Every original public address and setting remains retained.');
  const address=`/p/${exposure.slug}`;
  const anonymous=()=>requestWithHost(origin,address,exposure.host);
  const inactive=await anonymous();
  assert.equal(inactive.status,404);assert.doesNotMatch(inactive.body,new RegExp(bodyText));
  const document=await ok(context,origin,'GET',`/api/pages/${fixture.parent.id}`);
  const before=await snapshot(context,origin,fixture);
  const denied=await call(readerContext,origin,'POST',`/api/publishing/${fixture.parent.id}`,{operationKey:key(),expectedRevisionId:document.page.revisionId,...fixture.publicInput});
  assert.equal(denied.status,404,'Inherited edit access cannot reactivate a public exposure.');
  assert.deepEqual(await read(),exposure);
  assert.deepEqual(await snapshot(context,origin,fixture),before,'A refused public action changes no page, history, grant or discussion.');
  assert.equal((await anonymous()).status,404);
  await page.goto(origin+pagePath(fixture.parent.id),{waitUntil:'networkidle'});
  await openPageAction(page,'Public access');
  const toggle=page.getByRole('switch',{name:'Public link',exact:true});
  await expect(toggle).not.toBeChecked();
  const committed=page.waitForResponse(response=>new URL(response.url()).pathname===`/api/publishing/${fixture.parent.id}`&&response.request().method()==='POST');
  await toggle.click();
  const response=await committed;assert.equal(response.status(),200,await response.text());
  await expect(toggle).toBeChecked();
  assert.deepEqual(await read(),fixture.exposure,'Explicit re-enablement reuses the exact original host, slug and settings.');
  const enabled=await anonymous();
  assert.equal(enabled.status,200);assert.match(enabled.body,new RegExp(bodyText));
  assert.match(enabled.body,/Transfer guide/);assert.doesNotMatch(enabled.body,/owner-only annex/);
  await page.reload({waitUntil:'networkidle'});
  await expect(toggle).toBeChecked();
  await page.screenshot({path:path.join(evidence,`${page.viewportSize().width}-restored-public-address.png`),fullPage:true});
  return {exposure,inactiveStatus:inactive.status,refusedStatus:denied.status,enabled:await read(),enabledStatus:enabled.status};
}

/** Retained addresses, exact history, selected text and originals through a fresh restored session. */
export async function proveReferentialRestore(state,target,fixture,archive,evidence,transfer) {
  const {context,page,origin}=state,width=page.viewportSize().width;
  const before=selected(archive,fixture);
  for(const item of fixture.pages) {
    const row=before.pages.find(row=>row.id===item.id),source=fixture.source.documents[item.id];
    assert.equal(row.working_revision_id,source.workingRevisionId);
    assert.equal(row.parent_page_id,source.parentPageId);
    assert.equal(row.tree_position,fixture.source.tree.find(row=>row.id===item.id).treePosition);
    assert.deepEqual(JSON.parse(before.page_revisions.find(row=>row.id===source.workingRevisionId).body_json),source.blocks);
    assert.deepEqual(before.page_revisions.filter(row=>row.page_id===item.id).map(row=>row.id).sort(),fixture.source.revisions[item.id].map(row=>row.id).sort());
    for(const row of before.page_grants.filter(row=>row.page_id===item.id)) {
      const grant=fixture.source.grants[item.id].items.find(grant=>grant.id===row.id);
      assert.ok(grant);
      assert.deepEqual([row.principal_kind,row.principal_id,row.level,row.expires_at,row.revoked_at],[grant.principalKind,grant.principalId,grant.level,grant.expiresAt,grant.revokedAt]);
    }
  }
  for(const original of fixture.originals) {
    const file=archive.manifest.tables.files.find(row=>row.id===original.id);
    const blob=archive.manifest.blobs.find(row=>row.key===file.storage_key);
    assert.deepEqual(Buffer.from(archive.entries[blob.entry]),original.bytes,'The downloaded ZIP holds exact original bytes.');
  }
  const ownerReadback=await snapshot(context,origin,fixture);
  assert.deepEqual(ownerReadback,fixture.source,'Fresh restored owner reads the same selected documents, full page history, tree, grants, group and anchored discussion.');
  const out=path.join(path.dirname(target.persist),'selected-restored.zip');
  const cookie=(await context.cookies(origin)).find(item=>item.name==='slate_session');
  const destinationExport=await target.cli('export',out,`slate_session=${cookie.value}`);
  const destinationBytes=await readFile(out),destination=unpack(destinationBytes);
  assert.deepEqual(selected(destination,fixture),before,'The destination native export retains every selected archived field.');
  const previousActivity=new Set(archive.manifest.tables.activity_entries.map(row=>row.id));
  const bootstrapAudit=destination.manifest.tables.activity_entries.filter(row=>!previousActivity.has(row.id)&&row.action==='auth.sign-in'&&row.actor_member_id===fixture.ownerId);
  for(const row of bootstrapAudit){
    assert.equal(row.feature,'auth');assert.equal(row.target_kind,'member');assert.equal(row.target_id,fixture.ownerId);
    assert.equal(row.detail_json,'{}');assert.ok(row.id.startsWith('signin:'));
  }
  const inventory=equivalent(archive,destination,target.email,destinationExport.id,bootstrapAudit);
  for(const original of fixture.originals) {
    const file=destination.manifest.tables.files.find(row=>row.id===original.id);
    const blob=destination.manifest.blobs.find(row=>row.key===file.storage_key);
    assert.deepEqual(Buffer.from(destination.entries[blob.entry]),original.bytes,'A new destination export still holds the exact original.');
  }
  console.log(`PROBE PORT-002 archive inventory: ${inventory.records} retained rows, ${inventory.tables} declared tables and ${inventory.attachments} original objects agree after failed restore and retry`);
  const recordProof=await proveRestoreRecords(state,fixture,evidence);
  const guestProof=await proveRestoreGuest(state,fixture,evidence);
  const stale=await context.browser().newContext();
  const sessionRefusals=[];
  try {
    for(const value of fixture.sourceSessions) {
      await stale.clearCookies();await stale.addCookies([{name:'slate_session',value,url:origin}]);
      const response=await stale.request.get(origin+'/api/session');
      sessionRefusals.push(response.status());
      assert.equal(response.status(),401,'An archived source session never becomes restored authority.');
    }
  } finally {await stale.close();}
  await treeScreen(page,origin,fixture,evidence,'restored');
  await mentionScreen(page,origin,fixture,evidence,'restored-owner');
  for(const item of fixture.pages) {
    await page.goto(origin+pagePath(item.id),{waitUntil:'networkidle'});
    await expect(page.getByRole('textbox',{name:'Page title',exact:true})).toHaveValue(item.title);
  }
  const reader=(archive.manifest.tables.members).find(item=>item.id===fixture.readerId);
  assert.ok(reader);
  const messages=await inbox(origin);
  const refusedSignIn=await context.request.post(origin+'/api/auth/magic',{headers:{Origin:origin},data:{email:reader.email,requestKey:key()}});
  assert.equal(refusedSignIn.status(),200);assert.equal((await refusedSignIn.json()).accepted,true);
  assert.deepEqual(await inbox(origin),messages,'A restored historical member cannot sign in before invitation.');
  await ok(context,origin,'POST','/api/invitations',{operationKey:key(),email:reader.email,kind:'member'});
  const invitation=await newOutboxLink(origin,messages);
  const invited=await context.browser().newContext({viewport:page.viewportSize(),locale:'en-US'});
  try {
    const memberPage=await invited.newPage();
    await memberPage.goto(invitation,{waitUntil:'domcontentloaded'});
    await Promise.all([memberPage.waitForURL(url=>url.pathname.startsWith('/app'),{waitUntil:'networkidle'}),memberPage.getByRole('button',{name:'Accept invitation',exact:true}).click()]);
    // Discard the invitation session; establish a separate native sign-in as the retained person.
    await invited.clearCookies();
    const fresh=await signInWithOutbox(origin,reader.email);
    await invited.addCookies([{name:'slate_session',value:fresh.cookie.split('=')[1],url:origin}]);
    const current=(await ok(invited,origin,'GET','/api/session')).member;
    assert.equal(current.id,fixture.readerId);assert.equal(current.role,'member');
    const restoredAccess=await access(invited,origin,fixture);
    assert.deepEqual(restoredAccess,fixture.sourceAccess,'Restored direct, inherited group, revoked and refused access matches the source.');
    await mentionScreen(memberPage,origin,fixture,evidence,'restored-member');
    const publicProof=await publicReadback(state,fixture,evidence,invited);
    // Every selected original is read by the owner; the member also reads the allowed file and is refused the annex.
    for(const original of fixture.originals) {
      const response=await context.request.get(origin+`/api/media/${original.id}`);
      assert.equal(response.status(),200);assert.deepEqual(await response.body(),original.bytes);
    }
    await memberPage.goto(origin+pagePath(fixture.direct.id),{waitUntil:'networkidle'});
    const opened=memberPage.waitForEvent('popup');
    const link=memberPage.locator(`[data-block-id="${fixture.direct.blockId}"]`).getByRole('link',{name:'Open group checklist',exact:true});
    await expect(link).toHaveAttribute('href',pagePath(fixture.groupChild.id));
    await link.click();
    const linked=await opened;
    try {
      await expect(linked).toHaveURL(origin+pagePath(fixture.groupChild.id));
      await expect(linked.getByRole('textbox',{name:'Page title',exact:true})).toHaveValue(fixture.groupChild.title);
      await linked.reload({waitUntil:'networkidle'});
      await expect(linked.locator(`[data-block-id="${fixture.groupChild.blockId}"]`)).toContainText('inherited group checklist');
      await linked.screenshot({path:path.join(evidence,`${width}-restored-member-link.png`),fullPage:true});
    } finally {await linked.close();}
    await memberPage.goto(origin+pagePath(fixture.parent.id)+`?detail=history&revision=${fixture.revision}`,{waitUntil:'networkidle'});
    await expect(memberPage.locator('.revision-preview')).toContainText(oldText);
    await expect(memberPage.locator('.revision-preview')).not.toContainText(bodyText);
    await memberPage.reload({waitUntil:'networkidle'});
    await expect(memberPage.locator('.revision-preview')).toContainText(oldText);
    await memberPage.screenshot({path:path.join(evidence,`${width}-restored-history.png`),fullPage:true});
    await memberPage.goto(origin+pagePath(fixture.parent.id)+`?thread=${fixture.threadId}&comment=${fixture.commentId}`,{waitUntil:'networkidle'});
    const thread=memberPage.locator(`#thread-${fixture.threadId}`);
    await expect(thread.locator(`#comment-${fixture.commentId}`)).toContainText(commentText);
    await expect(thread.locator('blockquote')).toHaveText(bodyText);
    await thread.getByRole('button',{name:'Jump to selected text',exact:true}).click();
    await expect(editable(memberPage,fixture.parent.blockId).locator('mark')).toHaveText(bodyText);
    await memberPage.reload({waitUntil:'networkidle'});
    await expect(thread.locator(`#comment-${fixture.commentId}`)).toContainText(commentText);
    await expect(editable(memberPage,fixture.parent.blockId).locator('mark')).toHaveText(bodyText);
    await memberPage.screenshot({path:path.join(evidence,`${width}-restored-anchor.png`),fullPage:true});
    await memberPage.goto(origin+pagePath(fixture.denied.id),{waitUntil:'networkidle'});
    await expect(memberPage.locator('body')).not.toContainText('owner-only annex');
    await memberPage.reload({waitUntil:'networkidle'});
    await expect(memberPage.locator('body')).not.toContainText('owner-only annex');
    await memberPage.screenshot({path:path.join(evidence,`${width}-restored-refusal.png`),fullPage:true});
    assert.deepEqual(await snapshot(context,origin,fixture),ownerReadback,'Following retained addresses and refused member mutations leave the selected documents, histories, grants, group and discussion unchanged.');
    await writeFile(path.join(evidence,`${width}-referential-restore.json`),JSON.stringify({width,transfer,destinationArchive:{bytes:destinationBytes.length,sha256:hash(destinationBytes)},inventory,recordProof,guestProof,source:fixture.source,archive:before,destination:ownerReadback,restoredArchive:selected(destination,fixture),sourceAccess:fixture.sourceAccess,restoredAccess,sessionRefusals,publicProof,files:fixture.originals.map(({bytes,...item})=>({...item,bytes:bytes.length,sha256:hash(bytes)})),retainedAddresses:{pages:fixture.pages.map(item=>pagePath(item.id)),revision:pagePath(fixture.parent.id)+`?revision=${fixture.revision}`,discussion:pagePath(fixture.parent.id)+`?thread=${fixture.threadId}&comment=${fixture.commentId}`}},null,2));
    console.log(`PROBE PORT-002 1: downloaded Settings ZIP -> native empty restore; four retained page IDs, exact history, ordered siblings, direct and group grants, internal page link, selected discussion anchor and original bytes match source`);
    console.log(`PROBE PORT-002 inventory: native destination export -> ${inventory.records} retained rows across ${inventory.tables} declared tables and ${inventory.attachments} original objects agree with the actual downloaded source ZIP, with explicit safe restored custody`);
    console.log(`PROBE PORT-002 mentions and public slug: restored page mention opens the retained record; person and group labels survive reload; original public host and slug return 404 until explicit owner re-enablement; member attempt refused unchanged`);
    console.log(`PROBE PORT-002 2: fresh restored owner and invited member at ${width}px -> retained links, exact earlier version and anchor survive reload; revoked page, history, comments and original refused; view-only write 404 with unchanged content`);
  } finally {await invited.close();}
}
