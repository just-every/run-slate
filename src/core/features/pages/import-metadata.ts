import type { FeatureContext } from '../../app/feature-context';
import type { PageLifecycle } from '../../shared/knowledge/model';
import { ApiProblem } from '../../app/problems';
export function prepareImportedPageMetadata(ctx: FeatureContext, pageId: string, input: {
    accessInheritance?: 'inherit' | 'restricted';
    lifecycle?: PageLifecycle;
    createdAt?: string;
    updatedAt?: string;
    publishedRevisionId?: string | null;
    workingRevisionId?: string;
}) {
    if (input.lifecycle === 'scheduled')
        throw new ApiProblem(400, 'IMPORT_SCHEDULE_REQUIRES_AUTHORITY', 'Imported schedules require a new explicit schedule.');
    return [ctx.db.prepare('UPDATE pages SET access_inheritance=COALESCE(?,access_inheritance),lifecycle=COALESCE(?,lifecycle),archived_at=CASE WHEN ?=\'archived\' THEN ? ELSE archived_at END,created_at=COALESCE(?,created_at),updated_at=COALESCE(?,updated_at),published_revision_id=CASE WHEN ? THEN ? ELSE published_revision_id END,working_revision_id=COALESCE(?,working_revision_id) WHERE id=? AND workspace_id=?').bind(input.accessInheritance ?? null, input.lifecycle ?? null, input.lifecycle ?? null, ctx.now, input.createdAt ?? null, input.updatedAt ?? null, +(input.publishedRevisionId !== undefined), input.publishedRevisionId ?? null, input.workingRevisionId ?? null, pageId, ctx.actor.workspaceId)];
}
