import type { FeatureContext } from '../../app/feature-context';
import { ApiProblem } from '../../app/problems';
import { commitOperation, mutationGuard } from '../../app/operations';
import { requirePageLevel } from '../sharing/current-access';
import { pageOpenStatements } from '../analytics/service';
import { readPage } from './service';
/** The caller names the revision it rendered; this command never substitutes a newer revision. */
export async function openPage(ctx: FeatureContext, id: string, input: {operationKey:string;revisionId:string}) {
    if (typeof input.revisionId !== 'string' || !input.revisionId)
        throw new ApiProblem(400,'EXACT_REVISION_REQUIRED','Name the revision you opened.');
    return commitOperation(ctx, {
        operationKey: input.operationKey, action:'pages.open', request:{id,revisionId:input.revisionId},
        authorize: async()=>{await requirePageLevel(ctx,id,'view');},
        prepare:async()=>{
            const doc=await readPage(ctx,id);
            const revisionId=doc.permissions.level==='edit'||doc.permissions.level==='full' ? doc.workingRevisionId : doc.publishedRevisionId??doc.workingRevisionId;
            if (input.revisionId!==revisionId) throw new ApiProblem(409,'STALE_REVISION','This page changed. Open the current content before verifying.');
            return {statements:[mutationGuard(ctx.db,'SELECT revision_id=? AND working_revision_id=? AND published_revision_id IS ? FROM pages WHERE id=?',[doc.page.revisionId,doc.workingRevisionId,doc.publishedRevisionId,id]),...await pageOpenStatements(ctx,id),ctx.db.prepare('INSERT INTO content_page_opens VALUES (?,?,?,?) ON CONFLICT(member_id,page_id,revision_id) DO UPDATE SET opened_at=excluded.opened_at').bind(ctx.actor.id,id,revisionId,ctx.now)],entity:{id,kind:'page',revisionId},value:{revisionId}};
        }
    });
}
