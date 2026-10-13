import type {CapturedSql,NativeRow,NativeValue} from './native-plan';
import {nativeRowValues,type NativeRowTemplate} from './native-row-values';

/** Keep one captured handle per row. Row and column views exist only during a
 * read; metadata edits live in the shared ledger, so subsequent reads and the
 * canonical source see the exact same complete values. */
export function nativeRowCollections(templates:Map<string,{table:string;template:NativeRowTemplate}>){
 const mutations=new WeakMap<CapturedSql,Record<string,NativeValue>>();
 const guards=new WeakMap<CapturedSql,CapturedSql[]>();
 const handles=new WeakMap<NativeRow,CapturedSql>();
 const row=(statement:CapturedSql,before?:CapturedSql[]):NativeRow=>{
  if(before?.length)guards.set(statement,before);
  const compiled=templates.get(statement.sql);if(!compiled)throw new Error('Native row template is missing.');
  const retained=guards.get(statement);
  const value:NativeRow={table:compiled.table,values:nativeRowValues(compiled.template,statement,mutations),...(retained?{before:retained}:{})};
  handles.set(value,statement);return value;
 };
 const expand=(value:NativeRow|CapturedSql)=>value&&'sql' in value?row(value):value;
 const index=(key:PropertyKey)=>typeof key==='string'&&/^(?:0|[1-9]\d*)$/.test(key);
 const handler:ProxyHandler<(NativeRow|CapturedSql)[]>={
  get(target,key,receiver){const value=Reflect.get(target,key,receiver);return index(key)?expand(value):value;},
  getOwnPropertyDescriptor(target,key){const descriptor=Reflect.getOwnPropertyDescriptor(target,key);return descriptor&&index(key)?{...descriptor,value:expand(descriptor.value)}:descriptor;},
  set(target,key,value){return Reflect.set(target,key,index(key)?handles.get(value)??value:value);},
 };
 return {row,collection:():NativeRow[]=>new Proxy([] as (NativeRow|CapturedSql)[],handler) as NativeRow[]};
}
