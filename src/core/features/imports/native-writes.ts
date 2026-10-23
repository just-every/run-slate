import {Buffer} from 'node:buffer';
import type {D1Sql} from '../../../../modules/import-kit/src/d1/index.ts';
import type {NativeRow} from './native-plan';

export function nativeIdentifier(name:string) {
  if(!/^[a-z][a-z0-9_]*$/.test(name))throw new Error('Invalid native import identifier.');
  return `"${name}"`;
}

/** Pack adjacent inserts without moving a row across its authority guards or
 * side effects. Every row still fires its native constraints and triggers. */
export function nativeWrites(rows:NativeRow[],hiddenAt?:string):D1Sql[] {
  const statements:D1Sql[]=[];
  let table='',columns:string[]=[],encoded:string[]=[],bytes=2;
  function flush() {
    if(!encoded.length)return;
    statements.push({sql:`INSERT INTO ${nativeIdentifier(table)} (${columns.map(nativeIdentifier).join(',')}) SELECT ${columns.map((_,i)=>`json_extract(value,'$[${i}]')`).join(',')} FROM json_each(?) ORDER BY CAST(key AS INTEGER)`,params:[`[${encoded.join(',')}]`]});
    encoded=[];bytes=2;
  }
  for(const row of rows) {
    if(row.derived)continue;
    if(row.before?.length){flush();statements.push(...row.before);}
    const values={...row.values};
    if(hiddenAt&&row.table==='pages')values.deleted_at=hiddenAt;
    if(hiddenAt&&row.table==='containers')values.trashed_at=hiddenAt;
    const names=Object.keys(values),text=JSON.stringify(names.map(name=>values[name]));
    const size=Buffer.byteLength(text)+1;
    // Leave room below D1's existing per-value and transaction envelopes.
    if(table!==row.table||JSON.stringify(columns)!==JSON.stringify(names)||bytes+size>1_500_000)flush();
    table=row.table;columns=names;encoded.push(text);bytes+=size;
    if(row.after?.length){flush();statements.push(...row.after);}
  }
  flush();return statements;
}
