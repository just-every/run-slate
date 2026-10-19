import type { AnalyticsReport } from './report-types';

/** Quote every cell and neutralize spreadsheet formulas in user-controlled text. */
export function reportCsv(report: AnalyticsReport) {
  const cell = (value: string | number | null) => {
    const text = value === null ? '' : String(value);
    const safe = typeof value === 'string' && /^[\s\u0000-\u001f]*[=+@-]/u.test(text) ? `'${text}` : text;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  return [report.columns.map(c => cell(c.label)).join(','), ...report.rows.map(row => report.columns.map(c => cell(row[c.key] ?? null)).join(','))].join('\r\n') + '\r\n';
}
