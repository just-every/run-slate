import {interruptSelectedAttempts} from '../runs/attempt-interruption';
import type {FeatureContext} from '../../app/feature-context';
/** One atomic stop path. Confirmed and uncertain effects remain audit/reconciliation records. */
export function trialStopStatements(ctx:FeatureContext,trialId:string,revisionId:string,reason:string):D1PreparedStatement[]{
 const runs="SELECT id FROM intelligence_runs WHERE workspace_id=? AND json_extract(input_json,'$.trialId')=?";
 return [...interruptSelectedAttempts(ctx.db,runs,[ctx.actor.workspaceId,trialId],ctx.now,'TRIAL_STOPPED'),ctx.db.prepare("UPDATE intelligence_experiments SET state='stopped',revision_id=? WHERE id=?").bind(revisionId,trialId),ctx.db.prepare(`UPDATE intelligence_effects SET state='cancelled',failure_reason=? WHERE state='prepared' AND run_id IN (${runs})`).bind(reason,ctx.actor.workspaceId,trialId),ctx.db.prepare(`UPDATE intelligence_budgets SET released_at=? WHERE released_at IS NULL AND run_id IN (${runs})`).bind(ctx.now,ctx.actor.workspaceId,trialId),ctx.db.prepare("UPDATE intelligence_runs SET status='cancelled',failure_reason=?,settled_at=?,deadline_at=NULL,lease_id=NULL WHERE workspace_id=? AND json_extract(input_json,'$.trialId')=? AND status IN ('queued','running','paused','needs-review')").bind(reason,ctx.now,ctx.actor.workspaceId,trialId)];
}
