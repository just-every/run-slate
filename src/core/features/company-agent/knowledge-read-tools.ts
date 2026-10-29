import {readContainer} from '../containers/service';
import {z} from 'zod';
import type {AppBindings} from '../../app/types';
import type {FeatureContext} from '../../app/feature-context';
import type {ClassAndFacts,ToolDefinition} from '../../../../modules/agent-door/index.ts';
import {job,id,standard} from './tool';
import {sensitiveKinds} from './classification';
import {pageTarget} from './page-facts';
import {revisionHistory,readRevision} from '../versions/service';
import {compareRevisions} from '../versions/compare';
import {listComments} from '../comments/service';
import {analytics} from '../analytics/service';
import {verification} from '../page-status/service';
import {taskList} from '../work-items/service';
import {taskReport} from '../work-items/report-query';
import {taskReportDefinitionSchema} from '../work-items/report-definition';
import {search} from '../search/service';

const facts=async(value:unknown):Promise<ClassAndFacts[]>=>{const kinds=sensitiveKinds(value);return kinds.length?[{class:'sensitive',facts:{measure:1,kind:kinds.join(', ')}}]:standard();};
const target=async(a:{id:string},ctx:FeatureContext)=>pageTarget(ctx,a.id);
const tasks=z.object({tab:z.enum(['assigned','created']).optional(),state:z.enum(['','open','completed','overdue']).optional(),containerId:id.optional(),dueFrom:z.string().optional(),dueTo:z.string().optional(),sort:z.enum(['due','page','container']).optional(),limit:z.number().int().min(1).max(100).optional(),cursor:z.string().optional()});
const query=z.object({query:z.string().max(1000),kind:z.string().optional(),containerId:id.optional(),contributorId:id.optional(),label:z.string().max(80).optional(),status:z.string().optional(),updatedFrom:z.string().optional(),updatedTo:z.string().optional(),includeArchived:z.boolean().optional(),includeTrashed:z.boolean().optional(),sort:z.enum(['relevance','updated','views']).optional(),limit:z.number().int().min(1).max(100).optional(),cursor:z.string().optional()});
export function knowledgeReadTools(env:AppBindings):ToolDefinition[] {return [
 job(env,{name:'revisions.read',title:'Read permitted page history or an exact revision',clauses:['REV-001','REV-002','REV-005','COLLAB-005'],schema:z.object({id,revisionId:id.optional()}),readOnly:true,classes:['standard','sensitive'],classify:async(a,ctx)=>facts(a.revisionId?await readRevision(ctx,a.id,a.revisionId):await revisionHistory(ctx,a.id)),target,run:async(a,ctx)=>a.revisionId?readRevision(ctx,a.id,a.revisionId):{items:await revisionHistory(ctx,a.id)}}),
 job(env,{name:'revisions.compare',title:'Compare two permitted immutable page revisions',clauses:['REV-004'],schema:z.object({id,leftRevisionId:id,rightRevisionId:id}),readOnly:true,classes:['standard','sensitive'],classify:async(a,ctx)=>facts(await compareRevisions(ctx,a.id,a.leftRevisionId,a.rightRevisionId)),target,run:(a,ctx)=>compareRevisions(ctx,a.id,a.leftRevisionId,a.rightRevisionId)}),
 job(env,{name:'comments.read',title:'Read permitted page discussions and reactions',clauses:['COMM-004','COMM-006'],schema:z.object({id}),readOnly:true,classes:['standard','sensitive'],classify:async(a,ctx)=>facts(await listComments(ctx,a.id)),target,run:(a,ctx)=>listComments(ctx,a.id)}),
 job(env,{name:'analytics.read',title:'Read permitted page or container viewing statistics',clauses:['PAGE-013'],schema:z.object({kind:z.enum(['page','container']),id,from:z.string().optional(),to:z.string().optional()}),readOnly:true,classes:['standard'],classify:standard,target:async(a,ctx)=>a.kind==='page'?pageTarget(ctx,a.id):{kind:'container',id:(await readContainer(ctx,a.id)).id},run:(a,ctx)=>analytics(ctx,{...(a.kind==='page'?{pageId:a.id}:{containerId:a.id}),from:a.from,to:a.to})}),
 job(env,{name:'statuses.read',title:'Read the verification state of an exact native page',clauses:['STAT-004'],schema:z.object({id}),readOnly:true,classes:['standard'],classify:standard,target,run:async(a,ctx)=>({verification:await verification(ctx,a.id)})}),
 job(env,{name:'tasks.list',title:'List the sponsor’s permitted assigned or created tasks',clauses:['NAV-007'],schema:tasks,readOnly:true,classes:['standard','sensitive'],classify:async(a,ctx)=>facts(await taskList(ctx,a)),run:(a,ctx)=>taskList(ctx,a)}),
 job(env,{name:'tasks.report',title:'Read a permission-filtered task report',clauses:['BLOCK-016'],schema:z.object({id,definition:taskReportDefinitionSchema}),readOnly:true,classes:['standard','sensitive'],classify:async(a,ctx)=>facts(await taskReport(ctx,a.id,a.definition)),target,run:(a,ctx)=>taskReport(ctx,a.id,a.definition)}),
 job(env,{name:'search.query',title:'Search current permitted wiki records',clauses:['SEARCH-001','SEARCH-002','SEARCH-003','SEARCH-004','SEARCH-005','SEARCH-006','SEARCH-007','SEARCH-008','SEARCH-009','SEARCH-010','SEARCH-011','SEARCH-012','SEARCH-013','SEARCH-014'],schema:query,readOnly:true,classes:['standard','sensitive'],classify:async(a,ctx)=>facts(await search(ctx,a)),run:(a,ctx)=>search(ctx,a)}),
];}
