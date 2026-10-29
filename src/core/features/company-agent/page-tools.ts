import {z} from 'zod';
import type {AppBindings} from '../../app/types';
import type {ClassAndFacts,ToolDefinition} from '../../../../modules/agent-door/index.ts';
import {createPageSchema,updatePageSchema,updateBlockSchema,replaceBlocksSchema} from '../pages/input';
import {createPage,readPage,updatePage} from '../pages/service';
import {updateBlock,replaceBlocks} from '../editor/service';
import {listPages,movePage,duplicatePage,previewMove} from '../pages/tree';
import {requireContainerLevel} from '../sharing/current-access';
import {setPageLock} from '../pages/locks';
import {pageRow} from '../pages/repository';
import {job,id,nativeOperation,standard} from './tool';
import {pageFacts,pageTarget,pageRevision,pageSummary} from './page-facts';
import {sensitiveKinds} from './classification';

export function pageTools(env:AppBindings):ToolDefinition[] {
  const target=async(a:{id:string},ctx:Parameters<typeof pageTarget>[0])=>pageTarget(ctx,a.id);
  const revision=async(a:{id:string},ctx:Parameters<typeof pageTarget>[0])=>pageRevision(ctx,a.id);
  const summary=async(a:{id:string},ctx:Parameters<typeof pageTarget>[0])=>pageSummary(ctx,a.id);
  return [
    job(env,{name:'pages.list',title:'List permitted pages',clauses:['TREE-001','TREE-003','TREE-004'],schema:z.object({containerId:id}),readOnly:true,classes:['standard','sensitive'],classify:async(a,ctx)=>{await requireContainerLevel(ctx,a.containerId,'view');const kinds=sensitiveKinds(await listPages(ctx,a.containerId));return kinds.length?[{class:'sensitive',facts:{measure:1,kind:kinds.join(', ')}}]:standard();},run:(a,ctx)=>listPages(ctx,a.containerId)}),
    job(env,{name:'pages.read',title:'Read a permitted page and its exact content revision',clauses:['PAGE-001','PAGE-003','PAGE-007','LIFE-001','LIFE-002'],schema:z.object({id}),readOnly:true,classes:['standard','sensitive'],classify:(a,ctx)=>pageFacts(ctx,a.id),target,run:(a,ctx)=>readPage(ctx,a.id)}),
    job(env,{name:'pages.create',title:'Create a wiki page',clauses:['PAGE-002','TREE-005','NAV-005'],schema:createPageSchema.omit({operationKey:true}),readOnly:false,classes:['standard','sensitive'],
      classify:async(a,ctx)=>{await requireContainerLevel(ctx,a.containerId,'edit');const kinds=sensitiveKinds(a);return kinds.length?[{class:'sensitive',facts:{measure:1,kind:kinds.join(', ')}}]:standard();},
      summary:async(a,ctx)=>{await requireContainerLevel(ctx,a.containerId,'edit');const container=await ctx.db.prepare('SELECT name FROM containers WHERE id=? AND workspace_id=?').bind(a.containerId,ctx.actor.workspaceId).first<{name:string}>();return {target:{id:a.containerId,name:container!.name},items:[a.title]};},
      resources:(_a,result)=>[{uri:'slate://pages/'+(result as {value:{pageId:string}}).value.pageId,name:'Created page'}],run:(a,ctx,door)=>createPage(ctx,{...a,...nativeOperation(door)})}),
    job(env,{name:'pages.update',reversible:true,title:'Update page properties',clauses:['SAVE-003','SAVE-005','PAGE-006','PAGE-012','LIFE-005'],schema:updatePageSchema.omit({operationKey:true,expectedRevisionId:true}).extend({id}),readOnly:false,classes:['standard','external','sensitive'],classify:(a,ctx)=>pageFacts(ctx,a.id,true,a.properties),target,revision,summary,run:(a,ctx,door)=>updatePage(ctx,a.id,{...a,...nativeOperation(door),expectedRevisionId:ctx.agentRevision!})}),
    job(env,{name:'blocks.update',reversible:true,title:'Update or replace wiki blocks',clauses:['SAVE-006','BLOCK-001','BLOCK-002','BLOCK-005','BLOCK-006','BLOCK-007','COLLAB-001','COLLAB-003','BLOCK-011','BLOCK-012','BLOCK-013','BLOCK-014','BLOCK-017','BLOCK-018','BLOCK-019','BLOCK-020'],
      schema:replaceBlocksSchema.omit({operationKey:true,expectedRevisionId:true}).extend({id}),readOnly:false,classes:['standard','external','sensitive'],classify:(a,ctx)=>pageFacts(ctx,a.id,true,a.blocks),target,revision,summary,run:(a,ctx,door)=>replaceBlocks(ctx,a.id,{...a,...nativeOperation(door),expectedRevisionId:ctx.agentRevision!})}),
    job(env,{name:'blocks.edit',reversible:true,title:'Edit one wiki block',clauses:['BLOCK-001','SAVE-006'],schema:updateBlockSchema.omit({operationKey:true,expectedRevisionId:true}).extend({id,blockId:id}),readOnly:false,classes:['standard','external','sensitive'],classify:(a,ctx)=>pageFacts(ctx,a.id,true,a.content),target,revision:async(a,ctx)=>(await readPage(ctx,a.id)).blocks.find(block=>block.id===a.blockId)?.revisionId??null,summary,run:(a,ctx,door)=>updateBlock(ctx,a.id,a.blockId,{...a,...nativeOperation(door),expectedRevisionId:ctx.agentRevision!})}),
    job(env,{name:'pages.move',title:'Move a page without changing its identity',clauses:['PAGE-004','TREE-002'],schema:z.object({id,containerId:id,parentPageId:id.nullable(),treePosition:z.string().min(1).max(200)}),readOnly:false,classes:['standard','external','sensitive','access'],
      classify:async(a,ctx)=>{const facts=await pageFacts(ctx,a.id,true);const preview=await previewMove(ctx,a.id,a);if(preview.changes.length){const widens=preview.changes.some(change=>change.after!==null);facts.splice(0,facts.length,...facts.filter(fact=>fact.class!=='standard'),{class:'access',facts:{measure:preview.changes.length,direction:widens?'widens':'narrows'}});}return facts;},
      authority:async(a,ctx)=>{const preview=await previewMove(ctx,a.id,a);const own=preview.changes.find(change=>change.memberId===ctx.actor.id);const rank:Record<string,number>={view:1,comment:2,edit:3,full:4};return {subject:ctx.actor.id,widens:!!own&&(rank[own.after??'']??0)>(rank[own.before??'']??0)};},target,revision,summary,run:async(a,ctx,door)=>movePage(ctx,a.id,{...a,...nativeOperation(door),expectedRevisionId:ctx.agentRevision!,accessPreviewHash:(await previewMove(ctx,a.id,a)).accessPreviewHash})}),
    job(env,{name:'pages.duplicate',title:'Duplicate a permitted page',clauses:['PAGE-005'],schema:z.object({id,containerId:id,parentPageId:id.nullable().optional(),includeChildren:z.boolean().optional()}),readOnly:false,classes:['standard','sensitive'],classify:(a,ctx)=>pageFacts(ctx,a.id),target,summary,run:(a,ctx,door)=>duplicatePage(ctx,a.id,{...a,...nativeOperation(door)})}),
    job(env,{name:'pages.lock',title:'Lock or unlock page editing',clauses:['PAGE-015'],schema:z.object({id,locked:z.boolean()}),readOnly:false,classes:['standard','external','sensitive'],classify:(a,ctx)=>pageFacts(ctx,a.id,true),target,revision,summary,run:(a,ctx,door)=>setPageLock(ctx,a.id,{...a,...nativeOperation(door),expectedRevisionId:ctx.agentRevision!},a.locked)}),
  ];
}
