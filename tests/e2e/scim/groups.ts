import { env } from 'cloudflare:test';
import { expect } from 'vitest';
import { GROUP, patch, type scimFixture } from './support';
export async function groupJourney(f:Awaited<ReturnType<typeof scimFixture>>,userId:string,memberId:string) {
  const group=await f.scim('/Groups','POST',{schemas:[GROUP],displayName:'Synthetic SCIM team',externalId:'synthetic-group',members:[{value:userId}]},201),path=`/Groups/${group.id}`;
  expect((await f.scim(path)).members.map((m:any)=>m.value)).toEqual([userId]);
  expect((await env.DB.prepare('SELECT gm.member_id FROM group_members gm JOIN scim_resources r ON r.group_id=gm.group_id WHERE r.id=?').bind(group.id).all<{member_id:string}>()).results.map(row=>row.member_id)).toEqual([memberId]);
  const list=await f.scim('/Groups?startIndex=1&count=1');expect(list.Resources.map((g:any)=>g.id)).toEqual([group.id]);
  await f.scim(path,'PUT',{schemas:[GROUP],displayName:'Replaced team',members:[]});
  await f.scim(path,'PATCH',patch({op:'add',path:'members',value:[{value:userId}]},{op:'replace',path:'displayName',value:'Patched team'},{op:'replace',path:'externalId',value:'synthetic-patched-group'}));
  expect((await f.scim(path)).members.map((m:any)=>m.value)).toEqual([userId]);
  await f.scim(path,'PATCH',patch({op:'remove',path:`members[value eq "${userId}"]`}));
  expect((await f.scim(path)).members).toEqual([]);
  await f.scim(path,'PATCH',patch({op:'add',value:{members:[{value:userId}]}}));
  expect((await f.scim(path)).members.map((m:any)=>m.value)).toEqual([userId]);
  await f.scim(path,'DELETE',undefined,204);
  expect((await f.request(path)).status).toBe(404);
  expect((await f.scim('/Groups')).totalResults).toBe(0);
}
