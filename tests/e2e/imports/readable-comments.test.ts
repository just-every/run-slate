import {env} from 'cloudflare:test';
import {beforeEach,expect} from 'vitest';
import {unzipSync,zipSync,strToU8} from 'fflate';
import {createApi} from '../../../src/core/app/hono';
import {contract} from '../contract';
import {resetDeployment} from '../setup/reset-deployment';
import {seedWorkspace,seedMember,seedContainerGrant,sessionFor} from '../setup/fixtures';

beforeEach(resetDeployment);
contract('PORT-008','HTML and Markdown exports restore authored page and inline replies, tombstones, resolution and block anchors in a fresh deployment',async()=>{
 const api=createApi();let cookie='';
 const request=(method:string,path:string,body?:unknown)=>api.request('https://slate.test/api'+path,{method,headers:{cookie,origin:'https://slate.test',...(body instanceof FormData?{}:{'content-type':'application/json'})},body:body===undefined?undefined:body instanceof FormData?body:JSON.stringify(body)},{...env,SLATE_PROFILE:undefined});
 const json=async(method:string,path:string,body?:unknown)=>{const response=await request(method,path,body),data=await response.json<any>();expect(response.status,JSON.stringify(data)).toBe(200);return data;};
 const setup=async()=>{const {workspaceId}=await seedWorkspace();const {memberId}=await seedMember(workspaceId,{role:'owner',email:['owner','slate.test'].join('@'),displayName:'Owner',isSetupOwner:true});cookie=await sessionFor(memberId,{freshProof:true});return {workspaceId,memberId};};
 const {workspaceId,memberId}=await setup();
 const {memberId:second}=await seedMember(workspaceId,{role:'member',email:['second','slate.test'].join('@'),displayName:'Writer <script>alert(1)</script>'});
 const ownerCookie=cookie,secondCookie=await sessionFor(second);
 const firstRun=await json('POST','/workspace/first-run',{operationKey:crypto.randomUUID(),workspaceName:'Operations',containerName:'Handbook',pageTitle:'Welcome'});
 const containerId=firstRun.value.containerId;
 const welcomeExport=await request('POST','/exports/readable',{scope:'page',id:firstRun.value.pageId,format:'html'});
 expect(welcomeExport.status).toBe(200);
 for(const principalId of [memberId,second])await seedContainerGrant(containerId,{principalKind:'member',principalId,level:'full'});
 const blockId=crypto.randomUUID(),anchorId=crypto.randomUUID();
 const page=(await json('POST','/pages',{operationKey:crypto.randomUUID(),containerId,title:'Comment archive',blocks:[{id:blockId,blockType:'paragraph',content:{text:[{text:'Anchored decision',commentAnchorId:anchorId}]},treePosition:'a'}]})).value.pageId;

 const text=(value:string)=>[{text:value}];
 const structured=[
  ...[1,2,3].map(level=>({blockType:'heading',content:{level,text:text(`Recovery level ${level}`)}})),
  {blockType:'list',content:{variant:'bulleted',items:[{id:crypto.randomUUID(),text:text('Notify the recovery lead')},{id:crypto.randomUUID(),text:text('Retain the incident log')}] }},
  {blockType:'list',content:{variant:'numbered',start:3,items:[{id:crypto.randomUUID(),text:text('Check service health')},{id:crypto.randomUUID(),text:text('Confirm customer recovery')}] }},
  {blockType:'list',content:{variant:'toggle',items:[{id:crypto.randomUUID(),text:text('Recovery detail'),open:false,detail:text('Preserve the hidden recovery instructions')}] }},
  {blockType:'quote',content:{text:text('Recovery requires a second reader.')}},
  {blockType:'divider',content:{}},
  {blockType:'callout',content:{tone:'warn',icon:'!',text:text('Do not discard the recovery log.')}},
  {blockType:'expandable',content:{summary:'Escalation notes',open:false,content:text('Keep the complete escalation history.')}},
  {blockType:'table',content:{columns:['Owner','Next action'],rows:[{id:crypto.randomUUID(),cells:['Morgan','Confirm <recovery> & notify']},{id:crypto.randomUUID(),cells:['Alex','Review | retain']}]}},
  {blockType:'code',content:{language:'typescript',code:'const recovered = count < 3;\nconsole.log("recovered", recovered);\n'}},
 ].map((b,i)=>({...b,id:crypto.randomUUID(),parentBlockId:i===6?blockId:null,treePosition:'b'+String(i+1).padStart(4,'0')}));
 const created=await json('GET',`/pages/${page}`);
 await json('PUT',`/pages/${page}/blocks`,{operationKey:crypto.randomUUID(),expectedRevisionId:created.workingRevisionId,blocks:[...created.blocks.map(({id,blockType,content,parentBlockId,treePosition}:any)=>({id,blockType,content,parentBlockId,treePosition})),...structured]});
 const structuredSource=(await json('GET',`/pages/${page}`)).blocks;
 const doc=await json('GET',`/pages/${page}`);
 const inline=(await json('POST',`/comments/page/${page}`,{operationKey:crypto.randomUUID(),kind:'inline',blockId,anchor:{anchorId,quote:'Anchored decision'},anchorRevisionId:doc.workingRevisionId,body:[{text:'Review draft'}]})).value;
 const beforeEdit=await json('GET',`/comments/page/${page}`);
 await json('PATCH',`/comments/${inline.id}`,{operationKey:crypto.randomUUID(),expectedRevisionId:beforeEdit.comments.find((c:any)=>c.id===inline.id).revisionId,body:[{text:'Check <img src=x onerror=alert(1)>'}]});
 cookie=secondCookie;
 await json('POST',`/comments/page/${page}`,{operationKey:crypto.randomUUID(),threadId:inline.threadId,parentCommentId:inline.id,body:[{text:'Confirmed'}]});
 const pageComment=(await json('POST',`/comments/page/${page}`,{operationKey:crypto.randomUUID(),body:[{text:'Deleted private words'}]})).value;
 let listed=await json('GET',`/comments/page/${page}`);
 await json('PATCH',`/comments/${pageComment.id}`,{operationKey:crypto.randomUUID(),expectedRevisionId:listed.comments.find((c:any)=>c.id===pageComment.id).revisionId,delete:true});
 listed=await json('GET',`/comments/page/${page}`);
 await json('POST',`/comments/thread/${inline.threadId}/resolve`,{operationKey:crypto.randomUUID(),expectedRevisionId:listed.threads.find((t:any)=>t.id===inline.threadId).revision_id,resolved:true});
 cookie=ownerCookie;
 const {memberId:outsider}=await seedMember(workspaceId,{role:'member',email:['outsider','slate.test'].join('@'),displayName:'Outside Reader'});
 cookie=await sessionFor(outsider);
 expect((await request('POST','/exports/readable',{scope:'page',id:page,format:'html'})).status).toBe(404);
 const privateExport=await request('POST','/exports/readable',{scope:'workspace',id:workspaceId,format:'markdown'});
 expect(privateExport.status).toBe(200);
 expect(new TextDecoder().decode(unzipSync(new Uint8Array(await privateExport.arrayBuffer()))['slate-readable.json'])).not.toContain('Anchored decision');
 cookie=ownerCookie;
 const archives:{format:string;bytes:Uint8Array;manifest:any}[]=[];
 for(const format of ['html','markdown']){
  for(const scope of ['page','container','workspace']){
   const response=await request('POST','/exports/readable',{scope,id:scope==='page'?page:containerId,format});expect(response.status).toBe(200);
   const bytes=new Uint8Array(await response.arrayBuffer()),entries=unzipSync(bytes),decode=(name:string)=>new TextDecoder().decode(entries[name]);
   const manifest=JSON.parse(decode('slate-readable.json')),comments=manifest.pages.find((p:any)=>p.id===page).comments;
   expect(JSON.parse(decode(`pages/${page}.comments.json`))).toEqual(comments);
   expect(comments.threads).toHaveLength(2);expect(JSON.stringify(comments)).not.toContain('Deleted private words');
   if(format==='html'){const html=decode(`pages/${page}.html`);expect(html).toContain(`href="#slate-block-${blockId}"`);expect(html).toContain(`id="slate-block-${blockId}"`);expect(html).toContain('&lt;script&gt;');expect(html).toContain('&lt;img');expect(html).not.toContain('<script>');expect(html).not.toContain('<img');}

   const readable=decode(`pages/${page}.${format==='html'?'html':'md'}`);
   for(const value of ['Recovery level 1','Recovery level 2','Recovery level 3','Notify the recovery lead','Retain the incident log','Check service health','Confirm customer recovery','Recovery detail','Preserve the hidden recovery instructions','Recovery requires a second reader.','Do not discard the recovery log.','Escalation notes','Keep the complete escalation history.','Owner','Next action','Morgan','Alex'])expect(readable).toContain(value);
   if(format==='html'){
    for(const level of [1,2,3])expect(readable).toMatch(new RegExp(`<h${level}[^>]*>Recovery level ${level}</h${level}>`));
    expect(readable).toContain('<ol start="3">');expect(readable).toContain('<ul>');expect(readable).toContain('<blockquote>');expect(readable).toContain('<hr>');
    expect(readable).toContain('<details><summary>Recovery detail</summary>');expect(readable).toContain('<details><summary>Escalation notes</summary>');
    expect(readable).toContain('<th scope="col">Owner</th>');expect(readable).toContain('Confirm &lt;recovery&gt; &amp; notify');
    expect(readable).toContain('<code class="language-typescript">const recovered = count &lt; 3;\nconsole.log(&quot;recovered&quot;, recovered);\n</code>');
   }else{
    for(const level of [1,2,3])expect(readable).toContain(`${'#'.repeat(level)} Recovery level ${level}`);
    expect(readable).toContain('- Notify the recovery lead\n- Retain the incident log');expect(readable).toContain('3. Check service health\n4. Confirm customer recovery');
    expect(readable).toContain('<blockquote>Recovery requires a second reader.</blockquote>');expect(readable).toContain('\n---\n');
    expect(readable).toContain('<details><summary>Recovery detail</summary>');expect(readable).toContain('<details><summary>Escalation notes</summary>');
    expect(readable).toContain('| Owner | Next action |\n| --- | --- |');expect(readable).toContain('| Morgan | Confirm \\<recovery\\> & notify |');expect(readable).toContain('Review \\| retain');
    expect(readable).toContain('```typescript\nconst recovered = count < 3;\nconsole.log("recovered", recovered);\n\n```');
   }
   expect(readable).toContain(`<div id="slate-block-${blockId}"><p>Anchored decision</p><div class="slate-block-children" style="margin-inline-start:20px"><div id="slate-block-${structured[6]!.id}"><blockquote>Recovery requires a second reader.</blockquote>`);
   expect(manifest.pages.find((p:any)=>p.id===page).blocks).toEqual(structuredSource);
   if(scope==='workspace')archives.push({format,bytes,manifest});
  }
 }
 for(const archive of archives){
  await resetDeployment();await setup();
  const upload=async(bytes:Uint8Array)=>{const form=new FormData();form.set('file',new File([new Uint8Array(bytes)],archive.format+'.zip'));form.set('format','slate-readable');form.set('operationKey',crypto.randomUUID());return json('POST','/imports',form);};
  const notices=await env.DB.prepare('SELECT COUNT(*) AS n FROM notifications').first<number>('n');
  const job=await upload(archive.bytes);expect((await json('POST',`/imports/${job.id}/run`,{})).state).toBe('completed');
  const copy=(await json('GET','/pages')).items.find((p:any)=>p.title==='Comment archive');expect(copy).toBeDefined();
  const restored=await json('GET',`/comments/page/${copy.id}`),document=await json('GET',`/pages/${copy.id}`);

  const sourceBlocks=archive.manifest.pages.find((p:any)=>p.id===page).blocks;
  const sourceIds=new Map(sourceBlocks.map((b:any,i:number)=>[b.id,i])),copyIds=new Map(document.blocks.map((b:any,i:number)=>[b.id,i]));
  const canonical=(blocks:any[],ids:Map<unknown,unknown>)=>blocks.map(b=>({type:b.blockType,position:b.treePosition,parent:b.parentBlockId?ids.get(b.parentBlockId):null,content:JSON.parse(JSON.stringify(b.content),(key,value)=>key==='commentAnchorId'?'retained-anchor':value)}));
  expect(canonical(document.blocks,copyIds)).toEqual(canonical(sourceBlocks,sourceIds));
  expect(document.blocks.every((b:any)=>!sourceIds.has(b.id))).toBe(true);
  expect((await json('GET',`/pages/${copy.id}`)).blocks).toEqual(document.blocks);
  const original=archive.manifest.pages.find((p:any)=>p.id===page).comments;
  expect(restored.threads).toHaveLength(original.threads.length);expect(restored.comments).toHaveLength(original.threads.flatMap((t:any)=>t.comments).length);
  const thread=restored.threads.find((t:any)=>t.kind==='inline'),source=original.threads.find((t:any)=>t.kind==='inline');
  expect(thread).toMatchObject({block_id:document.blocks[0].id,state:'resolved',created_at:source.createdAt,updated_at:source.updatedAt,resolved_at:source.resolvedAt,anchor_revision_id:document.workingRevisionId});
  expect(JSON.parse(thread.anchor_json).anchorId).toBe(document.blocks[0].content.text[0].commentAnchorId);
  const authors=new Map(original.authors.map((a:any)=>[a.id,a.displayName]));
  expect(await env.DB.prepare('SELECT display_name FROM members WHERE id=?').bind(thread.resolved_by_member_id).first<string>('display_name')).toBe(authors.get(source.resolvedBy));
  for(const t of original.threads)for(const c of t.comments){const restoredComment=restored.comments.find((item:any)=>item.createdAt===c.createdAt&&item.authorDisplayName===authors.get(c.authorId)&&JSON.stringify(item.body)===JSON.stringify(c.deletedAt?null:c.body));expect(restoredComment).toBeDefined();expect(restoredComment).toMatchObject({updatedAt:c.updatedAt,deletedAt:c.deletedAt});}
  const reply=restored.comments.find((c:any)=>c.parentCommentId);expect(restored.comments.some((c:any)=>c.id===reply.parentCommentId&&c.threadId===reply.threadId)).toBe(true);
  expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM members WHERE status='historical'").first<number>('n')).toBe(2);
  expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM notifications').first<number>('n')).toBe(notices);
  const secondImport=await upload(archive.bytes);expect((await json('POST',`/imports/${secondImport.id}/run`,{})).state).toBe('completed');
  const repeatedExport=await request('POST','/exports/readable',{scope:'workspace',id:'workspace',format:archive.format});
  expect(repeatedExport.status,repeatedExport.status!==200?await repeatedExport.text():'').toBe(200);
  // A tampered reply must fail before creating any native comment rows.
  const entries=unzipSync(archive.bytes),bad=structuredClone(archive.manifest);bad.pages.find((p:any)=>p.id===page).comments.threads[0].comments[0].parentCommentId='absent';entries['slate-readable.json']=strToU8(JSON.stringify(bad));
  const rejected=await upload(zipSync(entries));expect((await request('POST',`/imports/${rejected.id}/run`,{})).status).toBe(400);
  expect((await json('GET',`/comments/page/${copy.id}`)).comments).toEqual(restored.comments);
 }
});
