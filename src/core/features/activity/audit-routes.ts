import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnvironment } from '../../app/types';
import { featureContext } from '../../app/feature-context';
import { requireStepUp } from '../session/step-up';
import { requireWorkspaceOwner } from '../sharing/current-access';
import { exportAudit } from './audit-export';
import { auditSettings, saveAuditSettings } from './audit-settings';
import { subscribe } from '../webhooks/configuration';
export function createAuditRoutes() {
  return new Hono<AppEnvironment>()
    .get('/settings', async c => c.json(await auditSettings(featureContext(c))))
    .put('/settings', async c => { await requireWorkspaceOwner(featureContext(c)); await requireStepUp(c, 'delete'); return c.json(await saveAuditSettings(featureContext(c), z.object({ operationKey: z.string().min(8), retentionDays: z.number().int() }).strict().parse(await c.req.json()))); })
    .post('/export', async c => { await requireWorkspaceOwner(featureContext(c)); await requireStepUp(c, 'export'); return exportAudit(featureContext(c), await c.req.json(), () => requireStepUp(c, 'export')); })
    .post('/streams', async c => { await requireWorkspaceOwner(featureContext(c)); await requireStepUp(c, 'credentials:mint'); return c.json(await subscribe(featureContext(c), await c.req.json(), 'audit')); });
}
