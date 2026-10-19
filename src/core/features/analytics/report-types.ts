export const reportKinds = ['views', 'stale', 'unowned', 'lapsed-verifications', 'most-viewed-unverified', 'no-results', 'container-growth'] as const;
export type ReportKind = typeof reportKinds[number];
export const reportLabels: Record<ReportKind, string> = {
  views: 'Views and unique viewers', stale: 'Stale pages', unowned: 'Pages without an owner',
  'lapsed-verifications': 'Lapsed verifications by owner', 'most-viewed-unverified': 'Most-viewed unverified pages',
  'no-results': 'Searches with no results', 'container-growth': 'Space growth',
};
export interface ReportInput { report?: string; containerId?: string; from?: string; to?: string; staleDays?: string }
export interface ReportScopes { workspace: boolean; containers: { id: string; name: string }[] }
export interface AnalyticsReport {
  report: ReportKind; title: string; columns: { key: string; label: string }[];
  rows: Record<string, string | number | null>[];
}
