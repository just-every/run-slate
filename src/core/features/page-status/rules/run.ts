import type { AppBindings, AuthenticatedMember } from '../../../app/types';
import type { FeatureContext } from '../../../app/feature-context';
import { commitOperation, mutationGuard } from '../../../app/operations';
import { ApiProblem } from '../../../app/problems';
import { createUlid } from '../../../shared/ulid';
import { currentSubject } from '../../sharing/current-access';
import { selectRuleChanges, ruleStillHoldsSql, type RuleChange } from './selection';
import { ruleNoticeStatements, type ChangedPage } from './notice';
import type { RuleRow } from './store';

/**
 * STAT-007: the nightly run. Each container's due rules run once per UTC night, in one
 * atomic batch with a durable receipt per rule (`verification_rule_runs`). A rule turned
 * on during a night first runs the next night. Selection is a hint: the batch rechecks
 * every rule and page, so concurrent cron/queue invocations and restarts commit one run.
 * Unverify ends the latest verification as lapsed by moving its expiry to the run time,
 * never later, and marks its STAT-004 lapse notice sent; it writes no verification row
 * and no status. The system is the actor of every entry.
 */
export async function runVerificationRules(env: AppBindings, now = new Date().toISOString()) {
  const night = now.slice(0, 10), nightStart = `${night}T00:00:00.000Z`;
  const due = (await env.DB.prepare(`SELECT DISTINCT r.workspace_id AS workspaceId,r.container_id AS containerId FROM verification_rules r JOIN containers c ON c.id=r.container_id
 WHERE r.enabled=1 AND r.enabled_at<? AND c.trashed_at IS NULL AND NOT EXISTS(SELECT 1 FROM verification_rule_runs x WHERE x.rule_id=r.id AND x.night=?) ORDER BY 1,2`).bind(nightStart, night).all<{ workspaceId: string; containerId: string }>()).results;
  let runs = 0;
  for (const { workspaceId, containerId } of due) {
    const actor = await env.DB.prepare("SELECT m.id,m.workspace_id AS workspaceId,m.email,m.display_name AS displayName,m.initials,m.role,w.name AS workspaceName FROM members m JOIN workspaces w ON w.id=m.workspace_id WHERE m.workspace_id=? AND m.status='active' AND m.role='owner' AND m.member_kind='member' ORDER BY m.id LIMIT 1").bind(workspaceId).first<AuthenticatedMember>();
    if (!actor) continue;
    const ctx: FeatureContext = { db: env.DB, files: env.FILES, jobs: env.JOBS, actor, now };
    try { await runContainer(ctx, containerId, night, env.APP_URL); runs++; }
    catch (error) {
      // Another invocation committed this night, or a page changed under the batch: the next invocation reselects.
      if (error instanceof ApiProblem && (error.code === 'REVISION_CONFLICT' || error.code === 'ENTITY_CONFLICT')) continue;
      throw error;
    }
  }
  return { runs };
}

const dueRules = (ctx: FeatureContext, containerId: string, night: string) => ctx.db.prepare('SELECT * FROM verification_rules r WHERE r.container_id=? AND r.enabled=1 AND r.enabled_at<? AND NOT EXISTS(SELECT 1 FROM verification_rule_runs x WHERE x.rule_id=r.id AND x.night=?) ORDER BY r.kind')
  .bind(containerId, `${night}T00:00:00.000Z`, night).all<RuleRow>();

function activity(ctx: FeatureContext, operationKey: string, rule: RuleRow, change: RuleChange, action: 'unverified' | 'flagged') {
  const detail = { ruleId: rule.id, reason: change.reason, verificationId: change.verificationId, ...(action === 'unverified' ? { previousExpiresAt: change.previousExpiresAt } : {}) };
  return ctx.db.prepare("INSERT INTO activity_entries (id,workspace_id,actor_member_id,feature,action,target_kind,target_id,detail_json,operation_key,occurred_at) VALUES (?,?,NULL,'verification-rules',?,'page',?,?,?,?)")
    .bind(createUlid(), ctx.actor.workspaceId, `verification-rules.${action}`, change.pageId, JSON.stringify(detail), operationKey, ctx.now);
}

async function runContainer(ctx: FeatureContext, containerId: string, night: string, appOrigin?: string) {
  if (!(await dueRules(ctx, containerId, night)).results.length) return;
  const operationKey = `verification-rules:${containerId}:${night}`;
  return commitOperation(ctx, { operationKey, action: 'verification-rules.run', request: { containerId, night }, authorize: async () => { await currentSubject(ctx); }, prepare: async ({ revisionId }) => {
    const statements: D1PreparedStatement[] = [], changed: ChangedPage[] = [];
    for (const rule of (await dueRules(ctx, containerId, night)).results) {
      const target = { container_id: containerId, kind: rule.kind, days: rule.days };
      const changes = await selectRuleChanges(ctx.db, target, ctx.now, appOrigin);
      const existing = new Set((await ctx.db.prepare('SELECT page_id FROM verification_rule_flags WHERE rule_id=?').bind(rule.id).all<{ page_id: string }>()).results.map(r => r.page_id));
      const applied = rule.action === 'unverify' ? changes : changes.filter(c => !existing.has(c.pageId));
      const holding = new Set(changes.map(c => c.pageId));
      const cleared = rule.action === 'flag' ? [...existing].filter(id => !holding.has(id)) : [];
      statements.push(mutationGuard(ctx.db, 'SELECT enabled=1 AND revision_id=? AND enabled_at<? FROM verification_rules WHERE id=?', [rule.revision_id, `${night}T00:00:00.000Z`, rule.id]),
        ctx.db.prepare('INSERT INTO verification_rule_runs (rule_id,night,unverified,flagged,cleared,created_at) VALUES (?,?,?,?,?,?)').bind(rule.id, night, rule.action === 'unverify' ? applied.length : 0, rule.action === 'flag' ? applied.length : 0, cleared.length, ctx.now));
      for (const change of applied) {
        const holds = ruleStillHoldsSql(target, ctx.now, change);
        statements.push(mutationGuard(ctx.db, holds.select, holds.values));
        if (rule.action === 'unverify') statements.push(ctx.db.prepare('UPDATE page_verifications SET expires_at=?,lapsed_notified_at=COALESCE(lapsed_notified_at,?) WHERE id=? AND (expires_at IS NULL OR expires_at>?)').bind(ctx.now, ctx.now, change.verificationId, ctx.now));
        else statements.push(ctx.db.prepare('INSERT INTO verification_rule_flags (rule_id,page_id,reason_json,flagged_at) VALUES (?,?,?,?)').bind(rule.id, change.pageId, JSON.stringify(change.reason), ctx.now));
        statements.push(activity(ctx, operationKey, rule, change, rule.action === 'unverify' ? 'unverified' : 'flagged'));
        changed.push({ pageId: change.pageId, title: change.title, change: rule.action === 'unverify' ? 'unverified' : 'flagged', rule: rule.kind });
      }
      for (const pageId of cleared) statements.push(ctx.db.prepare('DELETE FROM verification_rule_flags WHERE rule_id=? AND page_id=?').bind(rule.id, pageId));
    }
    statements.push(...await ruleNoticeStatements(ctx, containerId, night, changed));
    // Entries above name the system as actor, one per changed page; the run adds no member-attributed entry.
    return { statements, entity: { id: containerId, kind: 'container', revisionId }, value: { changed: changed.length }, noChange: true };
  } });
}
