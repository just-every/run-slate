import type { FeatureContext } from '../../../app/feature-context';
import { requestHash } from '../../../app/operations';
import { starterTemplates } from './catalog';

type ProvisionContext = Pick<FeatureContext, 'db' | 'now'> & {
  actor: Pick<FeatureContext['actor'], 'workspaceId'>;
};
const templateId = (workspaceKey: string, key: string) => `starter:${workspaceKey}:${key}`;

/** Include in the first-run transaction. Stable IDs and insert-only writes preserve existing templates. */
export async function starterTemplateStatements(
  ctx: ProvisionContext,
  options: { completedOnly?: boolean } = {},
): Promise<D1PreparedStatement[]> {
  const workspaceKey = await requestHash(ctx.actor.workspaceId);
  return starterTemplates.map(starter => {
    const id = templateId(workspaceKey, starter.key);
    return ctx.db.prepare(`INSERT INTO knowledge_templates
      (id,workspace_id,container_id,title,description,category,snapshot_json,is_shipped,created_at,updated_at,revision_id)
      SELECT ?,?,NULL,?,?,?,?,1,?,?,?
      ${options.completedOnly ? 'WHERE EXISTS (SELECT 1 FROM workspaces WHERE id=? AND first_run_completed_at IS NOT NULL)' : ''}
      ON CONFLICT(id) DO NOTHING`).bind(
      id, ctx.actor.workspaceId, starter.title, starter.description, starter.category,
      JSON.stringify(starter.snapshot), ctx.now, ctx.now, `${id}:initial`,
      ...(options.completedOnly ? [ctx.actor.workspaceId] : []),
    );
  });
}

/** A restored identity-only destination must stay empty until its first run is complete. */
export async function ensureStarterTemplates(ctx: ProvisionContext): Promise<void> {
  const workspaceKey = await requestHash(ctx.actor.workspaceId);
  const ids = starterTemplates.map(starter => templateId(workspaceKey, starter.key));
  const inventory = await ctx.db.prepare(`SELECT (
    SELECT COUNT(*) FROM knowledge_templates t WHERE t.workspace_id=w.id AND t.id IN (${ids.map(() => '?').join(',')})
    ) AS provisioned FROM workspaces w WHERE w.id=? AND w.first_run_completed_at IS NOT NULL`
  ).bind(...ids, ctx.actor.workspaceId).first<{provisioned:number}>();
  if (!inventory || inventory.provisioned === ids.length) return;
  await ctx.db.batch(await starterTemplateStatements(ctx, { completedOnly: true }));
}
