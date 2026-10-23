import { env } from 'cloudflare:test';
import { expect } from 'vitest';
import limits from '../../../seed.json';
import { createUlid } from '../../../src/core/shared/ulid';
import { seedMember } from '../setup/fixtures';
import { user, type scimFixture } from './support';
export async function admissionJourney(f: Awaited<ReturnType<typeof scimFixture>>) {
  await f.ok('/api/guests/policy','PUT',{operationKey:createUlid(),defaultExpiryDays:null,allowedDomains:[],deniedDomains:['example.test']});
  expect((await f.request('/Users','POST',user('synthetic-slate-13@example.test'))).status).toBe(403);
  expect(await env.DB.prepare('SELECT id FROM invitations WHERE email=?').bind('synthetic-slate-13@example.test').first()).toBeNull();
  await f.ok('/api/guests/policy','PUT',{operationKey:createUlid(),defaultExpiryDays:null,allowedDomains:[],deniedDomains:[]});
  const count=await env.DB.prepare("SELECT count(*) AS n FROM members WHERE workspace_id=? AND status='active' AND member_kind='member'").bind(f.workspaceId).first<number>('n');
  const ids:string[]=[];
  try {
    for(let index=count!;index<limits.limits.capacityEstimate.membersPerDeployment;index++)ids.push((await seedMember(f.workspaceId,{role:'member',email:`synthetic-slate-${index+100}@example.test`,displayName:`Synthetic member ${index}`})).memberId);
    expect((await f.request('/Users','POST',user('synthetic-slate-14@example.test'))).status).toBe(409);
    expect(await env.DB.prepare('SELECT id FROM invitations WHERE email=?').bind('synthetic-slate-14@example.test').first()).toBeNull();
  } finally {await env.DB.batch(ids.map(id=>env.DB.prepare('DELETE FROM members WHERE id=?').bind(id)));}
}
