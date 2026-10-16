import {collaborationReads,collaborationResult} from '../collaboration/reads';
import type { FeatureContext } from '../../app/feature-context';
import { ApiProblem } from '../../app/problems';
import { commitOperation, mutationGuard } from '../../app/operations';
import { requirePageLevel } from '../sharing/current-access';
import { pageOpenStatements } from '../analytics/service';
import { pageRow } from './repository';
import type { readPage } from './service';
import { createUlid } from '../../shared/ulid';
type ReadPage = Awaited<ReturnType<typeof readPage>>;
/** Only the authenticated document loader passes its read and ACL fence. */
export interface OpenedDocument { document: ReadPage; authorizationEpoch: number; sessionId: string }
/** The caller names the revision it rendered; this command never substitutes a newer revision. */
export async function openPage(ctx: FeatureContext, id: string, input: {operationKey:string;revisionId:string}, opened?: OpenedDocument) {
    if (typeof input.revisionId !== 'string' || !input.revisionId)
        throw new ApiProblem(400,'EXACT_REVISION_REQUIRED','Name the revision you opened.');
    let canEdit = false;
    let collaboration:ReturnType<typeof collaborationResult>|undefined;
    const result=await commitOperation(ctx, {
        operationKey: input.operationKey, action:'pages.open', request:{id,revisionId:input.revisionId},
        ...(opened?{commit:async(statements:D1PreparedStatement[])=>{
            const rows=await ctx.db.batch([...statements,...collaborationReads(ctx,id)]);
            collaboration=collaborationResult(opened.document,rows.slice(-2));
        }}:{}),
        authorize: async()=>{if(opened){ctx.authorizationEpoch=opened.authorizationEpoch;canEdit=['edit','full'].includes(opened.document.permissions.level);return;}const access=await requirePageLevel(ctx,id,'view');canEdit=access.decision.level==='edit'||access.decision.level==='full';},
        prepare:async()=>{
            const page=opened ? {id,trashed_at:null,revision_id:opened.document.page.revisionId,working_revision_id:opened.document.workingRevisionId,published_revision_id:opened.document.publishedRevisionId} : await pageRow(ctx,id);
            if(page.trashed_at)throw new ApiProblem(404,'NOT_FOUND','Not found.');
            const revisionId=canEdit ? page.working_revision_id : page.published_revision_id??page.working_revision_id;
            if(!opened && !await ctx.db.prepare('SELECT id FROM page_revisions WHERE id=? AND page_id=?').bind(revisionId,id).first())throw new ApiProblem(404,'NOT_FOUND','Not found.');
            if (input.revisionId!==revisionId) throw new ApiProblem(409,'STALE_REVISION','This page changed. Open the current content before verifying.');
            return {statements:[mutationGuard(ctx.db,'SELECT revision_id=? AND working_revision_id=? AND published_revision_id IS ? FROM pages WHERE id=?',[page.revision_id,page.working_revision_id,page.published_revision_id,id]),...(opened ? [
                ctx.db.prepare('INSERT INTO recent_pages(member_id,page_id,opened_at) VALUES(?,?,?) ON CONFLICT(member_id,page_id) DO UPDATE SET opened_at=excluded.opened_at').bind(ctx.actor.id,id,ctx.now),
                ...(opened.document.page.lifecycle==='draft'?[]:[ctx.db.prepare("INSERT INTO page_views(id,workspace_id,page_id,container_id,viewer_member_id,viewer_kind,is_own_page,viewed_at) SELECT ?,?,?,?,?,CASE member_kind WHEN 'guest' THEN 'guest' ELSE 'member' END,?,? FROM members WHERE id=?").bind(createUlid(),ctx.actor.workspaceId,id,opened.document.page.containerId,ctx.actor.id,+(opened.document.authorMemberId===ctx.actor.id),ctx.now,ctx.actor.id)]),
                ctx.db.prepare('INSERT INTO content_presence (page_id,member_id,session_id,cursor_json,expires_at) VALUES (?,?,?,NULL,?) ON CONFLICT(page_id,member_id,session_id) DO UPDATE SET expires_at=excluded.expires_at').bind(id,ctx.actor.id,opened.sessionId,new Date(Date.parse(ctx.now)+30000).toISOString()),
            ] : await pageOpenStatements(ctx,id)),ctx.db.prepare('INSERT INTO content_page_opens VALUES (?,?,?,?) ON CONFLICT(member_id,page_id,revision_id) DO UPDATE SET opened_at=excluded.opened_at').bind(ctx.actor.id,id,revisionId,ctx.now)],entity:{id,kind:'page',revisionId},value:{revisionId}};
        }
    });
    if(opened&&!collaboration) {
        // A receipt replay has no new write batch. Read its live state normally.
        const rows=await Promise.all(collaborationReads(ctx,id).map(query=>query.all()));
        collaboration=collaborationResult(opened.document,rows);
    }
    return {...result,...(collaboration?{collaboration}:{})};
}
