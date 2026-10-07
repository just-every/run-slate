import type { FeatureContext } from '../../app/feature-context';
import { ApiProblem } from '../../app/problems';
import type { KnowledgeGrant } from '../../shared/knowledge/model';
import { evaluatePageAccess } from '../sharing/access';
import { resolveCurrentAccess } from '../sharing/current-access';
import { pageRow } from '../pages/repository';
import type { PageRow } from '../pages/types';
import type { PublicationInput, ScheduledChoices } from './publication-input';

/** Evaluate the actual access rules against the proposed release, without writing it. */
export async function publicationAudience(ctx: FeatureContext, root: PageRow, pages: PageRow[], target: NonNullable<PublicationInput['destination']>, input: PublicationInput, saved?: ScheduledChoices) {
  const overrides = Object.fromEntries(pages.map(p => [p.id, { containerId: target.containerId, parentPageId: p.id === root.id ? target.parentPageId : p.parent_page_id }]));
  const members = (await ctx.db.prepare("SELECT id,email,display_name,initials,role FROM members WHERE workspace_id=? AND status='active' ORDER BY id").bind(ctx.actor.workspaceId).all<{id:string;email:string;display_name:string;initials:string;role:'owner'|'member'}>()).results;
  const own = new Map<string, KnowledgeGrant[]>();
  const grantsFor = async (id:string):Promise<KnowledgeGrant[]> => {
    if(own.has(id)) return own.get(id)!;
    let grants=(await ctx.db.prepare('SELECT id,principal_kind AS principalKind,principal_id AS principalId,level,expires_at AS expiresAt,revoked_at AS revokedAt FROM page_grants WHERE page_id=? ORDER BY id').bind(id).all<KnowledgeGrant>()).results;
    if(id===root.id) {
      if(input.generalAccess) {
        grants=grants.filter(g=>g.principalKind==='member'||g.principalKind==='group');
        if(input.generalAccess.kind!=='restricted') grants.push({id:'publication-general',principalKind:input.generalAccess.kind,principalId:input.generalAccess.kind==='workspace'?ctx.actor.workspaceId:target.containerId,level:input.generalAccess.level,expiresAt:null,revokedAt:null});
      } else if(saved?.retainedGeneralGrants) {
        const retained=new Set(saved.retainedGeneralGrants.map(g=>g.id));
        grants=grants.filter(g=>!retained.has(g.id)).concat(saved.retainedGeneralGrants.map(g=>({id:g.id,principalKind:g.principal_kind,principalId:g.principal_id,level:g.level as KnowledgeGrant['level'],expiresAt:g.expires_at,revokedAt:null})));
      }
      if(input.publishAt||['draft','scheduled'].includes(root.lifecycle)) grants.push({id:'publication-author',principalKind:'member',principalId:root.author_member_id,level:'full',expiresAt:null,revokedAt:null});
      if(input.publishAt&&!['draft','scheduled'].includes(root.lifecycle)) grants.push({id:'publication-scheduler',principalKind:'member',principalId:ctx.actor.id,level:'full',expiresAt:null,revokedAt:null});
    }
    if(overrides[id]) grants=grants.map(g=>g.principalKind==='container'?{...g,principalId:target.containerId}:g);
    own.set(id,grants);return grants;
  };
  const audience=[];
  for(const p of pages) {
    const readers=[];
    for(const member of members) {
      const mctx={...ctx,actor:{...ctx.actor,id:member.id,email:member.email,displayName:member.display_name,initials:member.initials,role:member.role}};
      let before:KnowledgeGrant['level']|null=null, after:KnowledgeGrant['level']|null=null;
      try { before=(await resolveCurrentAccess(mctx,p.id)).decision.level; } catch(error){if(!(error instanceof ApiProblem)||error.status!==404)throw error;}
      try {
        const access=await resolveCurrentAccess(mctx,p.id,{locationOverrides:overrides});
        const context=access.context;
        const container=await ctx.db.prepare('SELECT visibility FROM containers WHERE id=?').bind(target.containerId).first<{visibility:string}>();
        const eligible=(g:KnowledgeGrant)=>!((access.subject.isGuest||container?.visibility==='personal')&&(g.principalKind==='container'||g.principalKind==='workspace'));
        context.page.grants=(await grantsFor(p.id)).filter(eligible);
        if(p.id===root.id) {context.page.lifecycle='live';if(input.generalAccess)context.page.restricted=true;}
        const inherited:KnowledgeGrant[]=[];let cursor=p.id;const seen=new Set<string>();let blocked=false;
        while(cursor) {
          if(seen.has(cursor))throw new ApiProblem(409,'TREE_CYCLE','Repair the page tree before publishing.');seen.add(cursor);
          const row=pages.find(r=>r.id===cursor)??await pageRow(ctx,cursor);
          if(row.access_inheritance==='restricted'||(cursor===root.id&&input.generalAccess)){blocked=true;break;}
          const parent=overrides[cursor]?.parentPageId??(overrides[cursor]?null:row.parent_page_id);
          if(!parent)break;
          inherited.push(...await grantsFor(parent));cursor=parent;
        }
        context.inheritedGrants=inherited.filter(eligible);
        // The resolver may have stopped at the old root restriction; obtain the real target grants.
        context.container.grants=blocked?[]:(await ctx.db.prepare('SELECT id,principal_kind AS principalKind,principal_id AS principalId,level,expires_at AS expiresAt,revoked_at AS revokedAt FROM container_grants WHERE container_id=? ORDER BY id').bind(target.containerId).all<KnowledgeGrant>()).results.filter(eligible);
        after=evaluatePageAccess(access.subject,context,ctx.now).level;
      }catch(error){if(!(error instanceof ApiProblem)||error.status!==404)throw error;}
      if(before||after)readers.push({memberId:member.id,name:member.display_name,before,after});
    }
    audience.push({pageId:p.id,readers});
  }
  return audience;
}
