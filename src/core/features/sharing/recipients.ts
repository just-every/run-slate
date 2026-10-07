import type {FeatureContext} from '../../app/feature-context';
import type {GrantPrincipalKind} from '../../shared/knowledge/model';
export async function grantRecipients(ctx:FeatureContext,kind:GrantPrincipalKind,id:string):Promise<string[]> {
 const sql=kind==='member'?"SELECT id FROM members WHERE id=? AND workspace_id=? AND status='active'":kind==='group'?"SELECT m.id FROM members m JOIN group_members g ON g.member_id=m.id WHERE g.group_id=? AND m.workspace_id=? AND m.status='active'":kind==='container'?"SELECT m.id FROM members m JOIN container_members c ON c.member_id=m.id WHERE c.container_id=? AND m.workspace_id=? AND m.status='active' AND m.member_kind='member'":"SELECT id FROM members WHERE workspace_id=? AND workspace_id=? AND status='active' AND member_kind='member'";
 return (await ctx.db.prepare(sql).bind(id,ctx.actor.workspaceId).all<{id:string}>()).results.map(r=>r.id);
}
