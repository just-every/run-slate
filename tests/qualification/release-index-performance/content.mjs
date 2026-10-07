import assert from 'node:assert/strict';
/** Large retained bodies, revision variants and thread-only refresh use real search. */
export async function checkContent({db,workspace,now,refreshSearchIndex,search}) {
 const sql=(s,...v)=>db.prepare(s).bind(...v).run();
 const page=workspace+'-content',owner=workspace+'-owner',reader=workspace+'-reader',container=workspace+'-container';
 const ctx=id=>({db,actor:{id,workspaceId:workspace,role:id===owner?'owner':'member'},now});
 await sql('INSERT INTO members(id,workspace_id,email,display_name,initials,role,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',reader,workspace,reader+'@test.invalid','Reader','R','member',now,now);
 for(const actor of [owner,reader])await sql("INSERT INTO container_grants(id,container_id,principal_kind,principal_id,level,created_at,updated_at) VALUES(?,?,'member',?,?,?,?)",actor+'-grant',container,actor,actor===owner?'full':'view',now,now);
 await sql('INSERT INTO pages(id,workspace_id,container_id,title,author_member_id,lifecycle,working_revision_id,published_revision_id,created_at,updated_at,revision_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)',page,workspace,container,'Working headline',owner,'live','r','r',now,now,'r');
 const tail='Retained faraway phrase',large='λ'.repeat(98304),body={text:[{text:'Cafe\u0301 '},{text:large+' '+tail}]};
 await sql("INSERT INTO page_blocks(id,page_id,block_type,content_json,tree_position,revision_id,created_at,updated_at) VALUES(?,?,'paragraph',?,'a','r',?,?)",page+'-block',page,JSON.stringify(body),now,now);
 await refreshSearchIndex(ctx(owner));
 const retained=await db.prepare("SELECT text FROM search_text WHERE key=? AND variant='working'").bind('page:'+page).first();
 // The canonical fields section contributes its existing trailing separator.
 assert.equal(retained.text,'Café '+large+' '+tail+'\n');
 const find=(query,id=reader,kind='page')=>search(ctx(id),{query,kind});
 assert.equal((await find('"'+tail+'"')).total,1);assert.equal((await find('Café')).total,1);assert.equal((await find('"faraway Retained"')).total,0);
 const revision=page+'-published';
 await sql("INSERT INTO page_revisions(id,page_id,author_member_id,origin,content_hash,body_json,properties_json,created_at) VALUES(?,?,?,'publish','content-hash',?,?,?)",revision,page,owner,JSON.stringify([{content:{text:[{text:'Published '},{text:'Café phrase'}]}}]),JSON.stringify({title:'Published headline'}),now);
 await sql("UPDATE pages SET published_revision_id=?,working_revision_id='working',lifecycle='live-with-unpublished-changes' WHERE id=?",revision,page);
 const thread=page+'-thread';
 await sql("INSERT INTO comment_threads(id,workspace_id,page_id,kind,created_at,updated_at,revision_id) VALUES(?,?,?,'page',?,?,'r')",thread,workspace,page,now,now);
 await sql('INSERT INTO comments(id,thread_id,author_member_id,body_json,created_at,updated_at,revision_id) VALUES(?,?,?,?,?,?,?)',thread+'-comment',thread,reader,JSON.stringify([{text:'First '},{text:'thread prose'}]),now,now,'r');
 await refreshSearchIndex(ctx(owner));
 assert.equal((await find('"'+tail+'"')).total,0);assert.equal((await find('"'+tail+'"',owner)).total,1);assert.equal((await find('"Published Café phrase"')).total,1);
 await sql('UPDATE comments SET body_json=? WHERE id=?',JSON.stringify([{text:'Changed '},{text:'thread prose'}]),thread+'-comment');
 const dirty=(await db.prepare('SELECT key FROM search_dirty WHERE workspace_id=?').bind(workspace).all()).results;
 assert.deepEqual(dirty,[{key:'comment-thread:'+thread}]);
 await refreshSearchIndex(ctx(owner));
 const variants=(await db.prepare('SELECT variant,title,text FROM search_text WHERE key=? ORDER BY variant').bind('comment-thread:'+thread).all()).results;
 assert.deepEqual(variants,[{variant:'published',title:'Published headline',text:'Changed thread prose'},{variant:'working',title:'Working headline',text:'Changed thread prose'}]);
 const result=await find('"Changed thread prose"',reader,'comment-thread');assert.equal(result.total,1);assert.equal(result.items[0].title,'Published headline');
 await sql('UPDATE container_grants SET revoked_at=? WHERE id=?',now,reader+'-grant');assert.equal((await find('"Published Café phrase"')).total,0);
 return 'complete 98,304-character body, NFC spans, exact phrases, reader variants, thread-only parent revision and live revocation';
}
