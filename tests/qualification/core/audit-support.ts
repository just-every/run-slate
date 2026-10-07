import {expect} from 'vitest';
import {env} from 'cloudflare:test';
import {fixture,createUlid} from '../backend/fixture';
export {env,createUlid};
export async function auditFixture(){
 const f=await fixture();
 const mutation=async(family:string,action:string,method:string,path:string,body:Record<string,unknown>)=>{
  const operationKey=createUlid(),input={...body,operationKey};const response=await f.request(method,path,input);expect(response.status,JSON.stringify(response)).toBeGreaterThanOrEqual(200);expect(response.status,JSON.stringify(response)).toBeLessThan(300);
  await assertAudit(f.workspaceId,operationKey,action,f.ownerId,family);const replay=await f.request(method,path,input);expect(replay.status,JSON.stringify(replay)).toBe(response.status);await assertAudit(f.workspaceId,operationKey,action,f.ownerId,family);return response.data;
 };
 const revision=async(id:string)=>(await env.DB.prepare('SELECT revision_id FROM pages WHERE id=?').bind(id).first<{revision_id:string}>())!.revision_id;
 const profile=async(changes:Record<string,string>)=>{const w=(await f.request('GET','/api/workspace')).data;const response=await f.request('PUT','/api/workspace',{operationKey:createUlid(),expectedRevisionId:w.revisionId,name:w.name,mark:w.mark,description:w.description,guestAccess:w.guestAccess,publicLinkAccess:w.publicLinkAccess,anonymousAccess:w.anonymousAccess,policies:{...w.policies,...changes}});expect(response.status,JSON.stringify(response)).toBe(200);};
 return {...f,mutation,revision,profile};
}
export async function assertAudit(workspace:string,key:string,action:string,actor:string,family:string){
 const rows=(await env.DB.prepare('SELECT id,action,actor_member_id,feature,target_kind,target_id,occurred_at,operation_key FROM activity_entries WHERE workspace_id=? AND operation_key=?').bind(workspace,key).all()).results;
 expect(rows,`${family}: one attributed durable activity`).toHaveLength(1);expect(rows[0]).toMatchObject({action,actor_member_id:actor,operation_key:key});expect(Number.isFinite(Date.parse(String(rows[0].occurred_at)))).toBe(true);expect(String(rows[0].feature).length).toBeGreaterThan(0);expect(String(rows[0].target_kind).length).toBeGreaterThan(0);expect(String(rows[0].target_id).length).toBeGreaterThan(0);
 console.info('AUDIT_RECEIPT',JSON.stringify({family,...rows[0]}));return rows[0];
}
