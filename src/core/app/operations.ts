import {refreshSearchIndex} from '../features/search/index';
import {dispatchCommittedNotifications} from '../features/notifications/dispatch';
import type { FeatureContext } from './feature-context';
import { ApiProblem } from './problems';
import type { EntityRef, JsonValue, MutationReceipt } from '../shared/api/common';
import { createUlid } from '../shared/ulid';
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  if(value===undefined || (typeof value==='number'&&!Number.isFinite(value)) || typeof value==='function' || typeof value==='symbol' || typeof value==='bigint') throw new ApiProblem(400,'INVALID_REQUEST','Operation inputs must be JSON values.');
  return JSON.stringify(value);
}
export async function requestHash(value: unknown): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(value)));
  return Array.from(new Uint8Array(bytes), b=>b.toString(16).padStart(2,'0')).join('');
}
export interface MutationPlan<T> { statements: D1PreparedStatement[]; entity: EntityRef; value: T; detail?: JsonValue; noChange?: boolean }
/** Domain callers must include immutable revision writes and SQL CAS guards in statements. */
export async function commitOperation<T>(ctx: FeatureContext, input: {
  operationKey: string; action: string; request: unknown;
  commit?: (statements:D1PreparedStatement[]) => Promise<unknown>;
  authorize: () => Promise<void>;
  prepare: (receipt: { revisionId: string; activityId: string }) => Promise<MutationPlan<T>>;
}): Promise<{ value: T; receipt: MutationReceipt }> {
  if (!/^[A-Za-z0-9_.:-]{8,160}$/.test(input.operationKey)) throw new ApiProblem(400,'INVALID_OPERATION_KEY','Supply an operation key of 8–160 safe characters.');
  ctx.authorizationEpoch = undefined;
  await input.authorize();
  const authorizationEpoch=ctx.authorizationEpoch;
  const hash = await requestHash({action: input.action, request: input.request});
  const lookup = async () => ctx.db.prepare('SELECT request_hash,response_json,expires_at FROM operation_receipts WHERE workspace_id=? AND actor_member_id=? AND operation_key=?').bind(ctx.actor.workspaceId,ctx.actor.id,input.operationKey).first<{request_hash:string;response_json:string;expires_at:string}>();
  const replay = (row: {request_hash:string;response_json:string;expires_at:string}) => {
    if (row.request_hash !== hash || row.expires_at <= ctx.now) throw new ApiProblem(409,'OPERATION_KEY_CONFLICT','This operation key cannot be reused.');
    return JSON.parse(row.response_json) as {value:T;receipt:MutationReceipt};
  };
  const previous = await lookup(); if (previous) { await refreshAfterCommit(ctx); return replay(previous); }
  const revisionId = createUlid(), activityId = createUlid();
  const plan = await input.prepare({revisionId,activityId});
  const receipt: MutationReceipt = {operationKey:input.operationKey,entity:plan.entity,revisionId:plan.entity.revisionId,activityId:plan.noChange?null:activityId,committedAt:ctx.now,...(plan.noChange?{unchanged:true as const}:{})};
  const result = {value:plan.value,receipt};
  const expires = new Date(Date.parse(ctx.now)+86400000).toISOString();
  try {
    await (input.commit ?? (statements=>ctx.db.batch(statements)))([
      ctx.db.prepare('INSERT INTO operation_receipts (id,workspace_id,actor_member_id,operation_key,request_hash,target_kind,target_id,response_status,response_json,created_at,expires_at) VALUES (?,?,?,?,?,?,?,200,?,?,?)').bind(createUlid(),ctx.actor.workspaceId,ctx.actor.id,input.operationKey,hash,plan.entity.kind,plan.entity.id,JSON.stringify(result),ctx.now,expires),
      ...(authorizationEpoch === undefined ? [] : [mutationGuard(ctx.db, 'SELECT epoch=? FROM core_acl_epoch WHERE id=1',[authorizationEpoch])]),
      mutationGuard(ctx.db, "SELECT status='active' FROM members WHERE id=? AND workspace_id=?", [ctx.actor.id,ctx.actor.workspaceId]),
      ...(ctx.stepUp ? [freshProofGuard(ctx)] : []),
      ...plan.statements,
      ...(plan.noChange?[]:[ctx.db.prepare('INSERT INTO activity_entries (id,workspace_id,actor_member_id,feature,action,target_kind,target_id,detail_json,operation_key,occurred_at) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(activityId,ctx.actor.workspaceId,ctx.actor.id,input.action.split('.')[0],input.action,plan.entity.kind,plan.entity.id,JSON.stringify(plan.detail??{}),input.operationKey,ctx.now)]),
    ]);
  } catch (cause) {
    const raced = await lookup(); if (raced) { await input.authorize(); await refreshAfterCommit(ctx); return replay(raced); }
    if (String(cause).includes('core_write_guards') || String(cause).includes('CHECK constraint')) throw new ApiProblem(409,'REVISION_CONFLICT','The record changed. Reload before saving.');
    if(String(cause).includes('UNIQUE constraint')) throw new ApiProblem(409,'ENTITY_CONFLICT','An existing record conflicts with this change.');
    throw cause;
  }
  await refreshAfterCommit(ctx);
  await dispatchCommittedNotifications(ctx);
  return result;
}
/** The asking session still holds a fresh step-up proof at the member's current authority version. */
export function freshProofGuard(ctx: FeatureContext): D1PreparedStatement {
  const proof = ctx.stepUp!;
  return mutationGuard(ctx.db, "SELECT EXISTS(SELECT 1 FROM sessions s JOIN members m ON m.id=s.member_id WHERE s.id=? AND s.member_id=? AND m.status='active' AND s.revoked_at IS NULL AND s.proof_at>=? AND s.proof_version=COALESCE((SELECT version FROM member_authority WHERE member_id=m.id),1))", [proof.sessionId, ctx.actor.id, proof.since]);
}
/** Guard SELECT must return a boolean scalar. It executes inside the same atomic D1 batch as writes. */
export function mutationGuard(db: D1Database, select: string, values: (string | number | null)[]): D1PreparedStatement {
  if (!/^SELECT\s/i.test(select)) throw new Error('Mutation guard requires a SELECT.');
  return db.prepare(`INSERT INTO core_write_guards (id,accepted) VALUES (?, COALESCE((${select}),0))`).bind(createUlid(),...values);
}

/** The receipt is already committed. Dirty rows retain failed work; the next read/replay drains them. */
async function refreshAfterCommit(ctx:FeatureContext):Promise<void> {
  try { await refreshSearchIndex(ctx); }
  catch(error) { console.error('Search refresh pending; canonical mutation committed.',error); }
}
