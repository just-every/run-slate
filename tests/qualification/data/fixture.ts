import {env} from 'cloudflare:test';
import {seedWorkspace,seedMember,seedContainer,seedPage,seedPageGrant} from '../../e2e/setup/fixtures';
import type {FeatureContext} from '../../../src/core/app/feature-context';
export const canary='PERSONAL-DATA-CANARY-EMAIL-person@example.invalid';
export async function fixture(){
 const {workspaceId}=await seedWorkspace(),{memberId:owner}=await seedMember(workspaceId,{role:'owner',email:crypto.randomUUID()+'@owner.invalid',displayName:'Owner'}),{memberId:subject}=await seedMember(workspaceId,{role:'member',email:crypto.randomUUID()+'@subject.invalid',displayName:canary}),{containerId}=await seedContainer(workspaceId,{ownerMemberId:owner,visibility:'open'}),page=await seedPage(containerId,{title:canary,authorMemberId:subject});
 await seedPageGrant(page.pageId,{principalKind:'member',principalId:owner,level:'full'});
 const ctx:FeatureContext={db:env.DB,files:env.FILES,jobs:env.JOBS,actor:{id:owner,workspaceId,workspaceName:'Erasure',email:'owner@fixture.invalid',displayName:'Owner',initials:'OW',role:'owner'},now:new Date().toISOString()};
 return {ctx,workspaceId,owner,subject,page};
}
export async function insert(table:string,row:Record<string,unknown>){const fields=Object.keys(row);await env.DB.prepare(`INSERT INTO ${table}(${fields.join(',')}) VALUES(${fields.map(()=>'?').join(',')})`).bind(...Object.values(row)).run();}
export async function canaries(tables:string[]){const result:Record<string,number>={};for(const table of tables){const rows=(await env.DB.prepare(`SELECT * FROM ${table}`).all()).results;result[table]=rows.filter(r=>JSON.stringify(r).includes(canary)).length;}return result;}
