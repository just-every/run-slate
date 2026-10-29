import {z} from 'zod';
import type {AppBindings} from '../../app/types';
import {createContainer,listContainers,readContainer,updateContainer} from '../containers/service';
import {job,id,nativeOperation,standard} from './tool';
import {sensitiveKinds} from './classification';
import type {ClassAndFacts,ToolDefinition} from '../../../../modules/agent-door/index.ts';

export function containerTools(env:AppBindings):ToolDefinition[] {
  const metadata=z.object({name:z.string().trim().min(1).max(200),description:z.string().max(2000).optional(),key:z.string().max(80).nullable().optional(),icon:z.string().max(1000).nullable().optional()});
  const target=async(a:{id:string},ctx:Parameters<typeof readContainer>[0])=>({kind:'container',id:(await readContainer(ctx,a.id)).id});
  const summary=async(a:{id:string},ctx:Parameters<typeof readContainer>[0])=>{const c=await readContainer(ctx,a.id);return {target:{id:c.id,name:c.name},items:[c.name]};};
  return [
    job(env,{name:'containers.list',title:'List permitted containers',clauses:['CONT-003'],schema:z.object({archived:z.boolean().optional()}),readOnly:true,classes:['standard','sensitive'],classify:async(a,ctx)=>{const kinds=sensitiveKinds(await listContainers(ctx,a.archived));return kinds.length?[{class:'sensitive',facts:{measure:1,kind:kinds.join(', ')}}]:standard();},run:(a,ctx)=>listContainers(ctx,a.archived)}),
    job(env,{name:'containers.read',title:'Read a permitted container',clauses:['CONT-001','CONT-005'],schema:z.object({id}),readOnly:true,classes:['standard','sensitive'],classify:async(a,ctx)=>{const kinds=sensitiveKinds(await readContainer(ctx,a.id));return kinds.length?[{class:'sensitive',facts:{measure:1,kind:kinds.join(', ')}}]:standard();},target,run:(a,ctx)=>readContainer(ctx,a.id)}),
    job(env,{name:'containers.create',title:'Create a wiki container',clauses:['CONT-002'],schema:metadata.extend({visibility:z.enum(['default','open','closed','private']).optional()}),readOnly:false,classes:['standard','sensitive'],classify:async(a)=>{const kinds=sensitiveKinds(a);return kinds.length?[{class:'sensitive',facts:{measure:1,kind:kinds.join(', ')}}]:standard();},summary:async a=>({items:[a.name]}),run:(a,ctx,door)=>createContainer(ctx,{...a,...nativeOperation(door)})}),
    job(env,{name:'containers.configure',title:'Update a container name and description',clauses:['CONT-004'],schema:metadata.partial().extend({id}),readOnly:false,classes:['standard','sensitive'],classify:async(a,ctx)=>{await readContainer(ctx,a.id);const kinds=sensitiveKinds(a);return kinds.length?[{class:'sensitive',facts:{measure:1,kind:kinds.join(', ')}}]:standard();},target,summary,revision:async(a,ctx)=>(await readContainer(ctx,a.id)).revisionId,run:(a,ctx,door)=>updateContainer(ctx,a.id,{...a,...nativeOperation(door),expectedRevisionId:ctx.agentRevision!})}),
  ];
}
