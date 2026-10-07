import type { FeatureContext } from '../../app/feature-context';
import { commitOperation, mutationGuard, requestHash } from '../../app/operations';
import { requirePageLevel } from '../sharing/current-access';
import { assertCanPublishPublicPage } from '../sharing/access';
import { requireGrant } from '../effects/grants';
import { preparePublicExposure, type ExposureInput } from './service';
import { pageRow } from '../pages/repository';
/** Granted publication remains distinct from human verification and internal maintenance. */
export async function publishGrantedPage(ctx: FeatureContext, pageId: string, input: ExposureInput & {
    grantId: string;
    sourcePageIds: string[];
}) { const request = { kind: 'effect', operation: 'page.publish', target: pageId, sourceIds: input.sourcePageIds, audience: ['public'], costMicros: 0, contentHash: await requestHash({ revisionId: input.expectedRevisionId, host: input.host, slug: input.slug }), conditions: { revisionId: input.expectedRevisionId } }; const authorize = async () => { const a = await requirePageLevel(ctx, pageId, 'full'); assertCanPublishPublicPage(a.context); for (const id of input.sourcePageIds) {
    const source = await requirePageLevel(ctx, id, 'full');
    assertCanPublishPublicPage(source.context);
} await requireGrant(ctx, input.grantId, request); }; return commitOperation(ctx, { operationKey: input.operationKey, action: 'publishing.granted', request: { pageId, ...input }, authorize, prepare: async () => { const grant = await requireGrant(ctx, input.grantId, request); const plan = await preparePublicExposure(ctx, pageId, input); plan.statements.unshift(mutationGuard(ctx.db, 'SELECT revision_id=? AND revoked_at IS NULL AND expires_at>? FROM intelligence_grants WHERE id=?', [grant.row.revision_id, ctx.now, grant.row.id])); return plan; } }); }
