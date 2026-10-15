import type {D1Sql} from '../../../../modules/import-kit/src/d1/index.ts';

/** Keep the SQL beside real D1 statements so a native operation can join the
 * Kit's guarded transaction. Reads and writes always use the actual database. */
export function erasureTransaction(database:D1Database) {
  const capturedSql=Symbol('native erasure SQL');
  const wrap=(sql:string,params:unknown[]=[]):D1PreparedStatement=>{
    const native=database.prepare(sql).bind(...params);
    const statement={
      bind:(...values:unknown[])=>wrap(sql,values),
      first:(...args:Parameters<D1PreparedStatement['first']>)=>native.first(...args),
      all:()=>native.all(),raw:(...args:Parameters<D1PreparedStatement['raw']>)=>native.raw(...args),run:()=>native.run(),
    } as D1PreparedStatement;
    Object.defineProperty(statement,capturedSql,{value:{sql,params}});return statement;
  };
  const statement=(value:D1PreparedStatement)=>{const query=(value as unknown as Record<symbol,D1Sql>)[capturedSql];if(!query)throw new Error('Uncaptured erasure statement.');return query;};
  const prepare=(query:D1Sql)=>database.prepare(query.sql).bind(...query.params??[]);
  const db={prepare:wrap,batch:(statements:D1PreparedStatement[])=>database.batch(statements.map(value=>prepare(statement(value)))),exec:(sql:string)=>database.exec(sql),dump:()=>database.dump()} as D1Database;
  return {db,statement,prepare};
}
