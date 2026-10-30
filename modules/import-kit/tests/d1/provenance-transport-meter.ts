import assert from 'node:assert/strict';
import type { D1Database } from '../../src/d1/types.ts';

/** Counts the real SQLite port's executions and complete serialized batches. */
export function provenanceTransportMeter(current:()=>D1Database) {
  let queries=0,privateBatches=0,maxWire=0,maxValue=0,maxSql=0,maxBindings=0;
  const requests:{label:string;queries:number;privateBatches:number}[]=[];
  const check=(query:string,values:any[])=>{
    maxSql=Math.max(maxSql,Buffer.byteLength(query));maxBindings=Math.max(maxBindings,values.length);
    assert.ok(Buffer.byteLength(query)<=100_000);assert.ok(values.length<=100);
    for(const value of values){const bytes=typeof value==='string'?Buffer.byteLength(value):value instanceof ArrayBuffer?value.byteLength:ArrayBuffer.isView(value)?value.byteLength:0;maxValue=Math.max(maxValue,bytes);assert.ok(bytes<=2_000_000);}
  };
  const statement=(query:string,values:any[]=[]):any=>({query,values,bind(...next:any[]){return statement(query,next);},async first(){check(query,values);queries++;return current().prepare(query).bind(...values).first();},async all(){check(query,values);queries++;return current().prepare(query).bind(...values).all();}});
  const database:D1Database={prepare:statement,async batch(rows:any[]){
    rows.forEach(row=>check(row.query,row.values));queries++;
    const bytes=Buffer.byteLength(JSON.stringify(rows.map(row=>({sql:row.query,params:row.values}))));maxWire=Math.max(maxWire,bytes);assert.ok(bytes<=2*1024*1024);
    privateBatches+=Number(rows.some(row=>row.query.startsWith('INSERT INTO ik_d1_native_staging_values')));
    return current().batch(rows);
  }};
  return {database,requests,get privateBatches(){return privateBatches;},async request<T>(label:string,run:()=>Promise<T>):Promise<T>{
    queries=0;const before=privateBatches;
    try{return await run();}finally{requests.push({label,queries,privateBatches:privateBatches-before});assert.ok(queries<=1000,`${label}: ${queries} queries`);}
  },summary:()=>({requests,maxWire,maxValue,maxSql,maxBindings,privateBatches})};
}
