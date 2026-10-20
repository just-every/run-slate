import { latestVerificationSql, verificationStateSql } from '../state';
import { linksTo } from '../../pages/details';
import type { RuleKind, RuleReason } from './definitions';

/**
 * STAT-007: which pages a rule would change tonight. A run and a preview share this
 * selection; the run treats it as a hint and its batch rechecks each page with
 * `ruleStillHoldsSql`. Pages are the container's live, non-record pages; "current"
 * is the one shared verification definition in `../state`.
 */
export interface RuleTarget { container_id: string; kind: RuleKind; days: number | null }
export interface RuleChange { pageId: string; title: string; verificationId: string | null; previousExpiresAt: string | null; reason: RuleReason }

const day = 86_400_000;
const candidate = "p.container_id=? AND p.deleted_at IS NULL AND p.trashed_at IS NULL AND p.archived_at IS NULL AND p.lifecycle IN ('live','live-with-unpublished-changes') AND p.page_kind<>'record'";
const current = `JOIN page_verifications v ON v.id=${latestVerificationSql('p')}`;
const reads = (now: string) => `(${verificationStateSql('p', 'v', now)})='current'`;
const cutoff = (target: RuleTarget, now: string) => new Date(Date.parse(now) - (target.days ?? 0) * day).toISOString();

/** The SQL and values selecting the rule's pages, optionally one page. Plain `?` placeholders only, so a mutation guard can wrap it. */
function selectionSql(target: RuleTarget, now: string, pageId?: string): { sql: string; values: string[] } {
  const one = pageId ? ' AND p.id=?' : '';
  const values = [target.container_id, ...(pageId ? [pageId] : [])];
  if (target.kind === 'cited-changed') return {
    // `instr` only narrows the candidates; `linksTo` decides what the body cites.
    sql: `SELECT p.id AS pageId,p.title,v.id AS verificationId,v.expires_at AS expiresAt,b.body_json AS body,cited.id AS citedId
 FROM pages p ${current} JOIN page_revisions b ON b.id=p.working_revision_id
 JOIN pages cited ON cited.workspace_id=p.workspace_id AND cited.id<>p.id AND cited.deleted_at IS NULL AND cited.trashed_at IS NULL
 JOIN page_revisions cr ON cr.id=cited.working_revision_id AND cr.created_at>v.created_at
 WHERE ${candidate}${one} AND ${reads('?')} AND instr(b.body_json,cited.id)>0`,
    values: [...values, now],
  };
  if (target.kind === 'no-owner') return {
    sql: `SELECT p.id AS pageId,p.title,NULL AS verificationId,NULL AS expiresAt,CASE WHEN p.owner_member_id IS NULL THEN 'unset' ELSE 'inactive' END AS owner
 FROM pages p WHERE ${candidate}${one} AND NOT EXISTS(SELECT 1 FROM members m WHERE m.id=p.owner_member_id AND m.workspace_id=p.workspace_id AND m.status='active')`,
    values,
  };
  return {
    sql: `SELECT p.id AS pageId,p.title,v.id AS verificationId,v.expires_at AS expiresAt,(SELECT MAX(lv.viewed_at) FROM page_views lv WHERE lv.page_id=p.id) AS lastViewedAt
 FROM pages p ${current} WHERE ${candidate}${one} AND ${reads('?')} AND NOT EXISTS(SELECT 1 FROM page_views pv WHERE pv.page_id=p.id AND pv.viewed_at>?)`,
    values: [...values, now, cutoff(target, now)],
  };
}

export async function selectRuleChanges(db: D1Database, target: RuleTarget, now: string, appOrigin?: string): Promise<RuleChange[]> {
  const { sql, values } = selectionSql(target, now);
  const rows = (await db.prepare(`${sql} ORDER BY p.id`).bind(...values).all<Record<string, string | null>>()).results;
  const changes = new Map<string, RuleChange>();
  const bodies = new Map<string, unknown>();
  for (const row of rows) {
    const pageId = row.pageId!;
    if (target.kind === 'cited-changed') {
      if (!bodies.has(pageId)) bodies.set(pageId, JSON.parse(row.body ?? '[]'));
      if (!linksTo(bodies.get(pageId), row.citedId!, appOrigin)) continue;
    }
    const existing = changes.get(pageId);
    if (existing?.reason.rule === 'cited-changed') { existing.reason.citedPageIds.push(row.citedId!); continue; }
    const reason: RuleReason = target.kind === 'cited-changed' ? { rule: 'cited-changed', citedPageIds: [row.citedId!] }
      : target.kind === 'no-owner' ? { rule: 'no-owner', owner: row.owner as 'unset' | 'inactive' }
      : { rule: 'unviewed', days: target.days!, lastViewedAt: row.lastViewedAt ?? null };
    changes.set(pageId, { pageId, title: row.title ?? 'Untitled', verificationId: row.verificationId ?? null, previousExpiresAt: row.expiresAt ?? null, reason });
  }
  return [...changes.values()];
}

/** A boolean SELECT for the run's batch: the page still meets the rule at commit. */
export function ruleStillHoldsSql(target: RuleTarget, now: string, change: RuleChange): { select: string; values: string[] } {
  const { sql, values } = selectionSql(target, now, change.pageId);
  const verification = change.verificationId ? ' AND v.id=?' : '';
  return { select: `SELECT EXISTS(${sql}${verification})`, values: [...values, ...(change.verificationId ? [change.verificationId] : [])] };
}
