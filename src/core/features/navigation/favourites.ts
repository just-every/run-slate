import type { FeatureContext } from '../../app/feature-context';
import { ApiProblem } from '../../app/problems';
import { currentSubject,requireContainerLevel,requirePageLevel } from '../sharing/current-access';
import { requiredId } from './request';
import { personalMutation } from './mutations';
import { navigationPageReads } from './list-reads';
import { containerListAccess } from '../containers/list-access';

/** One stable ordering for the sidebar and its personal move operation. */
export function favouriteRows(ctx:FeatureContext) {
  return ctx.db.prepare("SELECT CASE WHEN d.id IS NULL THEN 'page' ELSE 'database' END AS kind,COALESCE(d.id,p.id) AS id,p.id AS pageId,p.title AS title,f.position FROM page_favourites f JOIN pages p ON p.id=f.page_id LEFT JOIN databases d ON d.page_id=p.id WHERE f.member_id=? AND p.workspace_id=? AND p.deleted_at IS NULL UNION ALL SELECT 'container',c.id,NULL AS pageId,c.name,f.position FROM container_favourites f JOIN containers c ON c.id=f.container_id WHERE f.member_id=? AND c.workspace_id=? ORDER BY position,id").bind(ctx.actor.id,ctx.actor.workspaceId,ctx.actor.id,ctx.actor.workspaceId).all<{kind:'page'|'container'|'database';id:string;pageId:string|null;title:string;position:string}>();
}

export async function setFavourite(ctx:FeatureContext,input:{operationKey:string;kind:'page'|'container'|'database';id:string;enabled:boolean;position?:number}) {
  requiredId(input.id);
  if(!['page','container','database'].includes(input.kind)||typeof input.enabled!=='boolean'||input.position!==undefined&&(!Number.isInteger(input.position)||input.position<0||input.position>999999))throw new ApiProblem(400,'INVALID_FAVOURITE','Invalid favourite.');
  let targetId=input.id;
  if(input.kind==='database') {
    const row=await ctx.db.prepare('SELECT page_id FROM databases WHERE id=? AND workspace_id=?').bind(input.id,ctx.actor.workspaceId).first<{page_id:string}>();
    if(!row)throw new ApiProblem(404,'NOT_FOUND','Not found.');
    targetId=row.page_id;
  }
  const table=input.kind==='container'?'container_favourites':'page_favourites',column=input.kind==='container'?'container_id':'page_id';
  return personalMutation(ctx,{
    operationKey:input.operationKey,action:'favourite.set',request:input,
    authorize:async()=>{if(input.enabled)await(input.kind==='container'?requireContainerLevel(ctx,targetId,'view'):requirePageLevel(ctx,targetId,'view'));},
    build:async()=>{
      let statements:D1PreparedStatement[];
      if (!input.enabled) {
        statements=[ctx.db.prepare(`DELETE FROM ${table} WHERE member_id=? AND ${column}=?`).bind(ctx.actor.id,targetId)];
      } else if (input.position === undefined) {
        // Re-enabling an existing favourite preserves the member's chosen order.
        statements=[ctx.db.prepare(`INSERT INTO ${table}(member_id,${column},position,created_at) VALUES(?,?,?,?) ON CONFLICT(member_id,${column}) DO NOTHING`).bind(ctx.actor.id,targetId,'999999',ctx.now)];
      } else {
        const [stored,subject]=await Promise.all([favouriteRows(ctx),currentSubject(ctx)]);
        const [pages,containers]=await Promise.all([
          navigationPageReads(ctx,stored.results.flatMap(item=>item.pageId?[item.pageId]:[]),subject),
          containerListAccess(ctx,stored.results.filter(item=>item.kind==='container').map(item=>item.id),subject),
        ]);
        const ordered=stored.results.filter(item=>item.kind==='container'?containers.has(item.id):pages.canRead(item.pageId!));
        const at=ordered.findIndex(item=>input.kind==='container'?item.kind==='container'&&item.id===targetId:item.pageId===targetId);
        const moved=at<0?{kind:input.kind,id:input.id,pageId:input.kind==='container'?null:targetId,title:'',position:''}:ordered.splice(at,1)[0];
        ordered.splice(Math.min(input.position,ordered.length),0,moved);
        // Normalize the complete visible list in the same commit. A two-row swap
        // would move untouched default-position favourites behind the pair.
        statements=ordered.map((item,index)=>{
          const targetTable=item.kind==='container'?'container_favourites':'page_favourites';
          const targetColumn=item.kind==='container'?'container_id':'page_id';
          return ctx.db.prepare(`INSERT INTO ${targetTable}(member_id,${targetColumn},position,created_at) VALUES(?,?,?,?) ON CONFLICT(member_id,${targetColumn}) DO UPDATE SET position=excluded.position`)
            .bind(ctx.actor.id,item.pageId??item.id,String(index).padStart(6,'0'),ctx.now);
        });
      }
      return {statements,value:{id:input.id,enabled:input.enabled}};
    },
  });
}
