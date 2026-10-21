import type { FeatureContext } from '../../app/feature-context';
import { ApiProblem } from '../../app/problems';
import { currentSubject } from '../sharing/current-access';

/** The same current ownership predicate guards configuration and the final dispatch claim. */
export const chatOwnerSql = `(m.role='owner' OR (? IS NOT NULL AND EXISTS(
 SELECT 1 FROM container_owners co JOIN containers c ON c.id=co.container_id
 WHERE co.member_id=m.id AND co.container_id=? AND c.workspace_id=m.workspace_id)))`;
export async function requireChatOwner(ctx:FeatureContext,containerId:string|null=null) {
 await currentSubject(ctx);
 const row=await ctx.db.prepare(`SELECT 1 FROM members m WHERE m.id=? AND m.workspace_id=?
 AND m.status='active' AND m.member_kind='member' AND ${chatOwnerSql}`)
 .bind(ctx.actor.id,ctx.actor.workspaceId,containerId,containerId).first();
 if(!row)throw new ApiProblem(403,'FORBIDDEN','A workspace owner or the destination’s container owner is required.');
 if(containerId&&!await ctx.db.prepare('SELECT id FROM containers WHERE id=? AND workspace_id=?').bind(containerId,ctx.actor.workspaceId).first())throw new ApiProblem(404,'NOT_FOUND','Not found.');
}
