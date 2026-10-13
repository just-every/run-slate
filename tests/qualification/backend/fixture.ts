import { env } from 'cloudflare:test';
import { seedWorkspace,seedMember,sessionFor } from '../../e2e/setup/fixtures';
import { createApi } from '../../../src/core/app/hono';
import { createUlid } from '../../../src/core/shared/ulid';
import type { FeatureContext } from '../../../src/core/app/feature-context';
export { env,createUlid };
/** Test-only initial membership; every target, grant and preference is then written through native HTTP.
 * The owner's session carries a fresh email proof, as owner-only sensitive operations require (step-up). */
export async function fixture() {
  const {workspaceId}=await seedWorkspace();
  const {memberId:ownerId}=await seedMember(workspaceId,{email:`${workspaceId}@test.invalid`,displayName:'Core owner',role:'owner',isSetupOwner:true});
  const {memberId:readerId}=await seedMember(workspaceId,{email:`reader-${workspaceId}@test.invalid`,displayName:'Core reader',role:'member'});
  const api=createApi(),cookies={[ownerId]:await sessionFor(ownerId,{freshProof:true}),[readerId]:await sessionFor(readerId)};
  const origin=new URL(String(env.APP_URL)).origin;
  const request=async(method:string,path:string,body?:unknown,actor=ownerId)=>{
    // The configured application origin, as a browser on this installation sends it.
    const response=await api.request(`${origin}${path}`,{method,headers:{cookie:cookies[actor]??'','content-type':'application/json',origin},body:body===undefined?undefined:JSON.stringify(body)},env);
    return {status:response.status,data:await response.json<any>()};
  };
  const ctx:FeatureContext={db:env.DB,files:env.FILES,jobs:env.JOBS,now:new Date().toISOString(),actor:{id:ownerId,workspaceId,workspaceName:'Aurora',email:`${workspaceId}@test.invalid`,displayName:'Core owner',initials:'CO',role:'owner'}};
  const result=await request('POST','/api/containers',{operationKey:createUlid(),name:'Core team',visibility:'private'});
  if(result.status!==200)throw new Error(JSON.stringify(result));
  const containerId=result.data.value.id;
  const page=async(title:string,parentPageId?:string)=>{const response=await request('POST','/api/pages',{operationKey:createUlid(),containerId,title,parentPageId});if(response.status!==200)throw new Error(JSON.stringify(response));return {id:response.data.value.pageId as string,revisionId:response.data.value.revisionId as string};};
  return {workspaceId,ownerId,readerId,containerId,request,page,ctx,api,cookies};
}
