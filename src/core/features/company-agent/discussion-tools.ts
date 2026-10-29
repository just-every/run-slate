import {z} from 'zod';
import type {AppBindings} from '../../app/types';
import type {FeatureContext} from '../../app/feature-context';
import {ApiProblem} from '../../app/problems';
import {createComment,editComment,resolveThread,listComments} from '../comments/service';
import {resolveAllThreads} from '../comments/resolve-all';
import {job,id,nativeOperation} from './tool';
import {pageFacts,pageTarget,pageSummary} from './page-facts';
import {sensitiveKinds} from './classification';

const comment=z.object({id,body:z.any(),threadId:id.optional(),parentCommentId:id.optional(),kind:z.enum(['inline','page']).optional(),blockId:id.optional(),anchor:z.object({anchorId:id,quote:z.string().max(5000)}).optional(),anchorRevisionId:id.optional()});
async function record(ctx:FeatureContext,id:string,thread=false) {
 const row=await ctx.db.prepare(thread?'SELECT id,page_id,revision_id FROM comment_threads WHERE id=?':'SELECT c.id,t.page_id,c.revision_id FROM comments c JOIN comment_threads t ON t.id=c.thread_id WHERE c.id=?').bind(id).first<{id:string;page_id:string;revision_id:string}>();
 if(!row)throw new ApiProblem(404,'NOT_FOUND','Not found.');
 await pageTarget(ctx,row.page_id);return row;
}
async function facts(ctx:FeatureContext,id:string,body?:unknown) {
 const facts=await pageFacts(ctx,id,true,body),kinds=sensitiveKinds(await listComments(ctx,id));
 if(kinds.length&&!facts.some(fact=>fact.class==='sensitive'))return [...facts.filter(fact=>fact.class!=='standard'),{class:'sensitive' as const,facts:{measure:1,kind:kinds.join(', ')}}];
 return facts;
}
function validateResolution(a:{all?:boolean;resolved:boolean}) {
 if(a.all&&!a.resolved)throw new ApiProblem(400,'INVALID_REQUEST','Reopen a particular discussion; bulk reopening is not a native operation.');
}
export function discussionTools(env:AppBindings) {return [
 job(env,{name:'comments.create',title:'Create or reply to a native discussion',clauses:['COMM-001','COMM-003'],schema:comment,readOnly:false,classes:['standard','external','sensitive'],classify:(a,c)=>facts(c,a.id,a.body),target:(a,c)=>pageTarget(c,a.id),summary:async(a,c)=>({...await pageSummary(c,a.id),items:[a.threadId?'Reply to discussion':'New discussion',JSON.stringify(a.body??null).slice(0,1000)]}),resources:(_a,result)=>[{uri:'slate://threads/'+(result as {value:{threadId:string}}).value.threadId,name:'Prepared discussion'}],run:(a,c,d)=>createComment(c,a.id,{...a,...nativeOperation(d)})}),
 job(env,{name:'comments.manage',title:'Edit or remove the sponsor’s own comment',clauses:['COMM-002'],schema:z.object({id,body:z.any().optional(),delete:z.boolean().optional()}),readOnly:false,classes:['standard','external','sensitive'],classify:async(a,c)=>facts(c,(await record(c,a.id)).page_id,a.body),target:async(a,c)=>pageTarget(c,(await record(c,a.id)).page_id),revision:async(a,c)=>(await record(c,a.id)).revision_id,summary:async(a,c)=>({...await pageSummary(c,(await record(c,a.id)).page_id),items:[a.delete?'Remove own comment':'Edit own comment',...(a.delete?[]:[JSON.stringify(a.body??null).slice(0,1000)])]}),run:(a,c,d)=>editComment(c,a.id,{...a,...nativeOperation(d),expectedRevisionId:c.agentRevision!})}),
 job(env,{name:'comments.resolve',title:'Resolve or reopen a native discussion',clauses:['COMM-007'],schema:z.object({id,all:z.boolean().optional(),resolved:z.boolean().default(true)}),readOnly:false,classes:['standard','external','sensitive'],classify:async(a,c)=>{validateResolution(a);return facts(c,a.all?a.id:(await record(c,a.id,true)).page_id);},target:async(a,c)=>pageTarget(c,a.all?a.id:(await record(c,a.id,true)).page_id),revision:async(a,c)=>a.all?null:(await record(c,a.id,true)).revision_id,summary:async(a,c)=>({...await pageSummary(c,a.all?a.id:(await record(c,a.id,true)).page_id),items:[a.all?'Resolve all open discussions':a.resolved?'Resolve discussion':'Reopen discussion']}),run:(a,c,d)=>{validateResolution(a);return a.all?resolveAllThreads(c,a.id,nativeOperation(d)):resolveThread(c,a.id,{...a,...nativeOperation(d),expectedRevisionId:c.agentRevision!});}}),
];}
