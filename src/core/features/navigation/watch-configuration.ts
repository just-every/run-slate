import { z } from 'zod';
import type { FeatureContext } from '../../app/feature-context';
import { commitOperation } from '../../app/operations';
import { currentSubject, requireWorkspaceOwner } from '../sharing/current-access';
import { configurationHistory, configurationStatements } from '../workspace/configuration-history';
export const watchConfigurationSchema=z.object({operationKey:z.string().min(8).max(160),expectedRevisionId:z.string().min(1).nullable(),autowatch:z.boolean()}).strict();
export async function watchConfiguration(ctx:FeatureContext) {
 await currentSubject(ctx);
 const row=await configurationHistory<{autowatch:boolean}>(ctx,'watch-configuration');
 return {autowatch:row?.value.autowatch??true,revisionId:row?.revisionId??null};
}
export function setWatchConfiguration(ctx:FeatureContext,input:z.infer<typeof watchConfigurationSchema>) {
 return commitOperation(ctx,{operationKey:input.operationKey,action:'watch.configure',request:input,authorize:()=>requireWorkspaceOwner(ctx),prepare:async({revisionId})=>({
  entity:{id:ctx.actor.workspaceId,kind:'workspace',revisionId},value:{autowatch:input.autowatch,revisionId},
  statements:await configurationStatements(ctx,'watch-configuration',revisionId,input.expectedRevisionId,{autowatch:input.autowatch})
 })});
}
