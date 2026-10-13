import { ApiProblem } from '../../app/problems';
import { aggregate,evaluateFields,type Expression,type Values } from '../databases/values';
import type { RecordGraph } from './record-graph';
function dependencies(expression:Expression,out=new Set<string>(),depth=0):Set<string> {
 if(depth>64)throw new ApiProblem(400,'FORMULA_LIMIT','Formula expression exceeds its depth limit.');
 if('field'in expression)out.add(expression.field);else if('args'in expression)for(const arg of expression.args)dependencies(arg,out,depth+1);
 return out;
}
/** Same lazy field semantics as native recordValues, with batch-loaded dependencies. */
export function graphRecordValues(graph:RecordGraph,root:string):Values {
 const active=new Set<string>(),cache=new Map<string,unknown>();let remaining=10000;
 function compute(id:string,fieldId:string,isRoot=false):unknown {
  const key=JSON.stringify([id,fieldId,isRoot]);if(cache.has(key))return cache.get(key);
  if(active.has(key))throw new ApiProblem(409,'ROLLUP_CYCLE','Computed field dependencies contain a cycle.');
  if(--remaining<0||active.size>64)throw new ApiProblem(429,'CALCULATION_LIMIT','Computed fields exceed their bounded evaluation budget.');
  active.add(key);
  const row=graph.nodes.get(id)!,fs=graph.definitions.get(row.database_id??'')??[],field=fs.find(f=>f.id===fieldId);
  if(!field)throw new ApiProblem(409,'STALE_FIELD_REFERENCE','A computed field reference no longer exists.');
  const values={...graph.values.get(id)};
  if(!isRoot)for(const f of fs){if(f.type==='identifier')values[f.id]=id;if(f.type==='created-at')values[f.id]=row.created_at;if(f.type==='updated-at')values[f.id]=row.updated_at;}
  let value:unknown=values[fieldId]??null;
  if(field.type==='relation'||field.type==='file')value=(Array.isArray(value)?value:[]).filter(target=>graph.readable.has(field.type==='file'?(graph.files.get(target)??''):target));
  if(field.type==='rollup'&&field.config.relationField&&field.config.targetField){
   const relation=fs.find(f=>f.id===field.config.relationField&&f.type==='relation');
   if(!relation)throw new ApiProblem(409,'STALE_ROLLUP_REFERENCE','Rollup relation field no longer exists.');
   const ids=compute(id,relation.id,isRoot) as string[],collected=[];
   for(const target of ids){const node=graph.nodes.get(target);if(!node?.database_id)continue;
    if(!(graph.definitions.get(node.database_id)??[]).some(f=>f.id===field.config.targetField))throw new ApiProblem(409,'STALE_ROLLUP_REFERENCE','Rollup target field no longer exists.');
    collected.push(compute(target,String(field.config.targetField)));
   }
   value=aggregate(collected,String(field.config.calculation??'count'));
  }
  if(field.type==='formula'&&field.config.expression){
   const computed={...values};for(const dep of dependencies(field.config.expression as Expression))computed[dep]=compute(id,dep,isRoot);
   value=evaluateFields(fs.map(f=>f.id===field.id?f:{...f,type:['formula','rollup'].includes(f.type)?'number':f.type}),computed)[field.id];
  }
  active.delete(key);cache.set(key,value);return value;
 }
 const row=graph.nodes.get(root),result:Values={};
 for(const field of graph.definitions.get(row?.database_id??'')??[])result[field.id]=compute(root,field.id,true);
 return result;
}
