import { configurationHistory,configurationStatements } from '../workspace/configuration-history';
import type { FeatureContext } from '../../app/feature-context';
import { ApiProblem } from '../../app/problems';
import { commitOperation } from '../../app/operations';
import { currentSubject, requireWorkspaceOwner } from './current-access';
import type { AccessLevel } from '../../shared/knowledge/model';

export const accessLevels: AccessLevel[] = ['full', 'edit', 'comment', 'view'];
export async function sharingConfiguration(ctx: FeatureContext) {
  await currentSubject(ctx);
  const row=await configurationHistory<{levels:AccessLevel[]}>(ctx,'sharing-configuration');
  return {levels:row?.value.levels??[...accessLevels],revisionId:row?.revisionId??null};
}
export async function requireConfiguredLevel(ctx: FeatureContext, level: AccessLevel) {
  if (!(await sharingConfiguration(ctx)).levels.includes(level)) throw new ApiProblem(400, 'LEVEL_UNAVAILABLE', 'This access level is not configured.');
}
export function setSharingConfiguration(ctx: FeatureContext, input: {operationKey:string;expectedRevisionId:string|null;levels:AccessLevel[]}) {
  if (!input.levels.length || new Set(input.levels).size !== input.levels.length || input.levels.some(level => !accessLevels.includes(level))) throw new ApiProblem(400,'INVALID_LEVELS','Choose distinct permission levels.');
  return commitOperation(ctx, {operationKey:input.operationKey, action:'sharing.configure', request:input, authorize:()=>requireWorkspaceOwner(ctx), prepare:async({revisionId})=>({
    entity:{id:ctx.actor.workspaceId,kind:'workspace',revisionId}, value:{levels:input.levels,revisionId}, statements:await configurationStatements(ctx,'sharing-configuration',revisionId,input.expectedRevisionId,{levels:input.levels})
  })});
}
