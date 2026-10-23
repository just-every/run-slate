import { env } from 'cloudflare:test';
import { expect } from 'vitest';
import { createUlid } from '../../../src/core/shared/ulid';
import { patch, user, type scimFixture } from './support';
export async function userJourney(f:Awaited<ReturnType<typeof scimFixture>>) {
  const email='synthetic-slate-5@example.test',operationKey=createUlid();
  const pending=await f.scim('/Users','POST',user(email,{externalId:'synthetic-external-person',name:{givenName:'Synthetic',familyName:'Person'},roles:[{value:'Owner'}],title:'Ignored title',manager:{value:f.owner},'urn:ietf:params:scim:schemas:extension:enterprise:2.0:User':{manager:{value:f.owner}}}),201,operationKey);
  expect(pending.active).toBe(false);
  expect(pending['urn:slate:params:scim:schemas:extension:2.0:Provisioning'].ignoredAttributes).toEqual(expect.arrayContaining(['roles','title','manager','urn:ietf:params:scim:schemas:extension:enterprise:2.0:User']));
  expect((await f.request('/Users','POST',user(email,{externalId:'synthetic-external-person'}),f.credential.secret,operationKey)).status).toBe(409);
  expect((await f.request('/Groups','POST',{schemas:['urn:ietf:params:scim:schemas:core:2.0:Group'],displayName:'Pending rejected',members:[{value:pending.id}]})).status).toBe(400);
  const accepted=await f.accept(email),path=`/Users/${pending.id}`;
  const active=await f.scim(path);expect(active.active).toBe(true);expect(active.displayName).toBe('Synthetic Person');
  expect(await env.DB.prepare('SELECT role FROM members WHERE id=?').bind(accepted.memberId).first<string>('role')).toBe('member');
  for(const [query,expected] of [[`filter=${encodeURIComponent(`userName eq "${email}"`)}`,1],[`filter=${encodeURIComponent('userName eq "missing@example.test"')}`,0],['count=0',1]] as const){const list=await f.scim('/Users?'+query);expect(list.totalResults).toBe(expected);expect(list.Resources).toHaveLength(query==='count=0'?0:expected);}
  const replaced=await f.scim(path,'PUT',user(email,{displayName:'Updated Native Name',externalId:'synthetic-replaced',name:{givenName:'Updated',familyName:'Name'}}));expect(replaced.displayName).toBe('Updated Native Name');
  expect(await env.DB.prepare('SELECT display_name FROM members WHERE id=?').bind(accepted.memberId).first<string>('display_name')).toBe('Updated Native Name');
  const renamed='synthetic-slate-6@example.test';
  const changes=[{op:'replace',path:'name.givenName',value:'Renamed'},{op:'replace',path:'name.familyName',value:'Person'},{op:'replace',path:'externalId',value:'synthetic-renamed'},{op:'replace',path:'emails[type eq "work"].value',value:renamed}];
  const changed=await f.scim(path,'PATCH',patch(...changes));expect(changed).toMatchObject({userName:renamed,displayName:'Renamed Person',externalId:'synthetic-renamed'});
  expect((await f.request(path,'PATCH',patch({op:'replace',path:'active',value:false},{op:'replace',path:'userName',value:'invalid'}))).status).toBe(400);
  expect((await f.scim(path)).active).toBe(true);
  return {id:pending.id,path,email:renamed,memberId:accepted.memberId};
}
