import {DatabaseSync} from 'node:sqlite';
import {readdirSync,readFileSync} from 'node:fs';
/** Test-only D1 adapter executes the actual schema/SQL and preserves batch atomicity. */
export function database(){
 const sql=new DatabaseSync(':memory:',{enableDoubleQuotedStringLiterals:true});
 for(const name of readdirSync(new URL('../../../migrations/core/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())sql.exec(readFileSync(new URL(`../../../migrations/core/${name}`,import.meta.url),'utf8'));
 const db={prepare(query:string){let args:any[]=[];const statement={bind(...values:any[]){args=values;return statement;},async first(column?:string){const row=sql.prepare(query).get(...args);return column?row?.[column]??null:row??null;},async all(){return{results:sql.prepare(query).all(...args),success:true,meta:{}};},async run(){const result=sql.prepare(query).run(...args);return{success:true,meta:{changes:result.changes},results:[]};}};return statement;},async batch(statements:any[]){sql.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());sql.exec('COMMIT');return results;}catch(e){sql.exec('ROLLBACK');throw e;}}};
 return {sql,db:db as unknown as D1Database};
}
