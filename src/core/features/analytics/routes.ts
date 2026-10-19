import { personalJson } from '../navigation/request';
import { Hono } from 'hono';
import type { AppEnvironment } from '../../app/types';
import { featureContext } from '../../app/feature-context';
import { analytics, recordView } from './service';
import { analyticsReport } from './reports';
import { reportScopes } from './report-scope';
import { reportCsv } from './report-csv';

export function createAnalyticsRoutes() {
  const app = new Hono<AppEnvironment>();
  app.use('*', personalJson);
  app.get('/report-scopes', async c => c.json(await reportScopes(featureContext(c))));
  app.get('/reports', async c => {
    const report = await analyticsReport(featureContext(c), c.req.query());
    if (c.req.query('format') === 'csv') return c.body(reportCsv(report), 200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="slate-${report.report}.csv"`,
      'Cache-Control': 'private, no-store',
    });
    return c.json(report);
  });
  app.get('/', async c => c.json(await analytics(featureContext(c), c.req.query())));
  app.post('/views', async c => c.json(await recordView(featureContext(c), await c.req.json())));
  return app;
}
