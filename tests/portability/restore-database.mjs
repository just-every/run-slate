import {DatabaseSync} from 'node:sqlite';
import {readdirSync,readFileSync} from 'node:fs';

/** Test-only D1 interface over the complete migrated SQLite schema. */
export function restoreDatabase(){
  const sql=new DatabaseSync(':memory:',{enableDoubleQuotedStringLiterals:true});
  const directory=new URL('../../migrations/core/',import.meta.url);
  for(const name of readdirSync(directory).filter(name=>name.endsWith('.sql')).sort()){
    sql.exec(readFileSync(new URL(name,directory),'utf8'));
  }
  const db={
    prepare(query){
      let values=[];
      const statement={
        bind(...args){values=args;return statement;},
        async first(column){const row=sql.prepare(query).get(...values);return column?row?.[column]??null:row??null;},
        async run(){
          const prepared=sql.prepare(query);
          if(prepared.columns().length)return {success:true,results:prepared.all(...values),meta:{}};
          const result=prepared.run(...values);
          return {success:true,results:[],meta:{changes:result.changes}};
        },
      };
      return statement;
    },
    async batch(statements){
      sql.exec('BEGIN');
      try{
        const results=[];
        for(const statement of statements)results.push(await statement.run());
        sql.exec('COMMIT');return results;
      }catch(error){sql.exec('ROLLBACK');throw error;}
    },
  };
  function snapshot(){
    const tables=sql.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
    return Object.fromEntries(tables.map(({name})=>[
      name,sql.prepare(`SELECT * FROM "${name}"`).all().map(row=>JSON.stringify(row)).sort(),
    ]));
  }
  return {db,sql,snapshot,close(){sql.close();}};
}
