import {z} from 'zod';
import type {AppBindings} from '../../app/types';
import {setFavourite,setWatch} from '../navigation/service';
import {setContainerWatch} from '../navigation/watches';
import {react} from '../comments/service';
import {completeTask} from '../work-items/service';
import {readPage} from '../pages/service';
import {readContainer} from '../containers/service';
import {job,id,nativeOperation,standard} from './tool';
import {pageFacts,pageTarget,pageSummary} from './page-facts';
import {sensitiveKinds} from './classification';
export function personalTools(env:AppBindings) {return [
 job(env,{name:'favorites.set',title:'Set a personal page, container or database favorite',clauses:['PAGE-008'],schema:z.object({kind:z.enum(['page','container','database']),id,enabled:z.boolean(),position:z.number().int().min(0).max(999999).optional()}),classes:['standard','sensitive'],readOnly:false,
  classify:async(a,ctx)=>{if(!a.enabled)return standard();if(a.kind==='container'){const kinds=sensitiveKinds(await readContainer(ctx,a.id));return kinds.length?[{class:'sensitive',facts:{measure:1,kind:kinds.join(', ')}}]:standard();}const page=a.kind==='database'?await ctx.db.prepare('SELECT page_id FROM databases WHERE id=? AND workspace_id=?').bind(a.id,ctx.actor.workspaceId).first<{page_id:string}>():null;return pageFacts(ctx,page?.page_id??a.id);},
  summary:async a=>({target:{id:a.id,name:a.kind},items:[a.enabled?'Add personal favorite':'Remove personal favorite']}),run:(a,ctx,door)=>setFavourite(ctx,{...a,...nativeOperation(door)})}),
 job(env,{name:'watches.set',title:'Set a personal page or container watch',clauses:['PAGE-009','CONT-012','PAGE-016'],schema:z.object({kind:z.enum(['page','container']),id,enabled:z.boolean()}),classes:['standard','sensitive'],readOnly:false,
  classify:async(a,ctx)=>{if(!a.enabled)return standard();if(a.kind==='page')return pageFacts(ctx,a.id);const kinds=sensitiveKinds(await readContainer(ctx,a.id));return kinds.length?[{class:'sensitive',facts:{measure:1,kind:kinds.join(', ')}}]:standard();},
  summary:async a=>({target:{id:a.id,name:a.kind},items:[a.enabled?'Watch as the sponsoring person':'Stop the sponsoring person’s watch']}),run:(a,ctx,door)=>a.kind==='page'?setWatch(ctx,{pageId:a.id,enabled:a.enabled,...nativeOperation(door)}):setContainerWatch(ctx,{containerId:a.id,enabled:a.enabled,...nativeOperation(door)})}),
 job(env,{name:'reactions.set',title:'Set a page or comment reaction',clauses:['PAGE-014','COMM-005'],schema:z.object({id,commentId:id.optional(),emoji:z.string().min(1).max(32),remove:z.boolean().optional()}),classes:['standard','sensitive'],readOnly:false,classify:(a,ctx)=>pageFacts(ctx,a.id),target:(a,ctx)=>pageTarget(ctx,a.id),summary:async(a,ctx)=>({...await pageSummary(ctx,a.id),items:[a.remove?'Remove reaction':'Add reaction',a.emoji,...(a.commentId?['Comment '+a.commentId]:[])]}),run:(a,ctx,door)=>react(ctx,a.id,{...a,...nativeOperation(door)})}),
 job(env,{name:'tasks.update',title:'Complete or reopen a native task',clauses:['BLOCK-015'],schema:z.object({id,blockId:id,done:z.boolean()}),classes:['standard','external','sensitive'],readOnly:false,classify:(a,ctx)=>pageFacts(ctx,a.id,true),target:(a,ctx)=>pageTarget(ctx,a.id),summary:async(a,ctx)=>({...await pageSummary(ctx,a.id),items:[a.done?'Complete task':'Reopen task',a.blockId]}),revision:async(a,ctx)=>(await readPage(ctx,a.id)).blocks.find(block=>block.id===a.blockId)?.revisionId??null,run:(a,ctx,door)=>completeTask(ctx,a.id,a.blockId,{done:a.done,expectedRevisionId:ctx.agentRevision!,...nativeOperation(door)})}),
];}
