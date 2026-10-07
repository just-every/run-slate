import {resolveEvidence as sourceEvidence} from '../source-memory/service';
import type {FeatureContext} from '../../app/feature-context';
import {ApiProblem} from '../../app/problems';
import type {EvidenceInput} from './contracts';
import {resolveEvidence} from './evidence';
/** No metadata lookup occurs before the exact revision's current authorization. */
export async function evidenceView(ctx:FeatureContext,refs:EvidenceInput[]){
 return Promise.all(refs.map(async(ref,index)=>{
  try{
   const [packet]=await resolveEvidence(ctx,[ref],[ctx.actor.id]);
   const title=ref.kind==='page'?await ctx.db.prepare('SELECT properties_json FROM page_revisions WHERE id=? AND page_id=?').bind(ref.revisionId,ref.sourceId).first<{properties_json:string}>():null;
   const source=ref.kind==='source'?await sourceEvidence(ctx,{sourceId:ref.sourceId,sourceRevisionId:ref.revisionId,passageId:ref.passageId},{secret:(ctx as FeatureContext&{sourceSecret?:string}).sourceSecret}):null;if(source&&source.state!=='available')return {id:`E${index+1}`,state:'unavailable' as const,reason:'Evidence is no longer available.'};
   const parsed=ref.kind==='source'?null:JSON.parse(packet!.text);const readable=ref.kind==='page'?JSON.stringify(parsed,null,2):ref.kind==='decision'?`${parsed.question}\nOutcome: ${parsed.outcome}\nRationale: ${parsed.rationale}`:ref.kind==='skill'?parsed.instructions:packet!.text;
   return {id:`E${index+1}`,state:'available' as const,reference:ref,title:title?String(JSON.parse(title.properties_json).title??'Page revision'):source?.state==='available'?source.title:ref.kind==='decision'?parsed.question:'Evaluated procedure',text:readable,observedAt:packet!.observedAt,freshness:packet!.current?'current':'stale',href:ref.kind==='page'?`/app/pages/${encodeURIComponent(ref.sourceId)}?revision=${encodeURIComponent(ref.revisionId)}`:null};
  }catch(error){if(error instanceof ApiProblem&&[403,404].includes(error.status))return {id:`E${index+1}`,state:'unavailable' as const,reason:'Evidence is no longer available.'};throw error;}
 }));
}
