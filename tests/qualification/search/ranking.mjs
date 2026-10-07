import assert from 'node:assert/strict';

/** Broad ordering and counts must survive both stored variants and live permission changes. */
export async function checkRanking({sql,page,find,now}) {
 const expected=[];
 for(let i=0;i<75;i++){
  const id='ranking-'+String(i).padStart(2,'0'),score=i%3===0?20:i%3===1?10:1;
  const title=score===20?'rankneedle':score===10?'rankneedle heading':'Unrelated heading';
  const updated=i%2===0?'2025-01-01T00:00:00.000Z':'2025-01-02T00:00:00.000Z';
  await page(id,{text:'rankneedle retained text'});
  await sql('UPDATE pages SET title=?,working_revision_id=?,published_revision_id=?,updated_at=? WHERE id=?',title,id+'-revision',id+'-revision',updated,id);
  await sql("INSERT INTO page_revisions(id,page_id,author_member_id,origin,content_hash,body_json,properties_json,created_at) VALUES(?,?,'owner','publish','hash',?,?,?)",id+'-revision',id,JSON.stringify([{content:{text:'rankneedle retained text'}}]),JSON.stringify({title}),now);
  expected.push({id,score,updated});
 }
 expected.sort((a,b)=>b.score-a.score||b.updated.localeCompare(a.updated)||a.id.localeCompare(b.id));
 const request={kind:'page',limit:17};
 const first=await find('rankneedle','reader',request);
 assert.equal(first.total,75);assert.deepEqual(first.facets,{kind:{page:75},container:{c:75},status:{}});
 const observed=[];let result=first;
 while(true){observed.push(...result.items.map(x=>({id:x.id,score:x.score})));if(!result.nextCursor)break;result=await find('rankneedle','reader',{...request,cursor:result.nextCursor});assert.equal(result.total,75);assert.deepEqual(result.facets,first.facets);}
 assert.deepEqual(observed,expected.map(({id,score})=>({id,score})));
 // A first page remains fixed, but current revocation removes a future hit and its facet.
 const removed=expected[20].id;
 await sql("UPDATE pages SET access_inheritance='restricted' WHERE id=?",removed);
 const next=await find('rankneedle','reader',{...request,cursor:first.nextCursor});
 assert.equal(next.total,74);assert.deepEqual(next.facets,{kind:{page:74},container:{c:74},status:{}});assert.ok(next.items.every(x=>x.id!==removed));
 // Matching published content stays visible only to non-editors until revision convergence.
 const divergent=expected[30].id;
 await sql("UPDATE pages SET title='Unpublished replacement',working_revision_id='ranking-working',lifecycle='live-with-unpublished-changes' WHERE id=?",divergent);
 await sql("UPDATE page_blocks SET content_json=? WHERE page_id=?",JSON.stringify({text:'Unpublished replacement body'}),divergent);
 assert.equal((await find('rankneedle','reader',request)).total,74);
 assert.equal((await find('rankneedle','owner',request)).total,73);
 await sql('UPDATE pages SET published_revision_id=working_revision_id WHERE id=?',divergent);
 assert.equal((await find('rankneedle','reader',request)).total,73);
 assert.equal((await find('Unpublished replacement','reader',request)).total,1);
}
