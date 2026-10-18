import {ApiProblem} from '../../app/problems';
export interface ImportBatchStatement {sql:string;params:unknown[]}
/** Counts native and Kit SQL together, including every statement in a batch. */
export function importDatabaseBudget(db:D1Database,onBatchFailure?:(error:unknown,statements:ImportBatchStatement[])=>Promise<void>) {
  const metrics={statements:0,writes:0,batches:0,maxBatchStatements:0,maxParameters:0,maxSqlBytes:0,maxValueBytes:0,maxBatchValueBytes:0};
  const raw=new WeakMap<object,D1PreparedStatement>();
  const queries=new WeakMap<object,ImportBatchStatement>();
  const boundBytes=new WeakMap<object,number>();
  const encoder=new TextEncoder();
  const consume=(count:number)=>{if(metrics.statements+count>980)throw new ApiProblem(409,'IMPORT_REQUEST_BUDGET','This bounded import request exhausted its SQL budget. Resume from the durable checkpoint.');metrics.statements+=count;};
  const prepare=(query:string,values:unknown[]=[]):D1PreparedStatement=>{
    const sqlBytes=encoder.encode(query).length,valueBytes=values.reduce<number>((n,v)=>n+(typeof v==='string'?encoder.encode(v).length:8),0);
    if(values.length>100||sqlBytes>100_000||valueBytes>2_000_000)throw new ApiProblem(413,'IMPORT_STATEMENT_LIMIT','The import statement exceeds the native database transport limit.',{parameters:values.length,sqlBytes,valueBytes});
    metrics.maxParameters=Math.max(metrics.maxParameters,values.length);metrics.maxSqlBytes=Math.max(metrics.maxSqlBytes,sqlBytes);metrics.maxValueBytes=Math.max(metrics.maxValueBytes,valueBytes);
    const statement=db.prepare(query).bind(...values);
    const wrapped={bind:(...params:unknown[])=>prepare(query,params),first:(column?:string)=>{consume(1);return column?statement.first(column):statement.first();},all:()=>{consume(1);return statement.all();},run:()=>{consume(1);metrics.writes++;return statement.run();},raw:()=>{consume(1);return statement.raw();}} as D1PreparedStatement;
    raw.set(wrapped,statement);queries.set(wrapped,{sql:query,params:values});boundBytes.set(wrapped,valueBytes);return wrapped;
  };
  const database={prepare,async batch(statements:D1PreparedStatement[]){const total=statements.reduce((sum,statement)=>sum+(boundBytes.get(statement)??0),0);if(total>2_000_000)throw new ApiProblem(413,'IMPORT_BATCH_LIMIT','The import batch exceeds the database transport limit.');metrics.maxBatchValueBytes=Math.max(metrics.maxBatchValueBytes,total);consume(statements.length);metrics.writes++;metrics.batches++;metrics.maxBatchStatements=Math.max(metrics.maxBatchStatements,statements.length);try{return await db.batch(statements.map(statement=>{const native=raw.get(statement);if(!native)throw new Error('Unmeasured import SQL statement.');return native;}));}catch(error){await onBatchFailure?.(error,statements.map(statement=>queries.get(statement)!));throw error;}}} as unknown as D1Database;
  return {database,metrics};
}
