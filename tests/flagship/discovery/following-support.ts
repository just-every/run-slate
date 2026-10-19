import {env} from 'cloudflare:test';
import {expect} from 'vitest';
import {createApi} from '../../../src/core/app/hono';
import {seedWorkspace,seedMember,seedContainer,seedContainerGrant,sessionFor} from '../../e2e/setup/fixtures';
/** `defaultProfile` sends every request with `SLATE_PROFILE` unset, as a target clause's evidence requires; this pool otherwise runs as flagship. */
export async function followingFixture({defaultProfile=false}:{defaultProfile?:boolean}={}) {
 const api=createApi(),origin='https://slate.test',runtime=defaultProfile?{...env,SLATE_PROFILE:undefined}:env;
 const {workspaceId}=await seedWorkspace();
 const members=await Promise.all(['owner','editor','commenter'].map(async(name,index)=>({name,...await seedMember(workspaceId,{role:index?'member':'owner',email:`${name}-${workspaceId}@example.test`,displayName:name})})));
 const [owner,editor,commenter]=members;
 const cookies=new Map(await Promise.all(members.map(async m=>[m.memberId,await sessionFor(m.memberId,{freshProof:true})] as const)));
 const {containerId}=await seedContainer(workspaceId,{ownerMemberId:owner!.memberId,visibility:'closed'});
 const grants=await Promise.all(members.map(m=>seedContainerGrant(containerId,{principalKind:'member',principalId:m.memberId,level:m.name==='owner'?'full':'edit'})));
 async function request(actor:string,method:string,path:string,body?:unknown) {
  const response=await api.request(origin+path,{method,headers:{cookie:cookies.get(actor)!,'content-type':'application/json',origin},body:body===undefined?undefined:JSON.stringify(body)},runtime);
  return {status:response.status,body:await response.json<any>()};
 }
 async function ok(actor:string,method:string,path:string,body?:unknown) {
  const result=await request(actor,method,path,body);expect(result.status,`${method} ${path}: ${JSON.stringify(result.body)}`).toBe(200);return result.body;
 }
 const key=()=>crypto.randomUUID();
 const create=async(title:string,actor=owner!.memberId,extra:Record<string,unknown>={})=>ok(actor,'POST','/api/pages',{operationKey:key(),containerId,title,...extra});
 const edit=async(pageId:string,title:string,actor=owner!.memberId)=>{const doc=await ok(actor,'GET',`/api/pages/${pageId}`);return ok(actor,'PATCH',`/api/pages/${pageId}`,{operationKey:key(),expectedRevisionId:doc.page.revisionId,properties:{title}});};
 const comment=async(pageId:string,actor=commenter!.memberId,extra:Record<string,unknown>={})=>ok(actor,'POST',`/api/comments/page/${pageId}`,{operationKey:key(),body:[{text:'Discuss this change'}],...extra});
 const watch=async(actor:string,pageId:string,enabled:boolean)=>ok(actor,'PUT','/api/navigation/watches',{operationKey:key(),pageId,enabled});
 const watchContainer=async(actor:string,id:string,enabled:boolean)=>ok(actor,'PUT','/api/navigation/container-watches',{operationKey:key(),containerId:id,enabled});
 const inbox=async(actor:string)=>(await ok(actor,'GET','/api/notifications')).items as {id:string;event:string;pageId:string;href:string}[];
 const preferences=async(actor:string,autowatch:boolean|null)=>{const p=await ok(actor,'GET','/api/navigation/preferences');return ok(actor,'PUT','/api/navigation/preferences',{operationKey:key(),expectedRevisionId:p.revisionId,value:{...p.value,autowatch}});};
 return {workspaceId,owner:owner!.memberId,editor:editor!.memberId,commenter:commenter!.memberId,containerId,grants,key,request,ok,create,edit,comment,watch,watchContainer,inbox,preferences};
}
