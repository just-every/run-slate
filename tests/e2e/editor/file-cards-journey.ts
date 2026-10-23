import {env} from 'cloudflare:test';
import {expect,vi} from 'vitest';
import {unzipSync,strFromU8} from 'fflate';
import {createApi} from '../../../src/core/app/hono';
import {resetDeployment} from '../setup/reset-deployment';
import {seedWorkspace,seedMember,sessionFor} from '../setup/fixtures';
/** Recorded provider responses only; every Slate operation uses the Worker routes. */
export async function fileCardsHttpJourney(){
 await resetDeployment();
 const {workspaceId}=await seedWorkspace({name:'synthetic-slate-1'});
 const owner=(await seedMember(workspaceId,{email:'synthetic-slate-1@example.test',displayName:'Alex Owner',role:'owner',isSetupOwner:true})).memberId;
 const reader=(await seedMember(workspaceId,{email:'synthetic-slate-2@example.test',displayName:'Morgan Reader',role:'member'})).memberId;
 const bindings={...env,SLATE_PROFILE:undefined,CONNECTOR_CREDENTIALS_KEY:'synthetic-slate-100000000000000000000000009'},app=createApi(),key=()=>crypto.randomUUID();
 const ownerCookie=await sessionFor(owner,{freshProof:true}),readerCookie=await sessionFor(reader,{freshProof:true});let cookie=ownerCookie;
 const tokens=['synthetic-slate-701','synthetic-slate-702'];let title='Recovery notes',deleted=false,identityChanged=false,aclFailed=false,held:Promise<void>|undefined,arrived:(()=>void)|undefined;const requests:string[]=[];
 const edge=vi.spyOn(globalThis,'fetch').mockImplementation(async(input,init)=>{
  const request=new Request(input,init),url=new URL(request.url),isReader=request.headers.get('authorization')===`Bearer ${tokens[1]}`;
  expect(['https://www.googleapis.com','https://graph.microsoft.com'].includes(url.origin)).toBe(true);
  expect(tokens.some(token=>request.headers.get('authorization')===`Bearer ${token}`)).toBe(true);
  requests.push(url.pathname);const json=(value:unknown)=>Response.json(value);
  if(url.pathname==='/oauth2/v3/userinfo')return json({sub:identityChanged?'synthetic-slate-799':isReader?'synthetic-slate-712':'synthetic-slate-711',email:isReader?'synthetic-slate-2@example.test':'synthetic-slate-1@example.test',email_verified:true});
  if(url.pathname==='/v1.0/me')return json({id:identityChanged?'synthetic-slate-799':isReader?'synthetic-slate-722':'synthetic-slate-721',mail:isReader?'synthetic-slate-2@example.test':'synthetic-slate-1@example.test',userPrincipalName:isReader?'synthetic-slate-2@example.test':'synthetic-slate-1@example.test'});
  if(isReader)return new Response(null,{status:403});
  if(aclFailed)return new Response(null,{status:500});
  if(deleted)return new Response(null,{status:404});
  if(held){arrived?.();await held;}
  const google={id:'synthetic-slate-731',name:title,mimeType:'application/pdf',modifiedTime:'2026-10-21T10:00:00.000Z',owners:[{displayName:'Alex Owner'}]};
  const graph={id:'synthetic-slate-732',name:title,webUrl:'https://synthetic-slate-1.sharepoint.com/Recovery/document',file:{mimeType:'application/pdf'},lastModifiedDateTime:'2026-10-21T10:00:00.000Z',shared:{owner:{user:{displayName:'Alex Owner'}}}};
  if(url.pathname==='/drive/v3/files')return json({files:[google]});
  if(url.pathname.endsWith('/children'))return json({value:[graph]});
  if(url.pathname==='/drive/v3/files/'+google.id)return json(google);
  if(url.pathname.endsWith('/items/'+graph.id))return json(graph);
  throw Error('Unexpected recorded provider path');
 });
 const raw=(method:string,path:string,body?:unknown)=>app.request('https://slate.test'+path,{method,headers:{cookie,origin:'https://slate.test','content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)},bindings);
 const api=async(method:string,path:string,body?:unknown)=>{const response=await raw(method,path,body);expect(response.status).toBe(200);return response.json<any>();};
 try{
  const space=(await api('POST','/api/containers',{operationKey:key(),name:'Harbor handbook'})).value.id;
  await api('POST','/api/sharing',{operationKey:key(),targetKind:'container',targetId:space,principalKind:'member',principalId:reader,level:'view'});
  const pageId=(await api('POST','/api/pages',{operationKey:key(),containerId:space,title:'Connected recovery records'})).value.pageId;
  const references=[];
  for(const provider of ['google-drive','sharepoint'] as const){
   await api('PUT','/api/imports/provider-folders/policy',{operationKey:key(),provider,enabled:true});
   const connection=(await api('POST','/api/imports/provider-folders/connections',{operationKey:key(),provider,token:tokens[0],...(provider==='sharepoint'?{driveId:'synthetic-slate-733'}:{})})).value;
   const picked=await api('GET',`/api/imports/provider-folders/files?connectionId=${connection.id}&folderId=root`);
   expect(picked.items.length===1&&picked.items[0].title===title).toBe(true);
   const item=picked.items[0],reference={provider:item.provider,fileId:item.fileId,url:item.url},blockId=key();references.push(reference);
   const doc=await api('GET',`/api/pages/${pageId}`);
   await api('PUT',`/api/pages/${pageId}/blocks`,{operationKey:key(),expectedRevisionId:doc.page.revisionId,blocks:[{id:blockId,blockType:'file-card',treePosition:'1',content:reference}]});
   expect((await raw('POST','/api/pages',{operationKey:key(),containerId:space,title:'Untrusted reference',blocks:[{id:key(),blockType:'file-card',treePosition:'1',content:{...reference,url:'https://synthetic-slate-1.example.test/file'}}]})).status).toBe(400);
   const route=`/api/pages/${pageId}/file-cards/${blockId}`;
   expect(await api('GET',route)).toEqual({state:'readable',reference,metadata:{title,owner:'Alex Owner',modifiedAt:'2026-10-21T10:00:00.000Z',type:'application/pdf'}});
   title='Recovery notes revised';expect((await api('GET',route)).metadata.title).toBe(title);
   identityChanged=true;expect(await api('GET',route)).toEqual({state:'request-access',connect:false});identityChanged=false;
   aclFailed=true;expect(await api('GET',route)).toEqual({state:'failed'});aclFailed=false;
   cookie=readerCookie;expect(await api('GET',route)).toEqual({state:'request-access',connect:true});
   await api('POST','/api/imports/provider-folders/connections',{operationKey:key(),provider,token:tokens[1],...(provider==='sharepoint'?{driveId:'synthetic-slate-733'}:{})});
   expect(await api('GET',route)).toEqual({state:'request-access',connect:false});
   cookie=ownerCookie;deleted=true;expect(await api('GET',route)).toEqual({state:'unavailable'});deleted=false;
   const stored=await api('GET',`/api/pages/${pageId}`);expect(stored.blocks[0].content).toEqual(reference);
   const exported=await raw('POST','/api/exports/readable',{scope:'page',id:pageId,format:'markdown'});expect(exported.status).toBe(200);
   const entries=unzipSync(new Uint8Array(await exported.arrayBuffer())),all=Object.values(entries).map(bytes=>strFromU8(bytes)).join(' ');
   const manifest=JSON.parse(strFromU8(entries['slate-readable.json']!));expect({reference:manifest.pages[0].blocks[0].content,media:manifest.media}).toEqual({reference,media:[]});
   expect(!tokens.some(token=>all.includes(token))&&!all.includes(title)&&!all.includes('Alex Owner')&&!requests.some(path=>/\/content$|\/export$/.test(path))).toBe(true);
   let release!:()=>void;const reached=new Promise<void>(resolve=>{arrived=resolve;});held=new Promise<void>(resolve=>{release=resolve;});
   const pending=api('GET',route);await reached;
   await api('DELETE',`/api/imports/provider-folders/connections/${connection.id}`,{operationKey:key(),expectedRevisionId:connection.revisionId});
   release();held=undefined;arrived=undefined;expect(await pending).toEqual({state:'request-access',connect:false});
   expect({card:await api('GET',route),reference:(await api('GET',`/api/pages/${pageId}`)).blocks[0].content,credential:await env.DB.prepare('SELECT credential_ciphertext FROM provider_folder_connections WHERE id=?').bind(connection.id).first('credential_ciphertext')}).toEqual({card:{state:'request-access',connect:true},reference,credential:null});
   title='Recovery notes';
  }
 }finally{edge.mockRestore();}
}
