import { expect,test,vi } from 'vitest';
import { fixture,env,createUlid } from './fixture';
import { readRuntimeConfig } from '../../../src/core/platform/config/runtime';
import { invite,acceptInvitation } from '../../../src/core/features/workspace/invitations';

test('PAGE-006/BLOCK-008 local: covers persist across edits and history, typed image references keep scoped inline delivery and no URL fetch',async()=>{
  const f=await fixture(),page=await f.page('Appearance');
  const transport=vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('No network is authorized by this test'));
  try {
    let saved=await f.request('PATCH',`/api/pages/${page.id}`,{operationKey:createUlid(),expectedRevisionId:page.revisionId,properties:{cover:{kind:'gallery',id:'ocean'}}});
    expect(saved.status).toBe(200);
    expect((await f.request('GET',`/api/pages/${page.id}`)).data.properties.cover).toEqual({kind:'gallery',id:'ocean'});
    saved=await f.request('PATCH',`/api/pages/${page.id}`,{operationKey:createUlid(),expectedRevisionId:saved.data.value.revisionId,properties:{title:'Gallery retained'}});
    expect(saved.status).toBe(200);
    expect((await f.request('GET',`/api/pages/${page.id}`)).data.properties.cover).toEqual({kind:'gallery',id:'ocean'});
    const galleryRevision=saved.data.value.revisionId;
    saved=await f.request('PATCH',`/api/pages/${page.id}`,{operationKey:createUlid(),expectedRevisionId:galleryRevision,properties:{cover:{kind:'link',url:'https://images.example.invalid/cover.png'}}});
    expect(saved.status).toBe(200);
    expect((await f.request('GET',`/api/pages/${page.id}`)).data.properties.cover).toEqual({kind:'link',url:'https://images.example.invalid/cover.png'});
    expect(transport).not.toHaveBeenCalled();
    expect((await f.request('PATCH',`/api/pages/${page.id}`,{operationKey:createUlid(),expectedRevisionId:saved.data.value.revisionId,properties:{cover:{kind:'link',url:'javascript:alert(1)'}}})).status).toBe(400);
    const form=new FormData();form.set('operationKey',createUlid());form.set('pageId',page.id);form.set('file',new File(['<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><rect width="10" height="10" /></svg>'],'icon.svg',{type:'image/svg+xml'}));
    const upload=await f.api.request('http://localhost:8787/api/media',{method:'POST',headers:{cookie:f.cookies[f.ownerId]},body:form},env);
    expect(upload.status).toBe(200);const file=(await upload.json<any>()).value;
    saved=await f.request('PATCH',`/api/pages/${page.id}`,{operationKey:createUlid(),expectedRevisionId:saved.data.value.revisionId,properties:{coverFileId:file.id,icon:`file:${file.id}`}});
    expect(saved.status).toBe(200);
    expect((await f.request('GET',`/api/pages/${page.id}`)).data.properties).toMatchObject({cover:null,coverFileId:file.id,icon:`file:${file.id}`});
    const media=await f.api.request(`http://localhost:8787/api/media/${file.id}?display=icon`,{headers:{cookie:f.cookies[f.ownerId]}},env);
    expect(media.headers.get('content-disposition')).toContain('inline');expect(await media.text()).not.toContain('onload');
    expect((await f.api.request(`http://localhost:8787/api/media/${file.id}`,{headers:{cookie:f.cookies[f.ownerId]}},env)).headers.get('content-disposition')).toContain('attachment');
    const another=await f.page('Other');
    expect((await f.request('POST','/api/sharing',{operationKey:createUlid(),targetKind:'page',targetId:another.id,principalKind:'member',principalId:f.readerId,level:'edit'})).status).toBe(200);
    expect((await f.request('PATCH',`/api/pages/${another.id}`,{operationKey:createUlid(),expectedRevisionId:another.revisionId,properties:{icon:`file:${file.id}`}},f.readerId)).status).toBe(404);
    const restored=await f.request('POST',`/api/revisions/${page.id}/${galleryRevision}/restore`,{operationKey:createUlid(),expectedRevisionId:saved.data.value.revisionId});
    expect(restored.status).toBe(200);
    expect((await f.request('GET',`/api/pages/${page.id}`)).data.properties.cover).toEqual({kind:'gallery',id:'ocean'});
    const removed=await f.request('PATCH',`/api/pages/${page.id}`,{operationKey:createUlid(),expectedRevisionId:restored.data.value.revisionId,properties:{cover:null,coverFileId:null,icon:null}});
    expect(removed.status).toBe(200);
    expect((await f.request('GET',`/api/pages/${page.id}`)).data.properties).toMatchObject({cover:null,coverFileId:null,icon:null});
  } finally { transport.mockRestore(); }
});

test('SHARE-006/008/WORK-006 local: pending invitations retain requested level and expiry, acceptance preserves them and revoked or expired grants fail closed',async()=>{
  const f=await fixture(),page=await f.page('Guest sharing');
  const config={...readRuntimeConfig(env,false),appUrl:'https://slate.test.invalid',mailFrom:'Slate <mail@test.invalid>',mailApiKey:'test-only-no-network'};
  const tokens:string[]=[];
  // Explicit local mail transport double: no real email delivery or provider acceptance evidence.
  const mail=vi.spyOn(globalThis,'fetch').mockImplementation(async(_url,init)=>{const message=JSON.parse(String(init?.body));const token=/token=([^\s]+)/.exec(JSON.stringify(message))?.[1]?.split('\\n')[0];if(token)tokens.push(token);return Response.json({id:'test-local-delivery'});});
  try {
    const expiresAt=new Date(Date.now()+3600000).toISOString();
    const invited=await invite(f.ctx,config,{operationKey:createUlid(),email:'guest-core@test.invalid',kind:'guest',pageId:page.id,level:'edit',expiresAt});
    expect(invited.value).toEqual({accepted:true});
    const pending=(await f.request('GET',`/api/sharing/pages/${page.id}`)).data.items.find((g:any)=>g.invitationEmail==='guest-core@test.invalid');
    expect(pending).toMatchObject({level:'edit',expiresAt,status:'pending',effective:false});
    expect(Date.parse(pending.invitationExpiresAt)-Date.parse(f.ctx.now)).toBe(86400000);
    expect(await env.DB.prepare("SELECT id FROM members WHERE workspace_id=? AND email='guest-core@test.invalid'").bind(f.workspaceId).first()).toBeNull();
    expect(tokens).toHaveLength(1);
    await acceptInvitation(env.DB,config,tokens[0]!,{files:env.FILES,jobs:env.JOBS});
    const accepted=await env.DB.prepare('SELECT principal_id,level,expires_at FROM page_grants WHERE id=?').bind(pending.id).first<any>();
    expect(accepted).toMatchObject({level:'edit',expires_at:expiresAt});
    expect(accepted.principal_id).not.toContain('invitation:');
    await expect(acceptInvitation(env.DB,config,tokens[0]!,{files:env.FILES,jobs:env.JOBS})).rejects.toMatchObject({code:'LINK_INVALID'});
    await invite({...f.ctx,authorizationEpoch:undefined},config,{operationKey:createUlid(),email:'expired-core@test.invalid',kind:'guest',pageId:page.id,level:'comment',expiresAt});
    const expired=(await f.request('GET',`/api/sharing/pages/${page.id}`)).data.items.find((g:any)=>g.invitationEmail==='expired-core@test.invalid');
    await env.DB.prepare("UPDATE page_grants SET expires_at='2000-01-01T00:00:00.000Z' WHERE id=?").bind(expired.id).run();
    await expect(acceptInvitation(env.DB,config,tokens[1]!,{files:env.FILES,jobs:env.JOBS})).rejects.toMatchObject({code:'LINK_INVALID'});
    expect(await env.DB.prepare("SELECT id FROM members WHERE workspace_id=? AND email='expired-core@test.invalid'").bind(f.workspaceId).first()).toBeNull();
    expect((await f.request('POST','/api/sharing',{operationKey:createUlid(),targetKind:'page',targetId:page.id,id:expired.id,principalKind:'member',principalId:expired.principalId,level:'comment',revoke:true})).status).toBe(200);
    expect((await env.DB.prepare('SELECT revoked_at FROM invitations WHERE id=?').bind(expired.invitationId).first<any>()).revoked_at).toBeTruthy();
  } finally { mail.mockRestore(); }
});
