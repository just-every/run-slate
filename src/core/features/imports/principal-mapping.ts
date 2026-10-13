import type {FeatureContext} from '../../app/feature-context';
import {ApiProblem} from '../../app/problems';
import type {NormalizedImport} from './types';

export interface PrincipalMapping {sourceId:string; kind:'member'|'group'; targetId:string}
export function sourcePrincipals(parsed:NormalizedImport) {
  const people=new Map(parsed.members.map(p=>[p.sourceId,{sourceId:p.sourceId,kind:'member' as const,label:p.displayName}]));
  const groups=new Map<string,{sourceId:string;kind:'group';label:string}>();
  for(const item of [...parsed.pages,...parsed.containers])for(const grant of item.grants){
    if(grant.general)continue;
    if(grant.principalKind==='member'&&!people.has(grant.principalSourceId))people.set(grant.principalSourceId,{sourceId:grant.principalSourceId,kind:'member',label:grant.principalSourceId});
    if(grant.principalKind==='group')groups.set(grant.principalSourceId,{sourceId:grant.principalSourceId,kind:'group',label:grant.principalSourceId});
  }
  return [...people.values(),...groups.values()];
}
export async function mappingCandidates(ctx:FeatureContext) {
  const members=(await ctx.db.prepare("SELECT id,display_name AS label FROM members WHERE workspace_id=? AND status='active' ORDER BY display_name,id").bind(ctx.actor.workspaceId).all<{id:string;label:string}>()).results;
  const groups=(await ctx.db.prepare('SELECT id,name AS label FROM groups WHERE workspace_id=? ORDER BY name,id').bind(ctx.actor.workspaceId).all<{id:string;label:string}>()).results;
  return {members,groups};
}
export async function validatePrincipalMappings(ctx:FeatureContext,mappings:PrincipalMapping[],parsed?:NormalizedImport) {
  const sources=parsed?new Set(sourcePrincipals(parsed).map(source=>`${source.kind}:${source.sourceId}`)):undefined;
  const seen=new Set<string>();
  for(const mapping of mappings){const key=`${mapping.kind}:${mapping.sourceId}`;if(seen.has(key)||sources&&!sources.has(key))throw new ApiProblem(400,'IMPORT_MAPPING_INVALID','Choose each source principal once.');seen.add(key);}
  const invalid=await ctx.db.prepare("SELECT EXISTS(SELECT 1 FROM json_each(?) x WHERE (json_extract(x.value,'$.kind')='member' AND NOT EXISTS(SELECT 1 FROM members m WHERE m.id=json_extract(x.value,'$.targetId') AND m.workspace_id=? AND m.status='active')) OR (json_extract(x.value,'$.kind')='group' AND NOT EXISTS(SELECT 1 FROM groups g WHERE g.id=json_extract(x.value,'$.targetId') AND g.workspace_id=?))) AS invalid").bind(JSON.stringify(mappings),ctx.actor.workspaceId,ctx.actor.workspaceId).first<number>('invalid');
  if(invalid)throw new ApiProblem(409,'IMPORT_MAPPING_UNAVAILABLE','A mapped principal is no longer available in this workspace.');
}
