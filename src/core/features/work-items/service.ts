import type {FeatureContext} from '../../app/feature-context';
import {ApiProblem} from '../../app/problems';
import {requestHash} from '../../app/operations';
import {createUlid} from '../../shared/ulid';
import {currentSubject,requirePageLevel,resolveCurrentAccessMany} from '../sharing/current-access';
import {readPage} from '../pages/service';
import {pageBlocks} from '../pages/repository';
import {updateBlock} from '../editor/service';
import {preferences} from '../navigation/preferences';
import {decodeCursor,encodeCursor,limitValue} from '../search/pagination';
import {recipientContext} from '../notifications/outbox';
import {localDate,validDate} from './time';
export interface TasksInput{tab?:string;state?:string;containerId?:string;dueFrom?:string;dueTo?:string;sort?:string;limit?:number;cursor?:string}
export async function taskList(ctx:FeatureContext,input:TasksInput={}){
 await currentSubject(ctx);
 const tab=input.tab??'assigned',state=input.state??'',sort=input.sort??'due',limit=limitValue(input.limit);
 if(!['assigned','created'].includes(tab)||!['','open','completed','overdue'].includes(state)||!['due','page','container'].includes(sort)||[input.dueFrom,input.dueTo].some(v=>v!==undefined&&!validDate(v))||(input.dueFrom&&input.dueTo&&input.dueFrom>input.dueTo))throw new ApiProblem(400,'INVALID_TASK_FILTER','Choose valid task filters.');
 const hash=await requestHash({tab,state,sort,containerId:input.containerId??null,dueFrom:input.dueFrom??null,dueTo:input.dueTo??null}),cursor=decodeCursor<{snapshot:string;offset:number}>(input.cursor);
 if(cursor&&(typeof cursor.snapshot!=='string'||!Number.isInteger(cursor.offset)||cursor.offset<0))throw new ApiProblem(400,'INVALID_CURSOR','Invalid task cursor.');
 let snapshot:string[]|undefined;
 if(cursor){const row=await ctx.db.prepare('SELECT ids_json FROM discovery_snapshots WHERE id=? AND workspace_id=? AND member_id=? AND query_hash=? AND expires_at>?').bind(cursor.snapshot,ctx.actor.workspaceId,ctx.actor.id,hash,ctx.now).first<{ids_json:string}>();if(!row)throw new ApiProblem(409,'TASK_LIST_EXPIRED','Start a fresh task list.');snapshot=JSON.parse(row.ids_json);}
 const rows=(await ctx.db.prepare('SELECT p.id,c.id AS containerId,c.name AS containerName FROM pages p JOIN containers c ON c.id=p.container_id WHERE p.workspace_id=? AND p.deleted_at IS NULL AND p.trashed_at IS NULL AND (? IS NULL OR p.container_id=?)').bind(ctx.actor.workspaceId,input.containerId??null,input.containerId??null).all<{id:string;containerId:string;containerName:string}>()).results;
 const access=await resolveCurrentAccessMany(ctx,rows.map(r=>r.id)),today=localDate(ctx.now,(await preferences(ctx)).value.timezone);
 const origins=new Map((await ctx.db.prepare('SELECT block_id,member_id FROM task_origins WHERE page_id IN (SELECT id FROM pages WHERE workspace_id=?)').bind(ctx.actor.workspaceId).all<{block_id:string;member_id:string|null}>()).results.map(r=>[r.block_id,r.member_id]));
 const items:any[]=[];
 for(const row of rows){if(!access.get(row.id)?.decision.allowed)continue;const doc=await readPage(ctx,row.id);
  for(const block of doc.blocks){if(block.blockType!=='task')continue;const c=block.content as Record<string,any>,creator=origins.get(block.id)??c.creatorMemberId??null;
   if((tab==='assigned'?c.assigneeMemberId:creator)!==ctx.actor.id)continue;
   const overdue=!c.done&&!!c.dueDate&&c.dueDate<today;
   if(state==='open'&&c.done||state==='completed'&&!c.done||state==='overdue'&&!overdue||input.dueFrom&&(!c.dueDate||c.dueDate<input.dueFrom)||input.dueTo&&(!c.dueDate||c.dueDate>input.dueTo))continue;
   items.push({pageId:row.id,blockId:block.id,blockRevisionId:block.revisionId,pageTitle:doc.page.title,containerId:row.containerId,containerName:row.containerName,text:c.text,done:c.done,assigneeMemberId:c.assigneeMemberId??null,dueDate:c.dueDate??null,creatorMemberId:creator,completedByMemberId:c.completedByMemberId??null,completedAt:c.completedAt??null,canEdit:doc.permissions.canEdit,overdue});
  }
 }
 const key=(item:any)=>JSON.stringify([item.pageId,item.blockId]);
 let snapshotId=cursor?.snapshot??createUlid();
 if(!snapshot){items.sort((a,b)=>{const av=sort==='due'?a.dueDate??'9999-99-99':sort==='page'?a.pageTitle:a.containerName,bv=sort==='due'?b.dueDate??'9999-99-99':sort==='page'?b.pageTitle:b.containerName;return av.localeCompare(bv)||key(a).localeCompare(key(b));});snapshot=items.map(key);await ctx.db.prepare('INSERT INTO discovery_snapshots(id,workspace_id,member_id,query_hash,ids_json,expires_at) VALUES(?,?,?,?,?,?)').bind(snapshotId,ctx.actor.workspaceId,ctx.actor.id,hash,JSON.stringify(snapshot),new Date(Date.parse(ctx.now)+3600000).toISOString()).run();}
 const current=new Map(items.map(item=>[key(item),item])),selected=[];let position=cursor?.offset??0;
 while(position<snapshot.length&&selected.length<limit){const item=current.get(snapshot[position++]!);if(item)selected.push(item);}
 return {items:selected,nextCursor:snapshot.slice(position).some(id=>current.has(id))?encodeCursor({snapshot:snapshotId,offset:position}):undefined};
}
export async function completeTask(ctx:FeatureContext,pageId:string,blockId:string,input:{operationKey:string;expectedRevisionId:string;done:boolean}){
 if(typeof input.done!=='boolean'||typeof input.expectedRevisionId!=='string')throw new ApiProblem(400,'INVALID_TASK','Supply completion and the task revision.');
 await requirePageLevel(ctx,pageId,'edit');const block=(await pageBlocks(ctx.db,pageId)).find(b=>b.id===blockId&&b.blockType==='task');if(!block)throw new ApiProblem(404,'NOT_FOUND','Not found.');
 return updateBlock(ctx,pageId,blockId,{operationKey:input.operationKey,expectedRevisionId:input.expectedRevisionId,content:{...block.content as object,done:input.done}});
}
export async function taskAssignees(ctx:FeatureContext,pageId:string){
 const {subject}=await requirePageLevel(ctx,pageId,'view');const doc=await readPage(ctx,pageId);
 const known=new Set([ctx.actor.id,doc.authorMemberId,doc.properties.ownerMemberId,...doc.contributors.map(m=>m.id),...doc.blocks.filter(b=>b.blockType==='task').map(b=>(b.content as Record<string,any>).assigneeMemberId)]);
 if(subject.isGuest){const comments=await ctx.db.prepare('SELECT c.author_member_id AS id FROM comments c JOIN comment_threads t ON t.id=c.thread_id WHERE t.page_id=? AND c.deleted_at IS NULL').bind(pageId).all<{id:string}>();comments.results.forEach(m=>known.add(m.id));}
 const members=await ctx.db.prepare("SELECT id,display_name AS displayName FROM members WHERE workspace_id=? AND status='active' ORDER BY display_name,id").bind(ctx.actor.workspaceId).all<{id:string;displayName:string}>(),items=[];
 for(const member of members.results){if(subject.isGuest&&!known.has(member.id))continue;const recipient=await recipientContext(ctx,member.id);let canRead=false;if(recipient)try{await requirePageLevel(recipient,pageId,'view');canRead=true;}catch(error){if(!(error instanceof ApiProblem)||error.status!==404)throw error;}if(!subject.isGuest||canRead)items.push({...member,canRead});}
 return {items};
}
