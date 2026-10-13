import assert from 'node:assert/strict';
import { nativeStagingFixture } from './retained-fixtures.ts';
import { nativePrivateTables } from './native-staging-fixture.ts';
import { sqliteSource } from './sqlite-runtime.ts';
import { provenanceTransportMeter } from './provenance-transport-meter.ts';
import { canonicalJson,planD1Import,createD1ImportJob,type D1TargetAdapter,type TargetRow } from '../../src/d1/index.ts';

export async function provenanceTransportFixture(t:any,count:number,preserve=false){
  const r=await nativeStagingFixture(t),original=r.targets,meter=provenanceTransportMeter(r.db);
  const targets:D1TargetAdapter={...original,
    write(row){return [...original.remove(row.destination,row.targetKind,row.targetId),...original.write(row)];},
    matchesMany(rows,destination){return [original.matchesCount!(rows.length,destination),{sql:'(SELECT count(*) FROM native_parts)=?',params:[rows.reduce((n,row)=>n+(row.value as any).rows.length,0)]},...rows.flatMap(row=>original.matchesParts!(row,destination,row.targetKind,row.targetId))];},
    async preparePreservedUndo(db,destination,effects){
      const nativeRows=await original.list(db,destination);
      return {nativeRows,observations:effects.map(effect=>({effectId:effect.provenance.id,current:nativeRows.find(row=>row.targetKind===effect.expected.targetKind&&row.targetId===effect.expected.targetId)??null,entity:{table:'native_records',recordId:effect.expected.targetId}})),dependencies:[],guards:[original.matchesCount!(nativeRows.length,destination)]};
    },
  };
  const context=(batchSize=100)=>({...r.context(),batchSize,reversalPolicy:preserve?'preserve-conflicts' as const:'strict' as const,storage:{database:meter.database,targets}});
  const before:TargetRow[]=Array.from({length:count},(_,i)=>({destination:'workspace',targetKind:'record',targetId:String(i),revision:`prior-${i}`,value:{rows:Array.from({length:12},(_,part)=>`${i}:${part}:`+'漢'.repeat(32000))}}));
  for(const row of before){assert.ok(Buffer.byteLength(canonicalJson(row))<2_000_000);await meter.request(`seed-${row.targetId}`,()=>meter.database.batch(targets.write(row).map(s=>meter.database.prepare(s.sql).bind(...s.params??[]))));}
  const source=sqliteSource(1,'replacement');source.artifacts.forEach(a=>a.original={status:'unavailable',reason:'not-supplied'});
  const mapping={version:'v1',map:()=>({effects:before.map(row=>({targetKind:row.targetKind,targetId:row.targetId,expectedRevision:row.revision,value:{rows:[`applied:${row.targetId}`]}}))})};
  const plan=await meter.request('plan',()=>planD1Import(source,mapping,context()));
  const job=await meter.request('create',()=>createD1ImportJob(plan,{...context(),reviewedFingerprint:plan.fingerprint}));
  const clean=()=>{for(const table of [...nativePrivateTables,'ik_d1_assertions','ik_d1_staging','ik_d1_staging_pages','ik_d1_staging_index','ik_d1_staging_chunks','ik_d1_staging_originals'])assert.equal(r.native().prepare(`SELECT count(*) n FROM ${table}`).get()!.n,0,table);};
  const largeProvenance=()=>{
    const rows=r.native().prepare('SELECT record_json FROM ik_provenance WHERE job_id=? ORDER BY id').all(job.id);
    assert.equal(rows.length,count);const sizes=rows.map(row=>Buffer.byteLength(String(row.record_json)));
    assert.ok(sizes.every(bytes=>bytes<2_000_000));assert.ok(sizes.reduce((a,b)=>a+b,0)>2*1024*1024);return sizes;
  };
  return {...r,targets,meter,context,before,plan,job,clean,largeProvenance};
}
