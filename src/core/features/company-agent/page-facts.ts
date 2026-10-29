import type {FeatureContext} from '../../app/feature-context';
import type {ClassAndFacts} from '../../../../modules/agent-door/index.ts';
import {readPage} from '../pages/service';
import {requirePageLevel} from '../sharing/current-access';
import {pageRow} from '../pages/repository';
import {contentPolicy} from '../pages/policy';
import {sensitiveKinds} from './classification';

export async function pageFacts(ctx:FeatureContext,id:string,write=false,proposed?:unknown):Promise<ClassAndFacts[]> {
  const document=await readPage(ctx,id),classes:ClassAndFacts[]=[];
  if(write) {
    const exposure=(await contentPolicy(ctx))['page.lifecycle.v1']==='always-live'&&await ctx.db.prepare('SELECT 1 FROM public_exposures WHERE page_id=? AND revoked_at IS NULL').bind(id).first();
    if(exposure)classes.push({class:'external',facts:{measure:1,counterparty:'public'}});
  }
  const kinds=sensitiveKinds([document,proposed]);
  if(kinds.length)classes.push({class:'sensitive',facts:{measure:1,kind:kinds.join(', ')}});
  if(!classes.length)classes.push({class:'standard',facts:{measure:1}});
  return classes;
}
export async function pageTarget(ctx:FeatureContext,id:string){await requirePageLevel(ctx,id,'view');return {kind:'page',id};}
export async function pageRevision(ctx:FeatureContext,id:string){await requirePageLevel(ctx,id,'view');return (await pageRow(ctx,id)).revision_id;}
export async function pageSummary(ctx:FeatureContext,id:string){await requirePageLevel(ctx,id,'view');const page=await pageRow(ctx,id);return {target:{id:page.id,name:page.title},items:[page.title]};}
