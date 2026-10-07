/** Build stop accounting against the same live selection as the enclosing atomic stop transaction.
 * Legacy leases keep their existing conservative liability; no historical attempts are fabricated.
 */
export function interruptSelectedAttempts(db:D1Database,selection:string,values:(string|number|null)[],stamp:string,outcome:string){
 const selected=`SELECT * FROM intelligence_runs WHERE status='running' AND id IN (${selection})`;
 const attempts=`SELECT s.*,r.reserved_micros FROM intelligence_stages s JOIN (${selected}) r ON r.lease_id=s.id WHERE s.completed_at IS NULL AND json_extract(s.result_json,'$.version')=1`;
 const delta="CASE WHEN json_extract(result_json,'$.knownCost') IS NOT NULL THEN 0 WHEN json_extract(result_json,'$.phase')='dispatched' THEN (reserved_micros+2)/3-json_extract(result_json,'$.uncertainUpperBound') ELSE -json_extract(result_json,'$.uncertainUpperBound') END";
 return [
 db.prepare(`UPDATE intelligence_runs SET uncertain_cost_micros=uncertain_cost_micros+COALESCE((SELECT ${delta} FROM (${attempts}) a WHERE a.run_id=intelligence_runs.id),0) WHERE id IN (SELECT run_id FROM (${attempts}))`).bind(...values,...values),
 db.prepare(`UPDATE intelligence_budgets SET uncertain_micros=uncertain_micros+COALESCE((SELECT ${delta} FROM (${attempts}) a WHERE json_extract(a.result_json,'$.reservationId')=intelligence_budgets.id),0) WHERE id IN (SELECT json_extract(result_json,'$.reservationId') FROM (${attempts}))`).bind(...values,...values),
 db.prepare(`UPDATE intelligence_budgets SET uncertain_micros=MAX(uncertain_micros,reserved_micros-charged_micros) WHERE released_at IS NULL AND run_id IN (SELECT r.id FROM (${selected}) r WHERE NOT EXISTS(SELECT 1 FROM intelligence_stages s WHERE s.id=r.lease_id AND json_extract(s.result_json,'$.version')=1))`).bind(...values),
 db.prepare(`UPDATE intelligence_runs SET uncertain_cost_micros=MAX(uncertain_cost_micros,reserved_micros-cost_micros) WHERE id IN (SELECT r.id FROM (${selected}) r WHERE NOT EXISTS(SELECT 1 FROM intelligence_stages s WHERE s.id=r.lease_id AND json_extract(s.result_json,'$.version')=1))`).bind(...values),
 db.prepare(`UPDATE intelligence_stages SET state='failed',completed_at=?,result_json=json_set(result_json,'$.outcome',?,'$.errorCode',?,'$.measurement','recovery-observed-bound','$.uncertainUpperBound',CASE WHEN json_extract(result_json,'$.knownCost') IS NOT NULL THEN 0 WHEN json_extract(result_json,'$.phase')='dispatched' THEN (SELECT (reserved_micros+2)/3 FROM intelligence_runs WHERE id=run_id) ELSE 0 END,'$.knownCost',CASE WHEN json_extract(result_json,'$.phase')='admission' THEN 0 ELSE json_extract(result_json,'$.knownCost') END,'$.knownTokens',CASE WHEN json_extract(result_json,'$.phase')='admission' THEN 0 ELSE json_extract(result_json,'$.knownTokens') END) WHERE id IN (SELECT id FROM (${attempts}))`).bind(stamp,outcome,outcome,...values),
 ];
}
