import {interruptSelectedAttempts} from './attempt-interruption';
import type {RunRow} from '../ai/contracts';
import type {ModelResult} from '../ai/provider';

/** All sensitive attempt metadata lives in result_json, the existing erasure boundary. */
export function claimAttempt(db:D1Database,row:RunRow,lease:string,now:string){
 return db.batch([
  db.prepare("UPDATE intelligence_runs SET status='running',lease_id=?,started_at=COALESCE(started_at,?),deadline_at=?,retry_until=COALESCE(retry_until,?),attempts=attempts+1,updated_at=? WHERE id=? AND status='queued' AND (next_at IS NULL OR next_at<=?)").bind(lease,now,new Date(Date.parse(now)+600000).toISOString(),new Date(Date.parse(now)+300000).toISOString(),now,row.id,now),
  db.prepare(`INSERT INTO intelligence_stages(id,run_id,stage,state,result_json,started_at) SELECT ?,id,'generation','running',json_object('version',1,'attemptId',?,'ordinal',attempts,'reservationId',(SELECT id FROM intelligence_budgets WHERE run_id=? AND released_at IS NULL ORDER BY created_at DESC,id DESC LIMIT 1),'phase','admission','accountingUnit',?,'knownCost',NULL,'knownTokens',NULL,'uncertainUpperBound',0,'dispatchStartedAt',NULL,'providerEndedAt',NULL,'outcome',NULL,'retryScheduled',json('false'),'nextEligibleAt',NULL,'measurement','observed'),? FROM intelligence_runs WHERE id=? AND lease_id=?`).bind(lease,lease,row.id,JSON.parse(row.input_json).route?.accountingUnit??'usd-micros',now,row.id,lease),
 ]);
}
export async function dispatchAttempt(db:D1Database,runId:string,lease:string){
 const stamp=new Date().toISOString();
 const result=await db.prepare(`UPDATE intelligence_stages SET result_json=json_set(result_json,'$.phase','dispatched','$.dispatchStartedAt',?) WHERE id=? AND result_json IS NOT NULL AND EXISTS(SELECT 1 FROM intelligence_runs WHERE id=? AND status='running' AND lease_id=?)`).bind(stamp,lease,runId,lease).run();
 if(!result.meta.changes)throw new Error('ATTEMPT_STOPPED');
}
/** Delta accounting and receipt update share one D1 transaction. A receipt resolves only this attempt's uncertainty. */
export function accountAttempt(db:D1Database,lease:string,meter:Pick<ModelResult,'costMicros'|'tokens'|'providerReceipt'>|null,uncertain:number,stamp:string){
 const eligible="id=? AND json_extract(result_json,'$.version')=1 AND json_extract(result_json,'$.knownCost') IS NULL"+(meter?"":" AND json_extract(result_json,'$.providerEndedAt') IS NULL");
 const delta=`(SELECT ?-COALESCE(json_extract(result_json,'$.uncertainUpperBound'),0) FROM intelligence_stages WHERE ${eligible})`;
 return [
 db.prepare(`UPDATE intelligence_runs SET cost_micros=cost_micros+?,tokens=tokens+?,uncertain_cost_micros=uncertain_cost_micros+${delta} WHERE id=(SELECT run_id FROM intelligence_stages WHERE ${eligible})`).bind(meter?.costMicros??0,meter?.tokens??0,uncertain,lease,lease),
 db.prepare(`UPDATE intelligence_budgets SET charged_micros=charged_micros+?,uncertain_micros=uncertain_micros+${delta} WHERE id=(SELECT json_extract(result_json,'$.reservationId') FROM intelligence_stages WHERE ${eligible})`).bind(meter?.costMicros??0,uncertain,lease,lease),
 db.prepare(`UPDATE intelligence_stages SET result_json=json_set(result_json,'$.knownCost',?,'$.knownTokens',?,'$.uncertainUpperBound',?,'$.providerReceipt',?,'$.providerEndedAt',CASE WHEN json_extract(result_json,'$.phase')='dispatched' THEN ? ELSE NULL END) WHERE ${eligible}`).bind(meter?.costMicros??null,meter?.tokens??null,uncertain,meter?.providerReceipt||null,stamp,lease),
 ];
}
export function closeAttempt(db:D1Database,lease:string,outcome:string,stamp:string,errorCode:string|null=null,retry=false,next:string|null=null,measurement='observed'){
 return db.prepare(`UPDATE intelligence_stages SET state=?,completed_at=COALESCE(completed_at,?),result_json=json_set(result_json,'$.outcome',?,'$.errorCode',?,'$.retryScheduled',json(?),'$.nextEligibleAt',?,'$.measurement',?) WHERE id=? AND result_json IS NOT NULL AND completed_at IS NULL`).bind(outcome==='completed'?'completed':'failed',stamp,outcome,errorCode,JSON.stringify(retry),next,measurement,lease);
}
export function interruptAttempt(db:D1Database,row:RunRow,stamp:string,outcome:string){
 return interruptSelectedAttempts(db,'SELECT id FROM intelligence_runs WHERE id=? AND lease_id=?',[row.id,row.lease_id],stamp,outcome);
}
