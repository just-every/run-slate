import {beforeEach,it,expect} from 'vitest';
import {resetDeployment} from '../../e2e/setup/reset-deployment';
import {env} from 'cloudflare:test';
import {createUlid} from '../../../src/core/shared/ulid';
import {Hono} from 'hono';
import type {AppEnvironment,AuthenticatedMember} from '../../../src/core/app/types';
import {ApiProblem} from '../../../src/core/app/problems';
import {createPagesRoutes} from '../../../src/core/features/pages/routes';
import {createContainersRoutes} from '../../../src/core/features/containers/routes';
import {createRevisionsRoutes} from '../../../src/core/features/versions/routes';
import {createArchiveRoutes} from '../../../src/core/features/archive/routes';
import {createStatusRoutes} from '../../../src/core/features/page-status/routes';
import {createMediaRoutes} from '../../../src/core/features/media/routes';
import {createPublishingRoutes,createPublicPagesRoutes} from '../../../src/core/features/publishing/routes';
import {createCommentsRoutes} from '../../../src/core/features/comments/routes';
import {collaborationSnapshot,updatePresence,refreshPresence} from '../../../src/core/features/collaboration/service';
beforeEach(resetDeployment);
async function fixture(){
 const now=new Date().toISOString(),w=createUlid(),a=createUlid(),b=createUlid();
 await env.DB.prepare('INSERT INTO workspaces(id,name,mark,created_at,updated_at,revision_id) VALUES (?,?,?,?,?,?)').bind(w,'Repair','R',now,now,createUlid()).run();
 for(const id of [a,b])await env.DB.prepare("INSERT INTO members(id,workspace_id,email,display_name,initials,role,created_at,updated_at) VALUES (?,?,?,?,?,'owner',?,?)").bind(id,w,`${id}@repair.invalid`,id,'R',now,now).run();
 const actors=new Map([a,b].map(id=>[id,{id,workspaceId:w,workspaceName:'Repair',email:`${id}@repair.invalid`,displayName:id,initials:'R',role:'owner'} as AuthenticatedMember]));
 const app=new Hono<AppEnvironment>();app.use('*',async(c,next)=>{const actor=actors.get(c.req.header('x-test-actor')??'');if(actor)c.set('member',actor);await next();});app.onError((e,c)=>e instanceof ApiProblem?c.json({code:e.code,message:e.message},e.status):c.json({code:'ERROR',message:e.message},500));
 app.route('/api/pages',createPagesRoutes());app.route('/api/containers',createContainersRoutes());app.route('/api/revisions',createRevisionsRoutes());app.route('/api/archive',createArchiveRoutes());app.route('/api/status',createStatusRoutes());app.route('/api/media',createMediaRoutes());app.route('/api/publishing',createPublishingRoutes());app.route('/api/comments',createCommentsRoutes());app.route('/p',createPublicPagesRoutes());
 const request=async(method:string,path:string,body?:unknown,actor=a)=>{const r=await app.request(`https://local.test${path}`,{method,headers:{'content-type':'application/json','x-test-actor':actor},body:body===undefined?undefined:JSON.stringify(body)},env);return{status:r.status,data:await r.json<any>()};};
 const c=await request('POST','/api/containers',{operationKey:createUlid(),name:'Team'});expect(c.status).toBe(200);
 return {w,a,b,app,request,containerId:c.data.value.id,ctx:{db:env.DB,files:env.FILES,jobs:env.JOBS,actor:actors.get(a)!,now}};
}
const paragraph=(id=createUlid(),text='unchanged')=>({id,blockType:'paragraph',treePosition:'1',content:{text:[{text}]}});
async function page(f:Awaited<ReturnType<typeof fixture>>,blocks:any[]=[]){const r=await f.request('POST','/api/pages',{operationKey:createUlid(),containerId:f.containerId,title:'Page',blocks});expect(r.status,JSON.stringify(r.data)).toBe(200);return r.data.value;}
it('unpublished revision stays invisible after discard and a subsequent publication',async()=>{
 const f=await fixture();await env.DB.prepare('INSERT INTO workspace_policies VALUES (?,?,?)').bind(f.w,JSON.stringify({'page.lifecycle.v1':'draft-then-publish'}),f.ctx.now).run();await env.DB.prepare("UPDATE container_grants SET level='view' WHERE container_id=? AND principal_kind='workspace'").bind(f.containerId).run();
 const p=await page(f,[paragraph()]);const pub=await f.request('POST',`/api/pages/${p.pageId}/publish`,{operationKey:createUlid(),expectedRevisionId:p.revisionId});const draft=await f.request('PATCH',`/api/pages/${p.pageId}`,{operationKey:createUlid(),expectedRevisionId:pub.data.value.revisionId,properties:{title:'Secret'}});const secret=draft.data.value.revisionId;
 expect((await f.request('GET',`/api/revisions/${p.pageId}/${secret}`,undefined,f.b)).status).toBe(404);
 const discard=await f.request('POST',`/api/pages/${p.pageId}/discard-changes`,{operationKey:createUlid(),expectedRevisionId:secret});expect(discard.status).toBe(200);
 const pub2=await f.request('POST',`/api/pages/${p.pageId}/publish`,{operationKey:createUlid(),expectedRevisionId:discard.data.value.revisionId});expect(pub2.status).toBe(200);
 expect((await f.request('GET',`/api/revisions/${p.pageId}/${secret}`,undefined,f.b)).status).toBe(404);
 expect((await f.request('GET',`/api/revisions/${p.pageId}/${pub.data.value.revisionId}`,undefined,f.b)).status).toBe(200);
 expect((await f.request('GET',`/api/revisions/${p.pageId}`,undefined,f.b)).data.items.map((x:any)=>x.id)).not.toContain(secret);
 expect((await f.request('GET',`/api/revisions/${p.pageId}/${secret}`)).status).toBe(200);
});
it('creation rejects verified status and exact opens reject the stale delivered revision',async()=>{
 const f=await fixture();await f.request('POST','/api/status',{operationKey:createUlid(),key:'verified',label:'Verified',color:'#228855',requiresVerification:true});
 expect((await f.request('POST','/api/pages',{operationKey:createUlid(),containerId:f.containerId,title:'Forge',properties:{statusKey:'verified'}})).data.code).toBe('STATUS_COMMAND_REQUIRED');
 const p=await page(f),delivered=await f.request('GET',`/api/pages/${p.pageId}`);const changed=await f.request('PATCH',`/api/pages/${p.pageId}`,{operationKey:createUlid(),expectedRevisionId:p.revisionId,properties:{title:'New'}});
 expect((await f.request('POST',`/api/pages/${p.pageId}/open`,{operationKey:createUlid()})).data.code).toBe('EXACT_REVISION_REQUIRED');
 expect((await f.request('POST',`/api/pages/${p.pageId}/open`,{operationKey:createUlid(),revisionId:delivered.data.workingRevisionId})).data.code).toBe('STALE_REVISION');
 expect(await env.DB.prepare('SELECT 1 FROM content_page_opens WHERE page_id=?').bind(p.pageId).first()).toBeNull();
 const read=await f.request('GET',`/api/pages/${p.pageId}`);expect((await f.request('POST',`/api/pages/${p.pageId}/open`,{operationKey:createUlid(),revisionId:read.data.workingRevisionId})).status).toBe(200);
 const verified=await f.request('POST',`/api/status/page/${p.pageId}`,{operationKey:createUlid(),expectedRevisionId:changed.data.value.revisionId,statusKey:'verified',attestRevisionId:read.data.workingRevisionId});expect(verified.status,JSON.stringify(verified.data)).toBe(200);
 const duplicate=await f.request('POST',`/api/pages/${p.pageId}/duplicate`,{operationKey:createUlid(),containerId:f.containerId});expect(duplicate.status).toBe(200);expect((await f.request('GET',`/api/pages/${duplicate.data.value.pageId}`)).data.properties.statusKey).toBeNull();
});
it('archive restore rejects self/descendant parents while restoring a valid tree',async()=>{
 const f=await fixture(),p=await page(f);const child=await f.request('POST','/api/pages',{operationKey:createUlid(),containerId:f.containerId,parentPageId:p.pageId,title:'Child'});expect(child.status).toBe(200);
 expect((await f.request('POST',`/api/archive/${p.pageId}`,{operationKey:createUlid(),expectedRevisionId:p.revisionId,action:'archive'})).status).toBe(200);
 for(const parentPageId of [p.pageId,child.data.value.pageId]) expect((await f.request('POST',`/api/archive/${p.pageId}`,{operationKey:createUlid(),expectedRevisionId:p.revisionId,action:'restore',parentPageId})).data.code).toBe('TREE_CYCLE');
 expect((await f.request('POST',`/api/archive/${p.pageId}`,{operationKey:createUlid(),expectedRevisionId:p.revisionId,action:'restore',parentPageId:null})).status).toBe(200);
 expect((await f.request('GET',`/api/pages/${child.data.value.pageId}`)).data.parentPageId).toBe(p.pageId);
});
it('normalizes creation and structural task attribution and preserves existing completion',async()=>{
 const f=await fixture(),id=createUlid(),task={id,blockType:'task',treePosition:'1',content:{text:[{text:'Task'}],done:true,completedByMemberId:f.b,completedAt:'2000-01-01T00:00:00Z'}};
 const p=await page(f,[task]);let read=await f.request('GET',`/api/pages/${p.pageId}`);expect(read.data.blocks[0].content.completedByMemberId).toBe(f.a);const time=read.data.blocks[0].content.completedAt;expect(time).not.toBe(task.content.completedAt);
 const write=await f.request('PUT',`/api/pages/${p.pageId}/blocks`,{operationKey:createUlid(),expectedRevisionId:p.revisionId,blocks:[task]});expect(write.status).toBe(200);read=await f.request('GET',`/api/pages/${p.pageId}`);expect(read.data.blocks[0].content.completedAt).toBe(time);
 const undone=await f.request('PUT',`/api/pages/${p.pageId}/blocks`,{operationKey:createUlid(),expectedRevisionId:write.data.value.revisionId,blocks:[{...task,content:{...task.content,done:false}}]});expect(undone.status).toBe(200);expect((await f.request('GET',`/api/pages/${p.pageId}`)).data.blocks[0].content.completedByMemberId).toBeNull();
});
it('retains presence cursor/session on snapshot refresh and delivers it to peers',async()=>{
 const f=await fixture(),p=await page(f),cursor={blockId:'block',offset:7};await updatePresence(f.ctx,p.pageId,'session-one',cursor);await refreshPresence(f.ctx,p.pageId,'session-one');const snapshot=await collaborationSnapshot({...f.ctx,actor:{...f.ctx.actor,id:f.b}},p.pageId);expect(snapshot.presence).toContainEqual(expect.objectContaining({id:f.a,sessionId:'session-one',cursor}));
});
it('restores unchanged anchored text and orphans only anchors absent from the restored body',async()=>{
 const f=await fixture(),b=paragraph(),p=await page(f,[b]);const thread=await f.request('POST',`/api/comments/page/${p.pageId}`,{operationKey:createUlid(),kind:'inline',blockId:b.id,anchorRevisionId:p.revisionId,anchor:{anchorId:createUlid(),quote:'unchanged'},body:[{text:'Review'}]});expect(thread.status,JSON.stringify(thread.data)).toBe(200);
 const changed=await f.request('PATCH',`/api/pages/${p.pageId}`,{operationKey:createUlid(),expectedRevisionId:p.revisionId,properties:{title:'Title only'}});
 const restore=await f.request('POST',`/api/revisions/${p.pageId}/${p.revisionId}/restore`,{operationKey:createUlid(),expectedRevisionId:changed.data.value.revisionId});expect(restore.status,JSON.stringify(restore.data)).toBe(200);
 const row=await env.DB.prepare('SELECT block_id,orphaned FROM comment_threads WHERE page_id=?').bind(p.pageId).first();expect(row).toEqual({block_id:b.id,orphaned:0});
});
it('anonymous media rejects draft attachment but allows exact published attachment',async()=>{
 const f=await fixture(),p=await page(f);const upload=async()=>{const form=new FormData();form.set('operationKey',createUlid());form.set('pageId',p.pageId);form.set('file',new File(['secret bytes'],'private.txt',{type:'text/plain'}));const r=await f.app.request('https://local.test/api/media',{method:'POST',headers:{'x-test-actor':f.a},body:form},env);expect(r.status).toBe(200);return(await r.json<any>()).value;};
 const visible=await upload();const write=await f.request('PUT',`/api/pages/${p.pageId}/blocks`,{operationKey:createUlid(),expectedRevisionId:p.revisionId,blocks:[{id:createUlid(),blockType:'media',treePosition:'1',content:{kind:'file',source:{url:visible.url,fileId:visible.id,name:'private.txt'},caption:'',alt:''}}]});expect(write.status).toBe(200);
 const pub=await f.request('POST',`/api/publishing/${p.pageId}`,{operationKey:createUlid(),expectedRevisionId:write.data.value.revisionId,host:'local.test',slug:`repair-${p.pageId}`});expect(pub.status).toBe(200);const hidden=await upload();
 expect((await f.app.request(`https://local.test/p/repair-${p.pageId}/media/${hidden.id}`,{},env)).status).toBe(404);
 const allowed=await f.app.request(`https://local.test/p/repair-${p.pageId}/media/${visible.id}`,{},env);expect(allowed.status).toBe(200);expect(await allowed.text()).toBe('secret bytes');
});
it('native sockets deliver and retain shared cursors across refreshes',async()=>{
 const f=await fixture(),p=await page(f);const {sessionFor}=await import('../../e2e/setup/fixtures');const rooms=(env as unknown as {CONTENT_COLLABORATION:DurableObjectNamespace}).CONTENT_COLLABORATION;const room=rooms.get(rooms.idFromName(p.pageId));const sockets:WebSocket[]=[];
 const connect=async(actor:string)=>{const r=await room.fetch(`https://local.test/socket?pageId=${p.pageId}`,{headers:{Upgrade:'websocket',cookie:await sessionFor(actor)}});expect(r.status).toBe(101);const socket=r.webSocket!;socket.accept();sockets.push(socket);return socket;};
 try{const a=await connect(f.a),b=await connect(f.b),cursor={blockId:'shared-block',offset:9};
 const seen=()=>new Promise<any>((resolve,reject)=>{const timeout=setTimeout(()=>{b.removeEventListener('message',listen);reject(new Error('Cursor was not delivered'));},3500);const listen=(event:MessageEvent)=>{const m=JSON.parse(String(event.data));if(m.type==='snapshot'&&m.presence.some((p:any)=>p.id===f.a&&p.cursor?.offset===9)){clearTimeout(timeout);b.removeEventListener('message',listen);resolve(m);}};b.addEventListener('message',listen);});
 let delivered=seen();a.send(JSON.stringify({type:'presence',cursor}));expect((await delivered).presence).toContainEqual(expect.objectContaining({id:f.a,cursor}));
 delivered=seen();b.send(JSON.stringify({type:'refresh'}));expect((await delivered).presence).toContainEqual(expect.objectContaining({id:f.a,cursor}));
 }finally{for(const socket of sockets)socket.close();}
});
it('container metadata and archived listing expose stored policies and preserve personal privacy',async()=>{
 const f=await fixture();await env.DB.prepare("UPDATE containers SET guest_access='forbidden',anonymous_access='forbidden' WHERE id=?").bind(f.containerId).run();
 const metadata=await f.request('GET',`/api/containers/${f.containerId}`);expect(metadata.status).toBe(200);expect(metadata.data).toMatchObject({id:f.containerId,guestAccess:'forbidden',publicLinkAccess:'allowed',anonymousAccess:'forbidden',permissions:{canManage:true},archivedAt:null});
 const archive=await f.request('POST',`/api/containers/${f.containerId}/archive`,{operationKey:createUlid(),expectedRevisionId:metadata.data.revisionId});expect(archive.status).toBe(200);
 expect((await f.request('GET','/api/containers')).data.items).toHaveLength(0);const archived=await f.request('GET','/api/containers?archived=true');expect(archived.data.items[0]).toMatchObject({id:f.containerId,revisionId:archive.data.value.revisionId});
 const restore=await f.request('POST',`/api/containers/${f.containerId}/archive`,{operationKey:createUlid(),expectedRevisionId:archived.data.items[0].revisionId,restore:true});expect(restore.status).toBe(200);expect((await f.request('GET','/api/containers')).data.items).toHaveLength(1);
});
it('public header controls and social metadata render from explicit publication without private search results',async()=>{
 const f=await fixture(),parent=await page(f),child=await f.request('POST','/api/pages',{operationKey:createUlid(),containerId:f.containerId,parentPageId:parent.pageId,title:'Public child'});
 const expose=async(id:string,revision:string,slug:string,extra={})=>f.request('POST',`/api/publishing/${id}`,{operationKey:createUlid(),expectedRevisionId:revision,host:'local.test',slug,...extra});
 expect((await expose(parent.pageId,parent.revisionId,`ancestor-${parent.pageId}`)).status).toBe(200);
 expect((await expose(child.data.value.pageId,child.data.value.revisionId,`child-${parent.pageId}`,{headerControls:['search','breadcrumbs','duplicate'],duplicateAsTemplate:true,socialPreview:{title:'Social <title>',description:'Social description'}})).status).toBe(200);
 await f.request('POST','/api/pages',{operationKey:createUlid(),containerId:f.containerId,title:'Secret needle'});
 const request=async(q='')=>{const r=await f.app.request(`https://local.test/p/child-${parent.pageId}${q}`,{},env);expect(r.status).toBe(200);return r.text();};
 const ancestorLink=`href="/p/ancestor-${parent.pageId}"`;
 let html=await request('?q=needle');expect(html).toContain(ancestorLink);expect(html).toContain('role="search"');expect(html).toContain('Duplicate this page');expect(html).toContain('Social &lt;title&gt;');expect(html).toContain('No published pages found');expect(html).not.toContain('Secret needle');
 await env.DB.prepare("UPDATE public_exposures SET revoked_at=? WHERE page_id=?").bind(f.ctx.now,parent.pageId).run();html=await request();expect(html).not.toContain(ancestorLink);expect(html).toContain('aria-current="page">Public child');
 expect((await expose(child.data.value.pageId,child.data.value.revisionId,`child-${parent.pageId}`,{headerControls:[],duplicateAsTemplate:true})).status).toBe(200);html=await request('?q=Public');expect(html).not.toMatch(/role="search"|Duplicate this page|Search results/);
});
it('comment activity receives exact entity revision context in the atomic operation',async()=>{
 const f=await fixture(),p=await page(f);const {createComment,editComment,resolveThread}=await import('../../../src/core/features/comments/service');
 const comment=await createComment(f.ctx,p.pageId,{operationKey:createUlid(),body:[{text:'First'}]});
 const detail=async(activityId:string|null)=>JSON.parse((await env.DB.prepare('SELECT detail_json FROM activity_entries WHERE id=?').bind(activityId).first<{detail_json:string}>())!.detail_json);
 expect(await detail(comment.receipt.activityId)).toEqual({commentId:comment.value.id,revisionId:comment.value.revisionId});
 const edited=await editComment(f.ctx,comment.value.id,{operationKey:createUlid(),expectedRevisionId:comment.value.revisionId,body:[{text:'Edited'}]});expect(await detail(edited.receipt.activityId)).toEqual({commentId:comment.value.id,revisionId:edited.value.revisionId});
 const resolved=await resolveThread(f.ctx,comment.value.threadId,{operationKey:createUlid(),expectedRevisionId:edited.value.revisionId,resolved:true});expect(await detail(resolved.receipt.activityId)).toEqual({revisionId:resolved.value.revisionId});
});
