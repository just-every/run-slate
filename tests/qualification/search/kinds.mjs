import assert from 'node:assert/strict';
export async function checkKinds({sql,page,find,now}) {
 await sql("UPDATE containers SET description='Container description phrase' WHERE id='c'");
 assert.equal((await find('description phrase','reader',{kind:'container'})).total,1);
 await sql("INSERT INTO knowledge_templates(id,workspace_id,title,description,category,snapshot_json,created_at,updated_at,revision_id) VALUES('lexical-template','w','Reusable design','Template retained description','General',?, ?,?,'tr')",JSON.stringify({blocks:[{content:{text:[{text:'Template body text'}]}}]}),now,now);
 assert.equal((await find('retained description','reader',{kind:'template'})).total,1);assert.equal((await find('Template body','reader',{kind:'template'})).total,1);
 await page('discussion',{text:'Discussion page'});
 await sql("INSERT INTO comment_threads(id,workspace_id,page_id,kind,created_at,updated_at,revision_id) VALUES('discussion-thread','w','discussion','page',?,?,'dr')",now,now);
 await sql("INSERT INTO comments(id,thread_id,author_member_id,body_json,created_at,updated_at,revision_id) VALUES('discussion-comment','discussion-thread','reader',?,?,?,'cr')",JSON.stringify([{text:'Adjacent '},{text:'comment phrase'}]),now,now);
 assert.equal((await find('"Adjacent comment phrase"','reader',{kind:'comment-thread'})).total,1);
 await sql("UPDATE comments SET body_json=? WHERE id='discussion-comment'",JSON.stringify([{text:'Replacement comment'}]));assert.equal((await find('Adjacent comment','reader',{kind:'comment-thread'})).total,0);assert.equal((await find('Replacement comment','reader',{kind:'comment-thread',contributorId:'reader'})).total,1);
 await sql("UPDATE pages SET access_inheritance='restricted' WHERE id='discussion'");assert.equal((await find('Replacement comment','reader',{kind:'comment-thread'})).total,0);
}
