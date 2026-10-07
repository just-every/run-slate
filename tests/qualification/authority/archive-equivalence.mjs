import assert from 'node:assert/strict';

/** Compare every retained record, naming only the required recovery authority changes. */
export function assertArchiveEquivalent(before,after,ownerEmail){
 assert.deepEqual(after.columns,before.columns);
 assert.deepEqual(Object.keys(after.tables).sort(),Object.keys(before.tables).sort());
 const additions=new Set(['federation_exports','activity_entries','core_entity_revisions']);
 const normal=(table,row,archive)=>{
  const value={...row};
  if(table==='files')value.storage_key=archive.blobs.find(b=>b.key===row.storage_key)?.hash??row.storage_key;
  if(table==='federation_imports')value.archive_key=archive.blobs.find(b=>b.key===row.archive_key)?.hash??row.archive_key;
  if(table==='members'){
   assert.equal(row.is_setup_owner,String(row.email).toLowerCase()===ownerEmail.toLowerCase()?1:0);
   delete value.status;
  }
  if(table==='intelligence_skill_versions'){if(value.state==='active')value.state=value.evaluation_id?'evaluated':'draft';value.authority_id=null;}
  if(table==='content_schedules'&&value.state==='scheduled')value.state='cancelled';
  if(table==='federation_exports'){
   value.archive_key=null;if(['running','queued'].includes(value.state))value.state='failed';
   value.report_json=JSON.stringify({...JSON.parse(value.report_json),recovery:{archiveOmitted:true,note:'Prior derived export archive omitted; create a new export from restored records.'}});
  }
  return JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b))));
 };
 const counts={};
 for(const [table,rows]of Object.entries(before.tables)){
  const actual=after.tables[table],remaining=actual.map(row=>normal(table,row,after));
  for(const row of rows){const expected=normal(table,row,before),index=remaining.indexOf(expected);assert.notEqual(index,-1,`Every retained field survives: ${table}/${row.id??expected}`);remaining.splice(index,1);}
  assert.equal(remaining.length,additions.has(table)?1:0,`Only the new export adds records: ${table}`);
  counts[table]={before:rows.length,after:actual.length};
 }
 assert.ok(after.tables.members.every(row=>row.status===(String(row.email).toLowerCase()===ownerEmail.toLowerCase()?'active':'historical')));
 assert.equal(after.tables.workspaces[0].ai_enabled,0);
 assert.ok(after.tables.intelligence_skill_versions.every(row=>row.state!=='active'&&row.authority_id===null));
 assert.deepEqual(after.blobs.map(b=>b.hash).sort(),before.blobs.map(b=>b.hash).sort());
 return counts;
}
