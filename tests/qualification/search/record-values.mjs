import assert from 'node:assert/strict';
/** Reader-specific computed fields must never become shared index text. */
export async function checkRecordValues({sql,page,find,now}) {
 await page('database',{text:'Database body'});
 await sql("INSERT INTO databases(id,page_id,workspace_id,created_at,updated_at,revision_id) VALUES('db','database','w',?,?,'r')",now,now);
 const fields=[['amount','number',{}],['related','relation',{databaseId:'db'}],['sum','rollup',{relationField:'related',targetField:'amount',calculation:'sum'}],['computed','formula',{expression:{op:'concat',args:[{literal:'Computed'},{field:'sum'}]}}]];
 for(let i=0;i<fields.length;i++){const [id,type,config]=fields[i];await sql('INSERT INTO database_fields(id,database_id,name,field_type,config_json,position,created_at,updated_at,revision_id) VALUES(?,?,?,?,?,?,?,?,?)',id,'db',id,type,JSON.stringify(config),i,now,now,'r');}
 await page('record-source',{text:'Source body'});await page('record-target',{text:'Target body'},{restricted:true});
 await sql("UPDATE pages SET page_kind='record' WHERE id IN ('record-source','record-target')");
 for(const [id,values] of [['record-source',{related:['record-target']}],['record-target',{amount:731}]])await sql("INSERT INTO database_records(page_id,database_id,field_values_json,created_at,updated_at) VALUES(?,'db',?,?,?)",id,JSON.stringify(values),now,now);
 await sql("INSERT INTO page_grants(id,page_id,principal_kind,principal_id,level,created_at,updated_at) VALUES('record-owner','record-target','member','owner','full',?,?)",now,now);
 assert.equal((await find('Computed731','owner',{kind:'record'})).total,1);
 assert.equal((await find('Computed731','reader',{kind:'record'})).total,0);
 assert.ok((await find('Computed0','reader',{kind:'record'})).items.some(r=>r.id==='record-source'));
 await sql("INSERT INTO page_revisions(id,page_id,author_member_id,origin,content_hash,body_json,properties_json,created_at) VALUES('record-published','record-target','owner','publish','h','[]',?,?)",JSON.stringify({title:'Published target',databaseFields:{amount:732}}),now);
 await sql("UPDATE pages SET published_revision_id='record-published',lifecycle='live-with-unpublished-changes' WHERE id='record-target'");
 await sql("INSERT INTO page_grants(id,page_id,principal_kind,principal_id,level,created_at,updated_at) VALUES('record-reader','record-target','member','reader','view',?,?)",now,now);
 assert.equal((await find('Computed732','reader',{kind:'record'})).total,1);
 assert.equal((await find('Computed731','reader',{kind:'record'})).total,0);
 await sql("UPDATE page_grants SET revoked_at=? WHERE id='record-reader'",now);
 assert.equal((await find('Computed732','reader',{kind:'record'})).total,0);
 assert.ok((await find('Computed0','reader',{kind:'record'})).items.some(r=>r.id==='record-source'));
}
