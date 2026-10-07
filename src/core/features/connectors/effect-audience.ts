import type {FeatureContext} from '../../app/feature-context';
import type {ConnectionRow} from './types';
import {connection,adapterFor} from './service';
import {NativeAdapter} from './native';
import {assertConnectionCurrent} from './authority';
/** Only independently authenticated, exact installation/account/principal mappings count. */
export async function resolveEffectAudience(ctx:FeatureContext,connectionId:string,target:string,operation:string,secret:string|undefined,intendedStatus?:'draft'|'published'){
 const row=await connection(ctx,connectionId),adapter=await adapterFor(ctx,row,secret);
 if(!(adapter instanceof NativeAdapter))return {audienceRevision:'public',publicAudience:true,memberIds:[] as string[],unmappedCount:0};
 const identity=await adapter.identity(),audience=await adapter.audience(target,operation,intendedStatus);await assertConnectionCurrent(ctx,row);
 if(audience.kind==='public')return {audienceRevision:audience.audienceRevision,publicAudience:true,memberIds:[] as string[],unmappedCount:0};
 const rows=(await ctx.db.prepare("SELECT c.* FROM federation_connections c JOIN members m ON m.id=c.member_id WHERE c.workspace_id=? AND c.provider=? AND c.account_id=? AND c.state='connected' AND m.status='active'").bind(ctx.actor.workspaceId,row.provider,row.account_id).all<ConnectionRow>()).results;
 const members=new Set<string>(),mapped=new Set<string>();
 for(const candidate of rows){const saved=JSON.parse(candidate.config_json);if(saved.origin!==identity.origin||saved.installationId!==identity.installationId||!audience.principalIds.includes(saved.principalId))continue;const reader={...ctx,actor:{...ctx.actor,id:candidate.member_id}};try{const current=await (await adapterFor(reader,candidate,secret)).identity() as {principalId:string;installationId?:string;accountId:string;origin?:string};await assertConnectionCurrent(reader,candidate);if(current.installationId===identity.installationId&&current.origin===identity.origin&&current.accountId===identity.accountId&&current.principalId===saved.principalId){members.add(candidate.member_id);mapped.add(current.principalId);}}catch{}}
 await assertConnectionCurrent(ctx,row);return {audienceRevision:audience.audienceRevision,publicAudience:false,memberIds:[...members],unmappedCount:audience.principalIds.filter(id=>!mapped.has(id)).length};
}
