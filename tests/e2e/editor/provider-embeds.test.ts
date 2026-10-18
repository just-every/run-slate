import {env} from 'cloudflare:test';
import {beforeEach,expect} from 'vitest';
import {createApi} from '../../../src/core/app/hono';
import {contract} from '../contract';
import {resetDeployment} from '../setup/reset-deployment';
import {seedWorkspace,seedMember,seedContainer,seedContainerGrant,sessionFor} from '../setup/fixtures';

beforeEach(resetDeployment);
contract('EMBED-003','allowlisted embeds use isolated provider frames, authorized documents and published click gates',async()=>{
  const {workspaceId}=await seedWorkspace();
  const {memberId}=await seedMember(workspaceId,{role:'owner',email:'owner@slate.test',displayName:'Alex Owner',isSetupOwner:true});
  const {memberId:other}=await seedMember(workspaceId,{role:'member',email:'other@slate.test',displayName:'Other Member'});
  const {containerId}=await seedContainer(workspaceId,{ownerMemberId:memberId,visibility:'private'});
  await seedContainerGrant(containerId,{principalKind:'member',principalId:memberId,level:'full'});
  const cookie=await sessionFor(memberId),otherCookie=await sessionFor(other),api=createApi();
  const req=(path:string,body?:unknown,auth=cookie)=>api.request('https://slate.test'+path,{method:body?'POST':'GET',headers:{cookie:auth,origin:'https://slate.test','content-type':'application/json'},body:body?JSON.stringify(body):undefined},{...env,SLATE_PROFILE:undefined,PUBLIC_PAGE_HOST:"slate.test"});
  const urls=['https://www.figma.com/design/Abc123/Design','https://miro.com/app/board/uXjTest=/','https://lucid.app/documents/embedded/abcd-1234','https://www.loom.com/share/abcd1234','https://www.youtube.com/watch?v=dQw4w9WgXcQ','https://vimeo.com/12345678','https://docs.google.com/document/d/abc123/edit','https://docs.google.com/spreadsheets/d/def123/edit','https://docs.google.com/presentation/d/ghi123/edit','https://onedrive.live.com/embed?resid=123','https://team.sharepoint.com/sites/wiki/_layouts/15/Doc.aspx?sourcedoc=abc&action=embedview'];
  const blocks=urls.map((url,i)=>({id:crypto.randomUUID(),blockType:'link-card',content:{url,display:'embed',previewState:'ready',preview:{title:'Design review '+i}},treePosition:String(i).padStart(2,'0')}));
  const made=await req('/api/pages',{operationKey:crypto.randomUUID(),containerId,title:'Embedded planning documents',blocks});
  expect(made.status,await made.clone().text()).toBe(200);
  const {value:{pageId}}=await made.json<any>();
  const doc=await (await req(`/api/pages/${pageId}`)).json<any>();
  for(const block of blocks){
    const r=await req(`/api/pages/${pageId}/embeds/${block.id}`);
    expect(r.status).toBe(200);
    const body=await r.text();
    expect(body).toContain('sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation"');
    expect(body).toContain('referrerpolicy="no-referrer"');
    expect(r.headers.get('content-security-policy')).toMatch(/default-src 'none'.*frame-src https:/);
    expect((await req(`/api/pages/${pageId}/embeds/${block.id}`,undefined,otherCookie)).status).toBe(404);
  }
  const pub=await req(`/api/publishing/${pageId}`,{operationKey:crypto.randomUUID(),expectedRevisionId:doc.page.revisionId,host:'slate.test',slug:'planning'});
  expect(pub.status,await pub.clone().text()).toBe(200);
  const publicResponse=await req('/p/planning',undefined,'');
  expect(publicResponse.status).toBe(200);
  const markup=await publicResponse.text();
  expect(markup).toContain('Load YouTube embed');
  expect(markup).not.toMatch(/<iframe[^>]+src="https:/);
  expect(markup).toContain('<iframe hidden');
  expect(publicResponse.headers.get('content-security-policy')).toContain("script-src 'sha256-");
  expect((await req(`/p/planning/embeds/${blocks[0]!.id}`,undefined,'')).status).toBe(200);
  // Unpublishing fences both the document and every embedded resource.
  await req(`/api/publishing/${pageId}`,{operationKey:crypto.randomUUID(),expectedRevisionId:doc.page.revisionId,host:'slate.test',slug:'planning',revoke:true});
  expect((await req(`/p/planning/embeds/${blocks[0]!.id}`,undefined,'')).status).toBe(404);
  // A URL with a deceptive hostname is retained as a link but never becomes an iframe.
  const bad=await req('/api/pages',{operationKey:crypto.randomUUID(),containerId,title:'Untrusted link',blocks:[{...blocks[0],id:crypto.randomUUID(),content:{url:'https://youtube.com.attacker.test/watch?v=dQw4w9WgXcQ',display:'embed',previewState:'ready'}}]});
  expect(bad.status,await bad.clone().text()).toBe(200);
  const badId=(await bad.json<any>()).value.pageId;
  const badDoc=await (await req(`/api/pages/${badId}`)).json<any>();
  expect((await req(`/api/pages/${badId}/embeds/${badDoc.blocks[0].id}`)).status).toBe(404);
});
