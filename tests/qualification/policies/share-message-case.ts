import {env} from 'cloudflare:test';
import {expect,vi} from 'vitest';
import seed from '../../../seed.json';
import {createApi} from '../../../src/core/app/hono';
import {followingFixture} from '../../flagship/discovery/following-support';
import {resetDeployment} from '../../e2e/setup/reset-deployment';
export async function shareMessageCase(){
 await resetDeployment();
 const f=await followingFixture({defaultProfile:true}),{owner,editor,commenter,key,ok,request}=f;
 const pageId=(await f.create('Support handover')).value.pageId;
 await ok(owner,'POST','/api/sharing',{operationKey:key(),targetKind:'container',targetId:f.containerId,id:f.grants[2].grantId,principalKind:'member',principalId:commenter,level:'edit',revoke:true});
 const group=(await ok(owner,'POST','/api/groups',{operationKey:key(),name:'Support team',memberIds:[editor,commenter]})).value.id;
 const email=(await env.DB.prepare('SELECT email FROM members WHERE id=?').bind(editor).first<{email:string}>())!.email;
 const message='Please review <b>this handover</b>.\nBring the checklist.';
 const body={operationKey:key(),recipients:[{kind:'group',id:group},{kind:'member',id:editor},{kind:'email',email},{kind:'email',email:'synthetic-slate-partner@example.test'}],message};
 const sent=await ok(owner,'POST',`/api/sharing/pages/${pageId}/message`,body);
 expect(sent.value.readable.map((p:any)=>p.id)).toEqual([editor]);expect(sent.value.needsAccess.map((p:any)=>p.id)).toEqual([commenter]);
 await ok(owner,'POST',`/api/sharing/pages/${pageId}/message`,body);
 const shared=async(actor:string)=>(await ok(actor,'GET','/api/notifications')).items.filter((n:any)=>n.event==='page-shared');
 expect(await shared(editor)).toHaveLength(1);expect((await shared(editor))[0]).toMatchObject({title:'Support handover',sender:{id:owner},detail:{share:{message}},href:`/app/pages/${pageId}`});
 expect(await shared(commenter)).toEqual([]);
 expect((await request(commenter,'GET',`/api/pages/${pageId}`)).status).toBe(404);
 expect((await request(owner,'POST',`/api/sharing/pages/${pageId}/message`,{...body,operationKey:key(),message:'x'.repeat(seed.limits.shareMessageCharacters+1)})).status).toBe(400);
 expect((await ok(owner,'GET','/api/activity?action=sharing.message')).items.find((a:any)=>a.id===sent.value.shareId).message).toBe(message);
 expect((await ok(editor,'GET','/api/activity?action=sharing.message')).items.find((a:any)=>a.id===sent.value.shareId).message).toBeUndefined();
 expect((await ok(commenter,'GET','/api/activity?action=sharing.message')).items).toEqual([]);
 expect((await request(editor,'POST',`/api/sharing/pages/${pageId}/message/grant`,{operationKey:key(),shareId:sent.value.shareId,memberId:commenter})).status).toBe(404);
 const confirmation={operationKey:key(),shareId:sent.value.shareId,memberId:commenter};
 await ok(owner,'POST',`/api/sharing/pages/${pageId}/message/grant`,confirmation);
 await ok(owner,'POST',`/api/sharing/pages/${pageId}/message/grant`,confirmation);
 await ok(owner,'POST',`/api/sharing/pages/${pageId}/message/grant`,{...confirmation,operationKey:key()});
 expect(await shared(commenter)).toHaveLength(1);expect((await shared(commenter))[0].detail.share.message).toBe(message);expect(await shared(editor)).toHaveLength(1);
 expect((await ok(commenter,'GET','/api/notifications')).items.filter((n:any)=>n.event==='access-granted')).toEqual([]);
 // The existing invitation transport carries only its acceptance link. The share
 // message is admitted to the inbox in the same batch as accepted page access.
 const deliveries:string[]=[];const provider=vi.spyOn(globalThis,'fetch').mockImplementation(async(_url,init)=>{deliveries.push(String(init?.body));return Response.json({id:'synthetic-slate-mail-receipt'});});
 try{
  const api=createApi(),runtime={...env,SLATE_PROFILE:undefined,APP_URL:'https://slate.test',MAIL_PROVIDER:'sendgrid',MAIL_FROM:'slate@example.test',MAIL_API_KEY:'synthetic-slate-mail'};
  const {sessionFor}=await import('../../e2e/setup/fixtures');const cookie=await sessionFor(owner,{freshProof:true});
  const invitation=await api.request('https://slate.test/api/invitations',{method:'POST',headers:{cookie,origin:'https://slate.test','content-type':'application/json'},body:JSON.stringify({operationKey:key(),kind:'guest',email:'synthetic-slate-partner@example.test',pageId,shareId:sent.value.shareId,level:'view'})},runtime);
  expect(invitation.status,JSON.stringify(await invitation.json())).toBe(200);expect(deliveries).toHaveLength(1);expect(deliveries[0]).not.toContain('Bring the checklist');
  const token=deliveries[0].match(/\/api\/auth\/invitation\/accept\?token=([A-Za-z0-9_-]+)/)![1];
  const accepted=await api.request('https://slate.test/api/auth/invitation/accept',{method:'POST',headers:{origin:'https://slate.test','content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token})},runtime);
  expect(accepted.status).toBe(303);
  const guestCookie=accepted.headers.get('set-cookie')!.split(';')[0];
  const inbox=await api.request('https://slate.test/api/notifications',{headers:{cookie:guestCookie}},runtime);
  const notices=(await inbox.json<any>()).items.filter((n:any)=>n.event==='page-shared');expect(notices).toHaveLength(1);expect(notices[0].detail.share.message).toBe(message);
 }finally{provider.mockRestore();}
 const grant=(await ok(owner,'GET',`/api/sharing/pages/${pageId}`)).items.find((g:any)=>g.principalId===commenter&&!g.revokedAt);
 await ok(owner,'POST','/api/sharing',{operationKey:key(),targetKind:'page',targetId:pageId,id:grant.id,principalKind:'member',principalId:commenter,level:'view',revoke:true});
 expect(await shared(commenter)).toEqual([]);
 console.info('SHARE-009: native HTTP recipient deduplication, explicit grants, guest acceptance, sender activity and revoked access passed.');
}
