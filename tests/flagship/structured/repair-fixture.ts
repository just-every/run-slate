import { env } from "cloudflare:test";
import { seedWorkspace,seedMember,seedContainer,seedContainerGrant } from "../../e2e/setup/fixtures";
import type { FeatureContext } from "../../../src/core/app/feature-context";
import { createDatabase,saveField } from "../../../src/core/features/databases/service";
import type { Field } from "../../../src/core/features/databases/values";
export async function setup() {
  const {workspaceId}=await seedWorkspace();
  const {memberId}=await seedMember(workspaceId,{role:"owner",displayName:"Owner",email:`${workspaceId}@owner.invalid`});
  const {memberId:readerId}=await seedMember(workspaceId,{role:"member",displayName:"Reader",email:`${workspaceId}@reader.invalid`});
  const {containerId}=await seedContainer(workspaceId,{ownerMemberId:memberId,visibility:"default"});
  await seedContainerGrant(containerId,{principalKind:"member",principalId:memberId,level:"full"});
  const ctx={db:env.DB,files:env.FILES,jobs:env.JOBS,now:new Date().toISOString(),actor:{id:memberId,workspaceId,workspaceName:"Test",email:"owner@test.invalid",displayName:"Owner",initials:"OW",role:"owner"}} as FeatureContext;
  return {ctx,containerId,reader:{...ctx,actor:{...ctx.actor,id:readerId,role:"member" as const}}};
}
export async function databaseWith(ctx: FeatureContext, containerId:string, prefix:string, definitions:Field[]) {
  const db=await createDatabase(ctx,{operationKey:`${prefix}-create`,containerId,title:prefix});
  let revisionId=db.receipt.revisionId;
  for(const field of definitions){const saved=await saveField(ctx,db.value.id,{operationKey:`${prefix}-${field.id}`,expectedRevisionId:revisionId,field});revisionId=saved.receipt.revisionId;}
  return {...db.value,revisionId};
}
let position = 0;
export const field=(id:string,type:Field["type"],config:Record<string,unknown>={}):Field=>({id,name:id,type,config,position:position++});
