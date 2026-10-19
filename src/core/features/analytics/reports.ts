import type { FeatureContext } from '../../app/feature-context';
import { ApiProblem } from '../../app/problems';
import { latestVerificationSql, verificationStateSql } from '../page-status/state';
import { reportContainers, readableReportPages, reportScopes } from './report-scope';
import { reportKinds, reportLabels, type AnalyticsReport, type ReportInput, type ReportKind } from './report-types';

interface Page {
  id: string; title: string; containerId: string; container: string; owner: string | null;
  ownerId: string | null; createdAt: string; lastEditedAt: string; verifiedAt: string | null;
  expiresAt: string | null; verification: string | null;
}
const columns = (pairs: [string, string][]) => pairs.map(([key, label]) => ({ key, label }));
const pageColumns: [string, string][] = [['title', 'Page'], ['container', 'Space']];
function date(value?: string) {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new ApiProblem(400, 'INVALID_DATE', 'Invalid analytics date.');
  return new Date(parsed).toISOString();
}

/** Aggregate reports never return a reader identity or an individual's reading history. */
export async function analyticsReport(ctx: FeatureContext, input: ReportInput): Promise<AnalyticsReport> {
  if (!reportKinds.includes(input.report as ReportKind)) throw new ApiProblem(400, 'INVALID_REPORT', 'Choose an analytics report.');
  const report = input.report as ReportKind, from = date(input.from), to = date(input.to);
  if (from && to && from > to) throw new ApiProblem(400, 'INVALID_DATE_RANGE', 'From must be on or before Until.');
  const staleDays = input.staleDays === undefined ? 90 : Number(input.staleDays);
  if (!Number.isInteger(staleDays) || staleDays < 1 || staleDays > 36500) throw new ApiProblem(400, 'INVALID_PERIOD', 'Choose a stale period from 1 to 36500 days.');
  const containers = await reportContainers(ctx, input.containerId), ids = JSON.stringify(containers.map(c => c.id));
  const result = (pairs: [string, string][], rows: AnalyticsReport['rows']): AnalyticsReport => ({ report, title: reportLabels[report], columns: columns(pairs), rows });
  if (report === 'no-results') {
    const { workspace } = await reportScopes(ctx);
    const rows = (await ctx.db.prepare(`SELECT s.query,s.day,s.searches,c.name AS container FROM analytics_no_result_searches s
      LEFT JOIN containers c ON c.id=s.container_scope AND c.workspace_id=s.workspace_id
      WHERE s.workspace_id=? AND (s.container_scope IN (SELECT value FROM json_each(?)) OR (?=1 AND s.container_scope=''))
      AND (? IS NULL OR s.day>=substr(?,1,10)) AND (? IS NULL OR s.day<=substr(?,1,10)) ORDER BY s.searches DESC,s.query,s.day`)
      .bind(ctx.actor.workspaceId, ids, +!!(workspace && !input.containerId), from, from, to, to)
      .all<{ query: string; day: string; searches: number; container: string | null }>()).results;
    return result([['query', 'Search'], ['container', 'Scope'], ['day', 'Day (UTC)'], ['searches', 'Searches']], rows.map(r => ({ ...r, container: r.container ?? 'Workspace' })));
  }
  const candidates = (await ctx.db.prepare(`SELECT p.id,p.title,p.container_id AS containerId,c.name AS container,p.owner_member_id AS ownerId,
    CASE WHEN m.member_kind='member' THEN m.display_name END AS owner,p.created_at AS createdAt,
    COALESCE((SELECT MAX(r.created_at) FROM page_revisions r WHERE r.page_id=p.id AND r.deleted_at IS NULL),p.created_at) AS lastEditedAt,
    v.created_at AS verifiedAt,v.expires_at AS expiresAt,${verificationStateSql('p', 'v', '?')} AS verification
    FROM pages p JOIN containers c ON c.id=p.container_id LEFT JOIN members m ON m.id=p.owner_member_id AND m.workspace_id=p.workspace_id
    LEFT JOIN page_verifications v ON v.id=${latestVerificationSql('p')}
    WHERE p.workspace_id=? AND p.container_id IN (SELECT value FROM json_each(?))
    AND p.deleted_at IS NULL AND p.trashed_at IS NULL AND p.lifecycle NOT IN ('draft','scheduled') ORDER BY p.title,p.id`)
    .bind(ctx.now, ctx.actor.workspaceId, ids).all<Page>()).results;
  const readable = await readableReportPages(ctx, candidates.map(p => p.id)), pages = candidates.filter(p => readable.has(p.id));
  const pageRow = (p: Page) => ({ pageId: p.id, title: p.title, containerId: p.containerId, container: p.container });
  if (report === 'stale') {
    const cutoff = new Date(Date.parse(to ?? ctx.now) - staleDays * 86400000).toISOString();
    return result([...pageColumns, ['lastEditedAt', 'Last edited'], ['verifiedAt', 'Last verified']], pages.filter(p => p.lastEditedAt <= cutoff && (!p.verifiedAt || p.verifiedAt <= cutoff)).map(p => ({ ...pageRow(p), lastEditedAt: p.lastEditedAt, verifiedAt: p.verifiedAt })));
  }
  if (report === 'unowned') return result(pageColumns, pages.filter(p => !p.ownerId).map(pageRow));
  if (report === 'lapsed-verifications') return result([['owner', 'Owner'], ...pageColumns, ['expiresAt', 'Lapsed at']], pages.filter(p => p.verification === 'lapsed').sort((a, b) => (a.owner ?? '').localeCompare(b.owner ?? '') || a.title.localeCompare(b.title)).map(p => ({ ...pageRow(p), owner: p.owner ?? (p.ownerId ? 'Private or former member' : 'Unassigned'), expiresAt: p.expiresAt })));
  if (report === 'container-growth') {
    const rows: AnalyticsReport['rows'] = [];
    for (const container of containers) {
      const selected = pages.filter(p => p.containerId === container.id && (!to || p.createdAt <= to));
      let totalPages = selected.filter(p => from && p.createdAt < from).length;
      const byDay = new Map<string, number>();
      for (const p of selected) if (!from || p.createdAt >= from) byDay.set(p.createdAt.slice(0, 10), (byDay.get(p.createdAt.slice(0, 10)) ?? 0) + 1);
      for (const [day, pagesCreated] of [...byDay].sort(([a], [b]) => a.localeCompare(b))) {
        totalPages += pagesCreated;
        rows.push({ containerId: container.id, container: container.name, day, pagesCreated, totalPages });
      }
    }
    return result([['container', 'Space'], ['day', 'Day (UTC)'], ['pagesCreated', 'Pages created'], ['totalPages', 'Total pages']], rows);
  }
  const views = (await ctx.db.prepare(`SELECT page_id AS pageId,COUNT(*) AS views,COUNT(DISTINCT viewer_member_id) AS uniqueViewers FROM page_views
    WHERE workspace_id=? AND page_id IN (SELECT value FROM json_each(?)) AND (? IS NULL OR viewed_at>=?) AND (? IS NULL OR viewed_at<=?) GROUP BY page_id`)
    .bind(ctx.actor.workspaceId, JSON.stringify(pages.map(p => p.id)), from, from, to, to).all<{ pageId: string; views: number; uniqueViewers: number }>()).results;
  const counts = new Map(views.map(v => [v.pageId, v]));
  const rows = pages.filter(p => report === 'views' || p.verification !== 'current' && (counts.get(p.id)?.views ?? 0) > 0)
    .map(p => ({ ...pageRow(p), views: counts.get(p.id)?.views ?? 0, uniqueViewers: counts.get(p.id)?.uniqueViewers ?? 0 }))
    .sort((a, b) => b.views - a.views || a.title.localeCompare(b.title));
  return result([...pageColumns, ['views', 'Views'], ['uniqueViewers', 'Unique signed-in viewers']], rows);
}
