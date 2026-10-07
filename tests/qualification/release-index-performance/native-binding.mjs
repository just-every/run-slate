/** Observe/inject at native statement boundaries; every response comes from D1. */
export function observeBinding(db,{beforeRead=()=>{},beforeBatch=()=>{},afterBatch=()=>{}}={}) {
 const prepared=(sql,args=[])=>({sql,args,bind(...values){return prepared(sql,values);},async all(){await beforeRead(sql,args);return db.prepare(sql).bind(...args).all();}});
 return {prepare:prepared,async batch(statements){await beforeBatch(statements);const results=await db.batch(statements.map(s=>db.prepare(s.sql).bind(...s.args)));await afterBatch(statements,results);return results;}};
}
