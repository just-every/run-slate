import type {ClassAndFacts} from '../../../../modules/agent-door/index.ts';
import {ToolRefusal} from '../../../../modules/agent-door/index.ts';
import {contentPolicy} from '../pages/policy';
import type {FeatureContext} from '../../app/feature-context';
/** Inspect native content and proposed text; labels and caller-supplied risk flags grant no authority. */
export function recordClasses(record:unknown):ClassAndFacts[]{
 const text=JSON.stringify(record);
 const kind=/\b\d{3}-\d{2}-\d{4}\b/.test(text)?'regulated-id':/\b(?:payroll|bank account|routing number|card number|medical diagnosis|patient record)\b/i.test(text)?'financial-or-health':null;
 return [{class:'standard',facts:{measure:1}},...(kind?[{class:'sensitive' as const,facts:{measure:1,kind}}]:[])];
}
export async function pageEffect(ctx:FeatureContext,pageId:string,content:unknown):Promise<ClassAndFacts[]>{
 const policy=await contentPolicy(ctx);
 const exposed=policy['page.lifecycle.v1']==='always-live'&&await ctx.db.prepare("SELECT e.id FROM public_exposures e JOIN pages p ON p.id=e.page_id JOIN containers c ON c.id=p.container_id JOIN workspaces w ON w.id=p.workspace_id WHERE e.page_id=? AND e.revoked_at IS NULL AND p.lifecycle IN ('live','live-with-unpublished-changes') AND p.published_revision_id IS NOT NULL AND c.public_link_access='allowed' AND w.public_link_access='allowed' AND c.anonymous_access='allowed' AND w.anonymous_access='allowed' LIMIT 1").bind(pageId).first();
 const guests=await ctx.db.prepare(`SELECT g.id FROM page_grants g JOIN members m ON m.id=g.principal_id WHERE g.page_id=? AND g.principal_kind='member' AND m.member_kind='guest' AND m.status='active' AND g.revoked_at IS NULL AND (g.expires_at IS NULL OR g.expires_at>?) UNION SELECT g.id FROM container_grants g JOIN pages p ON p.container_id=g.container_id JOIN members m ON m.id=g.principal_id WHERE p.id=? AND g.principal_kind='member' AND m.member_kind='guest' AND m.status='active' AND g.revoked_at IS NULL AND (g.expires_at IS NULL OR g.expires_at>?) LIMIT 1`).bind(pageId,ctx.now,pageId,ctx.now).first();
 return [...recordClasses(content),...(exposed||guests?[{class:'external' as const,facts:{measure:1,counterparty:exposed?'public' as const:'known' as const}}]:[])];
}

/** Queued provider work is not part of the declared synchronous wiki subset. */
export async function requireDeclaredEffects(ctx:FeatureContext){
 const connected=await ctx.db.prepare("SELECT 1 FROM chat_connections WHERE workspace_id=? AND state='connected' UNION ALL SELECT 1 FROM webhook_subscriptions WHERE workspace_id=? AND state='enabled' UNION ALL SELECT 1 FROM automation_rules WHERE workspace_id=? AND disabled_at IS NULL LIMIT 1").bind(ctx.actor.workspaceId,ctx.actor.workspaceId,ctx.actor.workspaceId).first();
 if(connected)throw new ToolRefusal('provider_edge_not_declared','This installation has queued chat, webhook or automation effects outside the declared wiki subset.');
}
