import type {FeatureContext} from '../../app/feature-context';
import {ApiProblem} from '../../app/problems';
import type {EvidencePacket,Answer} from './contracts';
import {adapterFor,connection} from '../connectors/service';
import {NativeAdapter} from '../connectors/native';
import {assertConnectionCurrent} from '../connectors/authority';
export async function procedureCapabilities(ctx:FeatureContext,packet:EvidencePacket[]){
 const supported:{evidenceId:string;states:string[];stateSchema?:string}[]=[];
 for(const item of packet){if(item.ref.kind!=='source')continue;
  const source=await ctx.db.prepare('SELECT connection_id,remote_id FROM federation_sources WHERE id=? AND workspace_id=?').bind(item.ref.sourceId,ctx.actor.workspaceId).first<{connection_id:string;remote_id:string}>();if(!source)continue;
  const row=await connection(ctx,source.connection_id);if(row.provider==='github'){supported.push({evidenceId:item.id,states:['open','closed']});continue;}
  if(row.provider!=='orbit'||!/^opportunities\/[^/]+\/handoffs\/[^/]+$/.test(source.remote_id))continue;
  const adapter=await adapterFor(ctx,row,(ctx as FeatureContext&{sourceSecret?:string}).sourceSecret);if(!(adapter instanceof NativeAdapter))throw new Error('Native connection did not produce a native adapter.');const identity=await adapter.identity();await assertConnectionCurrent(ctx,row);
  if(identity.scopes.includes('crm.evidence.read')&&identity.capabilities.recordStateSchemas?.includes('crm.handoff-state/1'))supported.push({evidenceId:item.id,stateSchema:'crm.handoff-state/1',states:['open','completed','cancelled']});
 }
 return supported;
}
export function validateProcedureCapabilities(answer:Answer,supported:Awaited<ReturnType<typeof procedureCapabilities>>){
 for(const step of answer.procedurePlan?.steps??[]){const v=step.verification;if(v.kind==='human-action')continue;const entry=supported.find(s=>s.evidenceId===v.evidenceId);
  if(!entry||!entry.states.includes(v.expectedState)||entry.stateSchema!==('stateSchema'in v?v.stateSchema:undefined))throw new ApiProblem(409,'INVALID_PROCEDURE_CAPABILITY','The model requested state verification unavailable for its issued source.');
 }
}
