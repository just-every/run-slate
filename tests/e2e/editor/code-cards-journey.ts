import contractText from '../../../CONTRACT.md?raw';
import {env} from 'cloudflare:test';
import {expect,vi} from 'vitest';
import {unzipSync,strFromU8} from 'fflate';
import {createApi} from '../../../src/core/app/hono';
import {resetDeployment} from '../setup/reset-deployment';
import {seedWorkspace,seedMember,sessionFor} from '../setup/fixtures';

export async function codeCardsHttpJourney(){
 const gap=contractText.split('\n').find(line=>line.startsWith('| `EMBED-002` |'));expect(gap).toContain('OAuth apps');expect(gap).toContain('self-hosted GitLab');
 await resetDeployment();
 const key=()=>crypto.randomUUID(),{workspaceId}=await seedWorkspace();
 const owner=(await seedMember(workspaceId,{email:'synthetic-slate-1@example.test',displayName:'Alex Owner',role:'owner',isSetupOwner:true})).memberId;
 const reader=(await seedMember(workspaceId,{email:'synthetic-slate-2@example.test',displayName:'Morgan Reader',role:'member'})).memberId;
 const removed=(await seedMember(workspaceId,{email:'synthetic-slate-3@example.test',displayName:'Sam Removed',role:'member'})).memberId;
 const removedCookie=await sessionFor(removed,{freshProof:true});
 const ownerCookie=await sessionFor(owner,{freshProof:true}),readerCookie=await sessionFor(reader,{freshProof:true});let cookie=ownerCookie;
 const bindings={...env,SLATE_PROFILE:undefined,CONNECTOR_CREDENTIALS_KEY:'synthetic-slate-'+key(),PUBLIC_PAGE_HOST:'slate.test'},app=createApi(),origin='https://slate.test';
 const raw=(method:string,path:string,body?:unknown)=>app.request(origin+path,{method,headers:{cookie,origin,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)},bindings);
 const responses:string[]=[];
 const logs=[vi.spyOn(console,'log'),vi.spyOn(console,'warn'),vi.spyOn(console,'error')];
 const api=async(method:string,path:string,body?:unknown)=>{const r=await raw(method,path,body);const receipt=await r.clone().text();responses.push(receipt);expect(r.status,receipt).toBe(200);return r.json<any>();};
 const space=(await api('POST','/api/containers',{operationKey:key(),name:'Code review handbook'})).value.id;
 await api('POST','/api/sharing',{operationKey:key(),targetKind:'container',targetId:space,principalKind:'member',principalId:reader,level:'view'});
 const pinned='1'.repeat(40),head='2'.repeat(40),tokens=new Map<string,{reader:boolean;provider:string;removed?:boolean}>();
 const credentials=Object.fromEntries(['github','gitlab'].map(provider=>[provider,[false,true].map(isReader=>{const token='synthetic-slate-'+key();tokens.set(token,{reader:isReader,provider});return token;})])) as Record<string,string[]>;
 const requests:Request[]=[];let mode='normal',state='open',moved=false,identityChanged=false,identityReads=0,failRefresh=false,held:Promise<void>|undefined,arrived:(()=>void)|undefined;
 const edge=vi.spyOn(globalThis,'fetch').mockImplementation(async(input,init)=>{
  const request=new Request(input,init),url=new URL(request.url);requests.push(request);
  expect(['https://api.github.com','https://gitlab.com']).toContain(url.origin);expect(request.method).toBe('GET');expect(request.redirect).toBe('manual');expect(request.headers.get('cookie')).toBeNull();
  const token=request.headers.get('authorization')?.replace(/^Bearer /,''),identity=tokens.get(token??'');expect(identity).toBeTruthy();expect(url.origin=== 'https://api.github.com'?'github':'gitlab').toBe(identity!.provider);
  const gh=identity!.provider==='github',person=identity!.removed?'Removed':identity!.reader?'Reader':'Owner',email=identity!.removed?'synthetic-slate-3@example.test':identity!.reader?'synthetic-slate-2@example.test':'synthetic-slate-1@example.test',user={id:identityChanged?'changed':identity!.removed?3:identity!.reader?2:1,login:person.toLowerCase(),username:person.toLowerCase()};
  const json=(value:unknown)=>Response.json(value,{headers:gh&&mode!=='no-scopes'?{'x-oauth-scopes':mode==='write-scopes'?'repo, user:email':'read:user, user:email'}:{}});
  if(url.pathname==='/api/v4/personal_access_tokens/self')return json({scopes:mode==='write-scopes'?['api']:['read_api','read_repository']});
  if(mode==='timeout')return new Promise<Response>((_resolve,reject)=>request.signal.addEventListener('abort',()=>reject(Error('Provider deadline')),{once:true}));
  if(mode==='oversize')return new Response('x'.repeat(512*1024+1));
  if(mode==='redirect')return new Response(null,{status:302,headers:{location:'https://attacker.test/private'}});
  if(mode==='403'||mode==='404')return new Response(null,{status:Number(mode)});
  if(url.pathname==='/user'||url.pathname==='/api/v4/user'){identityReads++;if(failRefresh&&identityReads>1)return new Response(null,{status:503});return json(user);}
  if(url.pathname==='/user/emails'||url.pathname==='/api/v4/user/emails'){
   const address={email,verified:true,confirmed_at:'2026-10-25T00:00:00Z'};return json(mode==='unmapped'?[]:mode==='ambiguous'?[address,address]:[address]);
  }
  if(held){arrived?.();await held;}
  if(/\/check-runs$/.test(url.pathname))return json({check_runs:[{name:'Build',status:'completed',conclusion:'success'}]});
  if(/\/statuses$/.test(url.pathname))return json([{name:'Pipeline',status:'success'}]);
  if(url.pathname.includes('/contents/')||url.pathname.includes('/repository/files/')){
   const current=url.searchParams.get('ref')===(moved?'3'.repeat(40):head);
   return new Response('first\n'+(current&&moved?'changed line':'pinned <script> line')+'\nthird\n');
  }
  if(gh&&/\/commits\/main$/.test(url.pathname))return json({sha:moved?'3'.repeat(40):head});
  if(!gh&&/\/repository\/branches\/main$/.test(url.pathname))return json({commit:{id:moved?'3'.repeat(40):head}});
  if(/\/(?:pulls|merge_requests)\/7$/.test(url.pathname))return json({title:person+' review',state:state==='merged'&&gh?'closed':state==='open'&&!gh?'opened':state,merged:state==='merged',draft:state==='draft',user,author:user,updated_at:'2026-10-25T00:00:00Z',head:{sha:pinned},sha:pinned});
  if(/\/issues\/8$/.test(url.pathname))return json({title:person+' issue',state,user,author:user,updated_at:'2026-10-25T00:00:00Z'});
  if(url.pathname.includes('/releases/'))return json({name:person+' release',tag_name:'v1',draft:state==='draft',author:user,published_at:'2026-10-25T00:00:00Z',released_at:'2026-10-25T00:00:00Z',commit:{id:pinned}});
  if(url.pathname.includes('/commits/'))return json({id:pinned,sha:pinned,title:person+' commit',author_name:person,committed_date:'2026-10-25T00:00:00Z',author:user,commit:{message:person+' commit',author:{name:person,date:'2026-10-25T00:00:00Z'}}});
  if(gh&&url.pathname==='/repos/synthetic-slate/project'||!gh&&url.pathname==='/api/v4/projects/synthetic-slate%2Fproject')return json({default_branch:'main'});
  throw Error('Unexpected recorded code-provider path '+url.pathname);
 });
 const connectionIds:string[]=[],pages:string[]=[],cardPaths:string[]=[];
 try{
  for(const provider of ['github','gitlab']){
   cookie=ownerCookie;state='open';moved=false;mode='normal';identityChanged=false;
   const base=provider==='github'?'https://github.com/synthetic-slate/project':'https://gitlab.com/synthetic-slate/project/-';
   const urls=[base+(provider==='github'?'/pull/7':'/merge_requests/7'),base+'/issues/8',base+'/commit/'+pinned,base+(provider==='github'?'/releases/tag/v1':'/releases/v1'),base+'/blob/'+pinned+'/src/main.ts#L2-L3'];
   const blocks=urls.map((url,i)=>({id:key(),blockType:'link-card',treePosition:String(i),content:{url,display:'card',previewState:'ready',preview:{title:'Do not retain fetched metadata'}}}));
   const page=(await api('POST','/api/pages',{operationKey:key(),containerId:space,title:'Source review '+provider,blocks})).value.pageId;pages.push(page);
   const card=(i:number)=>'/api/pages/'+page+'/code-cards/'+blocks[i]!.id;cardPaths.push(card(0));
   const badUrls=[base+'/blob/'+pinned+'/src/main.ts#L1-L201',base+'/blob/main/src/main.ts#L2-L3',urls[0]!.replace(provider+'.com',provider+'.com.attacker.test'),base+'/blob/'+pinned+'/%2e%2e%2f%2e%2e%2fuser%2femails#L1',base+'/blob/'+pinned+'/src%2fmain.ts#L2-L3',...(provider==='gitlab'?[urls[0]!.replace('gitlab.com','gitlab.synthetic-slate.test')]:[])];
   const badBlocks=badUrls.map((url,i)=>({id:key(),blockType:'link-card',treePosition:String(i),content:{url,display:'card',previewState:'ready'}}));
   const badPage=(await api('POST','/api/pages',{operationKey:key(),containerId:space,title:'Untrusted code references',blocks:badBlocks})).value.pageId;
   requests.length=0;for(const block of badBlocks)expect((await raw('GET','/api/pages/'+badPage+'/code-cards/'+block.id)).status).toBe(404);expect(requests).toHaveLength(0);

   requests.length=0;expect(await api('GET',card(0))).toEqual({state:'connect'});expect(requests).toHaveLength(0);
   mode='write-scopes';
   const refused=await raw('POST','/api/embed-connections',{operationKey:key(),provider,token:credentials[provider]![0]});
   expect(refused.status).toBe(400);expect((await refused.json<any>()).message).toBe('Use a read-only personal access token.');
   expect(await env.DB.prepare('SELECT id FROM code_embed_connections WHERE workspace_id=? AND member_id=? AND provider=?').bind(workspaceId,owner,provider).first()).toBeNull();
   mode='normal';
   if(provider==='github'){
    mode='no-scopes';const fine=(await api('POST','/api/embed-connections',{operationKey:key(),provider,token:credentials[provider]![0]})).value;
    await api('DELETE','/api/embed-connections/'+encodeURIComponent(fine.id),{operationKey:key(),expectedRevisionId:fine.revisionId});mode='normal';
   }
   const connection=(await api('POST','/api/embed-connections',{operationKey:key(),provider,token:credentials[provider]![0]})).value;connectionIds.push(connection.id);
   const cipher=await env.DB.prepare('SELECT credential_ciphertext FROM code_embed_connections WHERE id=?').bind(connection.id).first<string>('credential_ciphertext');expect(cipher).toBeTruthy();expect(cipher).not.toContain(credentials[provider]![0]);
   const list=await api('GET','/api/embed-connections');expect(JSON.stringify(list)).not.toContain(cipher);expect(JSON.stringify(list)).not.toContain(credentials[provider]![0]);
   for(const next of ['open','closed','merged','draft']){state=next;const value=await api('GET',card(0));expect(value.state).toBe('readable');expect(value.metadata).toMatchObject({title:'Owner review',state:next,checks:[{name:provider==='github'?'Build':'Pipeline',state:'success'}]});}
   state='closed';expect((await api('GET',card(1))).metadata).toMatchObject({state:'closed',title:'Owner issue'});
   expect((await api('GET',card(2))).metadata).toMatchObject({state:'committed',title:'Owner commit',checks:[{name:provider==='github'?'Build':'Pipeline',state:'success'}]});
   for(const next of ['released','draft']){state=next;expect((await api('GET',card(3))).metadata).toMatchObject({state:next,title:'Owner release'});}
   const before=await api('GET',card(4));expect(before.metadata.code).toMatchObject({sha:pinned,first:2,lines:['pinned <script> line','third'],changed:false,branch:'main',head});
   moved=true;const changed=await api('GET',card(4));expect(changed.metadata.code).toMatchObject({sha:pinned,lines:['pinned <script> line','third'],changed:true,branch:'main',head:'3'.repeat(40)});
   const saved=await api('GET','/api/pages/'+page);expect(JSON.stringify(saved.blocks)).not.toContain('Do not retain fetched metadata');expect(saved.blocks.every((b:any)=>b.content.source&&b.content.preview===undefined)).toBe(true);
   cookie=readerCookie;expect(await api('GET',card(0))).toEqual({state:'connect'});
   const readerConnection=(await api('POST','/api/embed-connections',{operationKey:key(),provider,token:credentials[provider]![1]})).value;expect((await api('GET',card(0))).metadata.title).toBe('Reader review');
   cookie=ownerCookie;expect((await raw('DELETE','/api/embed-connections/'+encodeURIComponent(readerConnection.id),{operationKey:key(),expectedRevisionId:readerConnection.revisionId})).status).toBe(404);
   for(const [failure,want] of [['403','request-access'],['404','unavailable'],['redirect','unavailable'],['oversize','failed'],['unmapped','request-access'],['ambiguous','request-access']]){
    mode=failure!;expect(await api('GET',card(0))).toEqual({state:want});
   }
   mode='normal';identityChanged=true;expect(await api('GET',card(0))).toEqual({state:'request-access'});identityChanged=false;
   identityReads=0;failRefresh=true;expect(await api('GET',card(0))).toEqual({state:'failed'});failRefresh=false;
   if(provider==='github'){mode='timeout';const started=Date.now();expect(await api('GET',card(0))).toEqual({state:'failed'});expect(Date.now()-started).toBeLessThan(6000);mode='normal';}
   const doc=await api('GET','/api/pages/'+page);
   await api('POST','/api/publishing/'+page,{operationKey:key(),expectedRevisionId:doc.page.revisionId,host:'slate.test',slug:'source-review-'+provider});
   requests.length=0;const publicResponse=await app.request(origin+'/p/source-review-'+provider,{},bindings);expect(publicResponse.status).toBe(200);const markup=await publicResponse.text();expect(markup).toContain(provider==='github'?'GitHub link':'GitLab link');expect(markup).not.toContain('Owner review');expect(requests).toHaveLength(0);
   for(const format of ['html','markdown']){const exported=await raw('POST','/api/exports/readable',{scope:'page',id:page,format});expect(exported.status).toBe(200);const all=Object.values(unzipSync(new Uint8Array(await exported.arrayBuffer()))).map(bytes=>strFromU8(bytes)).join(' ');expect(all).not.toContain('Owner review');expect(all).not.toContain('pinned <script> line');expect(all).not.toContain(credentials[provider]![0]);expect(requests).toHaveLength(0);}
   let release!:()=>void;const reached=new Promise<void>(resolve=>{arrived=resolve;});held=new Promise<void>(resolve=>{release=resolve;});
   const pending=api('GET',card(0));await reached;
   await api('DELETE','/api/embed-connections/'+encodeURIComponent(connection.id),{operationKey:key(),expectedRevisionId:connection.revisionId});
   release();held=undefined;arrived=undefined;expect(await pending).toEqual({state:'request-access'});
   expect(await env.DB.prepare('SELECT credential_ciphertext FROM code_embed_connections WHERE id=?').bind(connection.id).first('credential_ciphertext')).toBeNull();
   expect(await api('GET',card(0))).toEqual({state:'connect'});
   await api('POST','/api/embed-connections',{operationKey:key(),provider,token:credentials[provider]![0]});
  }
  cookie=ownerCookie;
  await api('POST','/api/sharing',{operationKey:key(),targetKind:'container',targetId:space,principalKind:'member',principalId:removed,level:'view'});
  for(const provider of ['github','gitlab']){
   const token='synthetic-slate-'+key();tokens.set(token,{reader:false,provider,removed:true});cookie=removedCookie;
   await api('POST','/api/embed-connections',{operationKey:key(),provider,token});
  }
  cookie=ownerCookie;
  expect((await env.DB.prepare('SELECT id FROM code_embed_connections WHERE member_id=?').bind(removed).all()).results).toHaveLength(2);
  await api('POST','/api/members/remove',{operationKey:key(),memberId:removed});
  expect((await env.DB.prepare('SELECT id FROM code_embed_connections WHERE member_id=?').bind(removed).all()).results).toEqual([]);
  cookie=removedCookie;requests.length=0;expect((await raw('GET',cardPaths[0]!)).status).toBe(401);expect(requests).toHaveLength(0);cookie=ownerCookie;
  expect((await env.DB.prepare('SELECT id FROM code_embed_connections WHERE member_id=?').bind(reader).all()).results).toHaveLength(2);
  await api('POST','/api/members/remove',{operationKey:key(),memberId:reader,erase:true});
  expect((await env.DB.prepare('SELECT * FROM code_embed_connections WHERE member_id=?').bind(reader).all()).results).toEqual([]);
  cookie=readerCookie;requests.length=0;expect((await raw('GET',cardPaths[0]!)).status).toBe(401);expect(requests).toHaveLength(0);cookie=ownerCookie;
  const exported=await api('POST','/api/exports/workspace',{operationKey:key()}),download=await raw('GET','/api/exports/'+exported.id+'/download');expect(download.status).toBe(200);
  const bytes=new Uint8Array(await download.arrayBuffer()),entries=unzipSync(bytes),manifest=JSON.parse(strFromU8(entries['manifest.json']!)),all=Object.values(entries).map(bytes=>strFromU8(bytes)).join(' ');
  expect(manifest.tables.code_embed_connections.length).toBe(2);expect(manifest.tables.code_embed_connections.every((r:any)=>r.credential_ciphertext===null&&r.state==='disconnected')).toBe(true);
  const logged=logs.flatMap(log=>log.mock.calls.flatMap(call=>call.map(value=>value instanceof Error?value.message+' '+value.stack:typeof value==='string'?value:JSON.stringify(value)))).join('\n');
  for(const token of tokens.keys()){expect(all).not.toContain(token);expect(logged).not.toContain(token);expect(responses.join(' ')).not.toContain(token);}
  await resetDeployment();const target=(await seedWorkspace()).workspaceId,targetOwner=(await seedMember(target,{email:'synthetic-slate-1@example.test',displayName:'Alex Owner',role:'owner',isSetupOwner:true})).memberId;
  const targetCookie=await sessionFor(targetOwner,{freshProof:true}),form=new FormData();form.set('file',new File([bytes],'source-cards.zip',{type:'application/zip'}));
  requests.length=0;const restored=await app.request(origin+'/api/exports/restore',{method:'POST',headers:{cookie:targetCookie,origin},body:form},bindings);expect(restored.status,await restored.clone().text()).toBe(200);
  expect((await env.DB.prepare('SELECT credential_ciphertext,state FROM code_embed_connections').all()).results.every((r:any)=>r.credential_ciphertext===null&&r.state==='disconnected')).toBe(true);expect(requests).toHaveLength(0);
 }finally{held=undefined;edge.mockRestore();for(const log of logs)log.mockRestore();}
}
