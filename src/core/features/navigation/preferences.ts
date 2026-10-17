import type { FeatureContext } from '../../app/feature-context';
import { ApiProblem } from '../../app/problems';
import { currentSubject } from '../sharing/current-access';
import { watchConfiguration } from './watch-configuration';
import { personalGuard, personalMutation } from './mutations';
export const destinationIds = ['home','search','containers','databases','templates','automation','archive','settings','agents','inquiries','skills','decisions'] as const;
export interface Preferences { sidebarCollapsed:boolean; collapsedContainers:string[]; timezone:string; quietRoutine:boolean; destinationOrder?:string[]; autowatch?:boolean|null }
const defaults:Preferences={sidebarCollapsed:false,collapsedContainers:[],timezone:'UTC',quietRoutine:true,destinationOrder:[],autowatch:null};
export async function preferences(ctx:FeatureContext){
  await currentSubject(ctx);
  const row=await ctx.db.prepare('SELECT value_json,revision_id FROM discovery_preferences WHERE member_id=?').bind(ctx.actor.id).first<{value_json:string;revision_id:string}>();
  const configuration=await watchConfiguration(ctx);
  return {autowatchDefault:configuration.autowatch,value:row?{...defaults,...JSON.parse(row.value_json)} as Preferences:{...defaults},revisionId:row?.revision_id??null};
}
export function updatePreferences(ctx:FeatureContext,input:{operationKey:string;expectedRevisionId:string|null;value:Preferences}) {
  if(!input||typeof input!=='object'||typeof input.operationKey!=='string'||!Object.hasOwn(input,'expectedRevisionId')||(input.expectedRevisionId!==null&&(typeof input.expectedRevisionId!=='string'||!input.expectedRevisionId||input.expectedRevisionId.length>160)))throw new ApiProblem(400,'INVALID_PREFERENCES','Supply an operation key and the current nullable preference revision.');
  const value=input.value;
  if(value?.autowatch!==undefined&&value.autowatch!==null&&typeof value.autowatch!=='boolean')throw new ApiProblem(400,'INVALID_PREFERENCES','Autowatch must be on, off, or the workspace default.');
  if(!value||typeof value.sidebarCollapsed!=='boolean'||typeof value.quietRoutine!=='boolean'||!Array.isArray(value.collapsedContainers)||value.collapsedContainers.length>1000||value.collapsedContainers.some(id=>typeof id!=='string')||typeof value.timezone!=='string')throw new ApiProblem(400,'INVALID_PREFERENCES','Invalid personal preferences.');
  if(value.destinationOrder!==undefined&&(!Array.isArray(value.destinationOrder)||value.destinationOrder.length>100||new Set(value.destinationOrder).size!==value.destinationOrder.length||value.destinationOrder.some(id=>typeof id!=='string'||! /^[a-z][a-z0-9:._-]{0,127}$/.test(id))))throw new ApiProblem(400,'INVALID_PREFERENCES','Destination order requires distinct navigation identifiers.');
  try{new Intl.DateTimeFormat('en',{timeZone:value.timezone});}catch{throw new ApiProblem(400,'INVALID_TIMEZONE','Unknown timezone.');}
  return personalMutation(ctx,{operationKey:input.operationKey,action:'preferences.update',request:input,build:async revisionId=>{
    // Older clients omit destinationOrder; preserve a newer client's stored order.
    const stored=await preferences(ctx),next={...value,autowatch:value.autowatch===undefined?stored.value.autowatch??null:value.autowatch,destinationOrder:value.destinationOrder??stored.value.destinationOrder??[]};
    return {statements:[personalGuard(ctx,'discovery_preferences',ctx.actor.id,input.expectedRevisionId),ctx.db.prepare('INSERT INTO discovery_preferences(member_id,workspace_id,value_json,revision_id,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(member_id) DO UPDATE SET value_json=excluded.value_json,revision_id=excluded.revision_id,updated_at=excluded.updated_at').bind(ctx.actor.id,ctx.actor.workspaceId,JSON.stringify(next),revisionId,ctx.now)],value:{value:next,revisionId}};
  }});
}
