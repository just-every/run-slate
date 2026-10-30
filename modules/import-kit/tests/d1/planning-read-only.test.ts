import test from 'node:test';
import { DatabaseSync } from '../../../container/adapters/d1-sqlite.mjs';
import assert from 'node:assert/strict';
import { sqliteRuntime, sqliteSource, sqliteMapping } from './sqlite-runtime.ts';
import { planD1Import, planD1ImportStream } from '../../src/d1/index.ts';
import { observeReads, totalChanges } from './read-only-tools.ts';

for(const stream of [false,true])test(`public ${stream?'stream':'ordinary'} planning uses live plan authority and zero writes`,async t=>{
  const r=await sqliteRuntime(t),source=sqliteSource(1);
  if(stream)source.artifacts[0].original={status:'unavailable',reason:'not-supplied'};
  const observed=observeReads(r.db()),actions:string[]=[];
  // An independent session changes the real persistent grant; query_only
  // forbids the planning connection from performing any database write.
  const revoker=new DatabaseSync(r.native().prepare('PRAGMA database_list').get()!.file as string);
  t.after(()=>revoker.close());
  const context={...r.context(),authorization:{principalId:'owner',predicate:(action:any)=>{actions.push(action);return {sql:action==='plan'?"EXISTS(SELECT 1 FROM native_authority WHERE id='owner' AND enabled=1)":'0'};}},storage:{...r.context().storage,database:observed.database}};
  r.native().exec('PRAGMA query_only=ON');
  const changes=totalChanges(r.native()),plan=stream?planD1ImportStream:planD1Import;
  assert.ok((await plan(source,sqliteMapping,context)).fingerprint);
  revoker.exec('UPDATE native_authority SET enabled=0');
  await assert.rejects(plan(source,sqliteMapping,context),/IMPORT_ATOMIC_GUARD/);
  revoker.exec('UPDATE native_authority SET enabled=1');
  const revoking={version:'v1',map:(record:any)=>{revoker.exec('UPDATE native_authority SET enabled=0');return sqliteMapping.map(record);}};
  await assert.rejects(plan(source,revoking,context),/IMPORT_ATOMIC_GUARD/);
  assert.ok(actions.length>0&&actions.every(action=>action==='plan'));
  assert.equal(totalChanges(r.native()),changes);observed.assertSelectOnly();
});
