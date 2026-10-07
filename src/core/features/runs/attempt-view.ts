import type {RunRow} from '../ai/contracts';
export interface AttemptDetail {
 version:1;attemptId:string;ordinal:number;reservationId:string|null;
 phase:'admission'|'dispatched';accountingUnit:'tokens'|'usd-micros';
 knownCost:number|null;knownTokens:number|null;uncertainUpperBound:number;
 dispatchStartedAt:string|null;providerEndedAt:string|null;providerReceipt?:string|null;
 outcome:string|null;errorCode?:string|null;retryScheduled:boolean;nextEligibleAt:string|null;
 measurement:'observed'|'recovery-observed-bound';
}
export async function attemptView(db:D1Database,row:RunRow){
 const stages=(await db.prepare("SELECT id,state,result_json,started_at,completed_at FROM intelligence_stages WHERE run_id=? AND stage='generation' ORDER BY started_at,id").bind(row.id).all<{id:string;state:string;result_json:string|null;started_at:string;completed_at:string|null}>()).results;
 const attempts=stages.map(s=>{const raw=s.result_json?JSON.parse(s.result_json):null;const detail:AttemptDetail|null=raw?.version===1?raw:null;return {id:s.id,state:s.state,executionState:s.completed_at?'closed' as const:row.status==='running'&&row.lease_id===s.id?'active' as const:'historical-unfinished' as const,startedAt:s.started_at,completedAt:s.completed_at,machineElapsedMs:s.completed_at?Math.max(0,Date.parse(s.completed_at)-Date.parse(s.started_at)):null,providerElapsedMs:detail?.dispatchStartedAt&&detail.providerEndedAt?Math.max(0,Date.parse(detail.providerEndedAt)-Date.parse(detail.dispatchStartedAt)):null,detail,detailAvailability:detail?'retained' as const:s.result_json?'legacy-unavailable' as const:'redacted-or-unavailable' as const};});
 const interruptions=(await db.prepare('SELECT state,seconds,created_at,updated_at FROM intelligence_interruptions WHERE run_id=?').bind(row.id).all<{state:string;seconds:number;created_at:string;updated_at:string}>()).results.map(r=>({state:r.state,allowanceSeconds:r.seconds,createdAt:r.created_at,updatedAt:r.updated_at,measurement:'policy-allowance' as const}));
 return {timingProvenance:'client-dispatch-through-result-validation' as const,historicalCoverageGap:Math.max(0,row.attempts-attempts.filter(s=>s.detail).length),parentRunId:row.parent_id,humanAttention:{measurement:'unmeasured' as const,seconds:null},setup:{measurement:'unmeasured' as const,seconds:null},repair:{measurement:'unmeasured' as const,seconds:null},interruptions,attempts};
}
