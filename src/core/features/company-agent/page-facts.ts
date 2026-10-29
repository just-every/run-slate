import type {FeatureContext} from '../../app/feature-context';
import type {ClassAndFacts} from '../../../../modules/agent-door/index.ts';
import {readPage} from '../pages/service';
import {requirePageLevel,resolveCurrentAccess} from '../sharing/current-access';
import {pageRow} from '../pages/repository';
import {contentPolicy} from '../pages/policy';
import {sensitiveKinds} from './classification';

export async function pageFacts(ctx:FeatureContext,id:string,write=false,proposed?:unknown,publication=false):Promise<ClassAndFacts[]> {
  const document=await readPage(ctx,id),classes:ClassAndFacts[]=[];
  if(write) {
    if(publication||(await contentPolicy(ctx))['page.lifecycle.v1']==='always-live') {
      const exposure=await ctx.db.prepare(`SELECT 1 FROM public_exposures e JOIN pages p ON p.id=e.page_id JOIN containers c ON c.id=p.container_id JOIN workspaces w ON w.id=p.workspace_id
        WHERE e.page_id=? AND e.revoked_at IS NULL AND c.public_link_access='allowed' AND w.public_link_access='allowed'
        AND c.anonymous_access='allowed' AND w.anonymous_access='allowed' AND p.archived_at IS NULL AND p.trashed_at IS NULL AND p.deleted_at IS NULL
        AND (?=1 OR p.lifecycle IN ('live','live-with-unpublished-changes'))`).bind(id,+publication).first();
      if(exposure)classes.push({class:'external',facts:{measure:1,counterparty:'public'}});
      else {
        const guests=(await ctx.db.prepare("SELECT id,email,display_name AS displayName,role FROM members WHERE workspace_id=? AND status='active' AND member_kind='guest' AND (guest_expires_at IS NULL OR guest_expires_at>?)").bind(ctx.actor.workspaceId,ctx.now).all<{id:string;email:string;displayName:string;role:'owner'|'member'}>()).results;
        let recipients=0;
        for(const guest of guests)if((await resolveCurrentAccess({...ctx,containerScopeIds:undefined,authorizationEpoch:undefined,actor:{...ctx.actor,...guest}},id)).decision.allowed)recipients++;
        if(recipients)classes.push({class:'external',facts:{measure:recipients,counterparty:'known'}});
      }
    }
  }
  const kinds=sensitiveKinds([document,proposed]);
  if(kinds.length)classes.push({class:'sensitive',facts:{measure:1,kind:kinds.join(', ')}});
  if(!classes.length)classes.push({class:'standard',facts:{measure:1}});
  return classes;
}
export async function pageTarget(ctx:FeatureContext,id:string){await requirePageLevel(ctx,id,'view');return {kind:'page',id};}
export async function pageRevision(ctx:FeatureContext,id:string){await requirePageLevel(ctx,id,'view');return (await pageRow(ctx,id)).revision_id;}
export async function pageSummary(ctx:FeatureContext,id:string){await requirePageLevel(ctx,id,'view');const page=await pageRow(ctx,id);return {target:{id:page.id,name:page.title},items:[page.title]};}
