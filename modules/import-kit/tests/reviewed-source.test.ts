import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewedSourceRecords } from '../src/d1/reviewed-source.ts';
import { canonicalHash } from '../src/provenance/canonical-stream.ts';
import { canonicalJson } from '../src/provenance/identity.ts';
import { source } from './d1/fixtures.ts';

test('initial reviewed source reads preserve exact records with bounded fresh page checks', () => {
  const records=source(257).records;
  records[0].payload={ unicode:'漢😀\ud800', value:false, nested:[null,0,'0'] };
  const hashes=[0,100,200].map(start=>canonicalHash(records.slice(start,start+100)));
  const view=reviewedSourceRecords(records,hashes,100,records.length);
  assert.equal(Array.isArray(view),true);
  assert.equal(view.length,records.length);
  assert.equal(Object.getOwnPropertyDescriptor(view,'length')!.value,records.length);
  Object.freeze(view);
  assert.equal(view.length,records.length);
  assert.deepEqual(view.slice(99,102),records.slice(99,102));
  assert.deepEqual(view.map(record=>record.sourceId),records.map(record=>record.sourceId));
  assert.equal(canonicalJson(view),canonicalJson(records));
  view[100].sourceId='changed read';
  assert.notEqual(records[100].sourceId,'changed read');
  assert.equal(view[0].sourceId,records[0].sourceId);
  assert.equal(view[100].sourceId,records[100].sourceId);
  records[200].sourceId='changed input';
  assert.throws(()=>view[200],/IMPORT_STREAM_SOURCE_CHANGED/);
});

test('source reordering, page length and value changes cannot enter the initial fingerprint', () => {
  for(const change of [(records:any[])=>records.reverse(),(records:any[])=>records.push(records[0]),(records:any[])=>records.pop(),(records:any[])=>{records[0].payload='changed';}]){
    const records=source(3).records, hashes=[canonicalHash(records)];
    const view=reviewedSourceRecords(records,hashes,100,records.length);
    change(records);
    assert.throws(()=>canonicalHash(view),/IMPORT_STREAM_SOURCE_CHANGED/);
  }
});
