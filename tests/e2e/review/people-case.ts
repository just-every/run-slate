import {expect} from 'vitest';
import {fixture} from '../../qualification/backend/fixture';
import {seedMember,sessionFor} from '../setup/fixtures';
import {env} from 'cloudflare:test';
export async function peopleCase(){
 const f=await fixture(),key=()=>crypto.randomUUID();
 const json=async(method:string,path:string,body?:unknown,actor=f.ownerId)=>{const r=await f.request(method,path,body,actor);expect(r.status,JSON.stringify(r.data)).toBe(200);return r.data;};
 const shared=await f.page('Incident response guide'),secret=await f.page('Acquisition planning');
 for(const [page,labels] of [[shared,['Incident response']],[secret,['Acquisition secret']]] as const)await json('PATCH',`/api/pages/${page.id}`,{operationKey:key(),expectedRevisionId:page.revisionId,properties:{labels}});
 await json('POST','/api/sharing',{operationKey:key(),targetKind:'page',targetId:shared.id,principalKind:'member',principalId:f.readerId,level:'view'});
 const document=await json('GET',`/api/pages/${shared.id}`);await json('POST',`/api/pages/${shared.id}/open`,{operationKey:key(),revisionId:document.workingRevisionId});await json('POST',`/api/status/page/${shared.id}`,{operationKey:key(),expectedRevisionId:document.page.revisionId,statusKey:'verified',attestRevisionId:document.workingRevisionId,expiresAt:null});
 let profile=await json('GET',`/api/people/${f.ownerId}`);expect(profile.pages.owned.map((p:any)=>p.id)).toContain(shared.id);expect(profile.pages.verified.map((p:any)=>p.id)).toContain(shared.id);expect(profile.pages.frequent.map((p:any)=>p.id)).toContain(shared.id);
 await json('PUT',`/api/people/${f.ownerId}`,{operationKey:key(),expectedRevisionId:profile.revisionId,title:'Incident lead',timezone:'Australia/Brisbane',team:'Operations',managerId:f.readerId});
 for(const q of ['Core owner','Incident lead','Operations','Incident response'])expect((await json('GET','/api/people?q='+encodeURIComponent(q),undefined,f.readerId)).items.map((p:any)=>p.id)).toContain(f.ownerId);
 const visible=await json('GET',`/api/people/${f.ownerId}`,undefined,f.readerId);expect(JSON.stringify(visible)).not.toContain(secret.id);expect(JSON.stringify(visible)).not.toContain('Acquisition');
 expect((await f.request('PUT',`/api/people/${f.readerId}`,{operationKey:key(),expectedRevisionId:null,team:'Forged team'},f.readerId)).status).toBe(403);
 expect((await f.request('PUT',`/api/people/${f.readerId}`,{operationKey:key(),expectedRevisionId:null,title:'Owner-written title'})).status).toBe(403);
 const targets=await json('GET',`/api/status/requests/page/${shared.id}/targets`);expect(targets.items.find((p:any)=>p.id===f.ownerId).expertise).toEqual(['Incident response']);expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM review_requests WHERE page_id=?').bind(shared.id).first<{n:number}>())!.n).toBe(0);
 profile=await json('GET',`/api/people/${f.ownerId}`);await json('PUT',`/api/people/${f.ownerId}`,{operationKey:key(),expectedRevisionId:profile.revisionId,tags:[{tag:'Incident response',hidden:true,custom:false}]});
 expect((await json('GET','/api/people?q=Incident%20response',undefined,f.readerId)).items).toEqual([]);expect(JSON.stringify(await json('GET',`/api/people/${f.ownerId}`,undefined,f.readerId))).not.toContain('Incident response');expect((await json('GET',`/api/status/requests/page/${shared.id}/targets`)).items.find((p:any)=>p.id===f.ownerId).expertise).toEqual([]);
 profile=await json('GET',`/api/people/${f.ownerId}`);expect(profile.hiddenTags).toContainEqual({tag:'Incident response',custom:false});await json('PUT',`/api/people/${f.ownerId}`,{operationKey:key(),expectedRevisionId:profile.revisionId,tags:[]});expect((await json('GET',`/api/people/${f.ownerId}`,undefined,f.readerId)).tags).toContainEqual({tag:'Incident response',derived:true});
 const {memberId:guest}=await seedMember(f.workspaceId,{email:`guest-${key()}@test.invalid`,displayName:'Partner guest',role:'member',isGuest:true});f.cookies[guest]=await sessionFor(guest);
 await json('POST','/api/sharing',{operationKey:key(),targetKind:'page',targetId:shared.id,principalKind:'member',principalId:guest,level:'view'});
 expect((await f.request('GET','/api/people',undefined,guest)).status).toBe(403);const scoped=await json('GET',`/api/pages/${shared.id}/people`,undefined,guest);expect(scoped.items.map((p:any)=>p.id)).toEqual([f.ownerId]);expect(JSON.stringify(scoped)).not.toContain(f.readerId);expect(JSON.stringify(scoped)).not.toContain(secret.id);expect((await f.request('GET',`/api/people/${f.readerId}?pageId=${shared.id}`,undefined,guest)).status).toBe(404);
 await json('PUT',`/api/people/${f.readerId}`,{operationKey:key(),expectedRevisionId:null,title:'Response coordinator',timezone:'UTC',tags:[{tag:'private choice',hidden:true,custom:true}]},f.readerId);
 await json('POST','/api/members/remove',{operationKey:key(),memberId:f.readerId,erase:true});expect((await json('GET','/api/people')).items.some((p:any)=>p.id===f.readerId)).toBe(false);expect(await env.DB.prepare('SELECT * FROM member_profiles WHERE member_id=?').bind(f.readerId).first()).toBeNull();expect((await env.DB.prepare('SELECT * FROM member_expertise_overrides WHERE member_id=?').bind(f.readerId).all()).results).toEqual([]);expect((await json('GET',`/api/people/${f.ownerId}`)).managerId).toBeNull();
}
