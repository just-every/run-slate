import { z } from 'zod';
import type { FeatureContext } from '../../app/feature-context';
import { commitOperation } from '../../app/operations';
import { requireWorkspaceOwner,currentSubject } from '../sharing/current-access';
import { configurationHistory,configurationStatements } from '../workspace/configuration-history';
export const navigationConfigurationSchema=z.object({
  operationKey:z.string().min(8).max(160),expectedRevisionId:z.string().min(1).nullable(),
  destinations:z.array(z.object({id:z.string().regex(/^[a-z][a-z0-9:._-]{0,127}$/),label:z.string().trim().min(1).max(80),href:z.string().regex(/^\/app(?:\/[a-zA-Z0-9/_-]*)?$/),visible:z.boolean()}).strict()).max(100)
    .refine(items=>new Set(items.map(item=>item.id)).size===items.length,'Destination IDs must be unique.')
}).strict();
const defaults=[['home','Today','/app'],['search','Search','/app/search'],['inbox','Inbox','/app/inbox'],['tasks','My tasks','/app/tasks'],['review','Needs review','/app/review'],['containers','Spaces','/app/containers'],['templates','Templates','/app/templates'],['archive','Archive','/app/archive'],['settings','Settings','/app/settings']].map(([id,label,href])=>({id:id!,label:label!,href:href!,visible:true}));
export async function navigationConfiguration(ctx:FeatureContext) {
  await currentSubject(ctx);
  const row=await configurationHistory<{destinations:typeof defaults}>(ctx,'navigation-configuration');
  return {destinations:row?withAddedDefaults(row.value.destinations):defaults,revisionId:row?.revisionId??null};
}
/** A saved configuration predates destinations added since; each appears after the default it follows. Hidden ones stay hidden. */
function withAddedDefaults(saved:typeof defaults){
  const result=[...saved];
  defaults.forEach((item,index)=>{if(result.some(d=>d.id===item.id))return;const after=index?result.findIndex(d=>d.id===defaults[index-1]!.id):-1;result.splice(after+1||result.length,0,item);});
  return result;
}
export function setNavigationConfiguration(ctx:FeatureContext,input:z.infer<typeof navigationConfigurationSchema>) {
  return commitOperation(ctx,{operationKey:input.operationKey,action:'navigation.configure',request:input,authorize:()=>requireWorkspaceOwner(ctx),prepare:async({revisionId})=>({
    entity:{id:ctx.actor.workspaceId,kind:'workspace',revisionId},value:{destinations:input.destinations,revisionId},statements:await configurationStatements(ctx,'navigation-configuration',revisionId,input.expectedRevisionId,{destinations:input.destinations})
  })});
}
