import { env } from 'cloudflare:test';
import { expect } from 'vitest';
import { createUlid } from '../../../src/core/shared/ulid';
import { sessionFor } from '../setup/fixtures';
import { tokenCustody } from '../public-api/custody';
import { user, GROUP, patch, type scimFixture } from './support';
export async function scimCustody(f: Awaited<ReturnType<typeof scimFixture>>) {
  const pending = await f.scim('/Users','POST',user('synthetic-slate-12@example.test'),201);
  const memberEmail = await env.DB.prepare('SELECT email FROM members WHERE id=?').bind(f.member).first<string>('email');
  const member = await f.scim('/Users','POST',user(memberEmail!),201);
  await f.scim('/Groups','POST',{schemas:[GROUP],displayName:'Synthetic directory group',members:[{value:member.id}]},201);
  const token = await f.mint(); await tokenCustody(f,token.secret,[f.credential.secret]);
  const prior = (env as unknown as {PRIOR_DB:D1Database}).PRIOR_DB;
  const credentials = (await prior.prepare('SELECT token_hash,revoked_at FROM scim_credentials').all()).results;
  expect(credentials.length).toBeGreaterThan(0);expect(credentials.every(row=>row.token_hash===null&&row.revoked_at!==null)).toBe(true);
  expect((await prior.prepare("SELECT invitation_id,state FROM scim_resources WHERE resource_type='User' AND state!='deleted'").all()).results.every(row=>row.invitation_id===null&&row.state==='inactive')).toBe(true);
  expect((await f.api.request('https://slate.test/scim/v2/Users',{headers:{authorization:`Bearer ${f.credential.secret}`}},{...env,DB:prior,SLATE_PROFILE:undefined})).status).toBe(401);
  // A native promotion cannot leave a previously provisioned User administrable by SCIM.
  await f.ok(`/api/members/${f.member}/role`,'PUT',{operationKey:createUlid(),expectedRole:'member',role:'owner'});
  expect((await f.request(`/Users/${member.id}`,'PATCH',patch({op:'replace',path:'active',value:false}))).status).toBe(403);
  expect((await f.request(`/Users/${member.id}`,'DELETE')).status).toBe(403);
  await f.ok(`/api/members/${f.member}/role`,'PUT',{operationKey:createUlid(),expectedRole:'owner',role:'member'});
  await f.ok('/api/members/remove','POST',{operationKey:createUlid(),memberId:f.member,erase:true});
  expect(await env.DB.prepare('SELECT id FROM scim_resources WHERE member_id=?').bind(f.member).first()).toBeNull();
  expect((await f.request(`/Users/${member.id}`)).status).toBe(404);
  await f.scim(`/Users/${pending.id}`,'DELETE',undefined,204);
  await f.ok(`/api/members/${f.other}/role`,'PUT',{operationKey:createUlid(),expectedRole:'member',role:'owner'});
  f.cookies[f.other]=await sessionFor(f.other,{freshProof:true});
  const erased=await f.ok('/api/developer/scim','POST',{operationKey:createUlid(),name:'Synthetic temporary directory'},{member:f.other});
  await f.ok('/api/members/remove','POST',{operationKey:createUlid(),memberId:f.other,erase:true});
  expect(await env.DB.prepare('SELECT id FROM scim_credentials WHERE id=?').bind(erased.value.id).first()).toBeNull();
}
