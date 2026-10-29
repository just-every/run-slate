import type {ClassAndFacts} from '../../../../modules/agent-door/index.ts';
import type {FeatureContext} from '../../app/feature-context';
/** Inspect native content and proposed text; labels and caller-supplied risk flags grant no authority. */
export function recordClasses(record:unknown):ClassAndFacts[]{
 const text=JSON.stringify(record);
 const kind=/\b\d{3}-\d{2}-\d{4}\b/.test(text)?'regulated-id':/\b(?:payroll|bank account|routing number|card number|medical diagnosis|patient record)\b/i.test(text)?'financial-or-health':null;
 return [{class:'standard',facts:{measure:1}},...(kind?[{class:'sensitive' as const,facts:{measure:1,kind}}]:[])];
}
export async function pageEffect(ctx:FeatureContext,pageId:string,content:unknown):Promise<ClassAndFacts[]>{
 const exposed=await ctx.db.prepare('SELECT id FROM public_exposures WHERE page_id=? AND revoked_at IS NULL LIMIT 1').bind(pageId).first();
 const guests=await ctx.db.prepare(`SELECT g.id FROM page_grants g JOIN members m ON m.id=g.principal_id WHERE g.page_id=? AND g.principal_kind='member' AND m.member_kind='guest' AND m.status='active' AND g.revoked_at IS NULL AND (g.expires_at IS NULL OR g.expires_at>?) UNION SELECT g.id FROM container_grants g JOIN pages p ON p.container_id=g.container_id JOIN members m ON m.id=g.principal_id WHERE p.id=? AND g.principal_kind='member' AND m.member_kind='guest' AND m.status='active' AND g.revoked_at IS NULL AND (g.expires_at IS NULL OR g.expires_at>?) LIMIT 1`).bind(pageId,ctx.now,pageId,ctx.now).first();
 return [...recordClasses(content),...(exposed||guests?[{class:'external' as const,facts:{measure:1,counterparty:exposed?'public' as const:'known' as const}}]:[])];
}
