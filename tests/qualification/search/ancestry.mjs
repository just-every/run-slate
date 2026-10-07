import assert from 'node:assert/strict';
export async function checkAncestry({sql,page,find,now}) {
 await page('tree-parent',{text:'Parent retained'},{restricted:true});
 await page('tree-child',{text:'Descendant needle'});
 await sql("UPDATE pages SET parent_page_id='tree-parent' WHERE id='tree-child'");
 assert.equal((await find('Descendant')).total,0);
 await sql("INSERT INTO groups(id,workspace_id,name,created_at,updated_at,revision_id) VALUES('tree-group','w','Tree readers',?,?,'g')",now,now);
 await sql("INSERT INTO group_members VALUES('tree-group','reader',?)",now);
 await sql("INSERT INTO page_grants(id,page_id,principal_kind,principal_id,level,created_at,updated_at) VALUES('tree-grant','tree-parent','group','tree-group','view',?,?)",now,now);
 assert.equal((await find('Descendant')).total,1);
 await sql("UPDATE page_grants SET expires_at='2000-01-01' WHERE id='tree-grant'");assert.equal((await find('Descendant')).total,0);
 await sql("UPDATE page_grants SET expires_at=NULL WHERE id='tree-grant'");await sql("UPDATE pages SET access_inheritance='restricted' WHERE id='tree-child'");assert.equal((await find('Descendant')).total,0);
 await sql("UPDATE pages SET access_inheritance='inherit' WHERE id='tree-child'");await sql("DELETE FROM group_members WHERE group_id='tree-group'");assert.equal((await find('Descendant')).total,0);
 await sql("UPDATE pages SET parent_page_id=NULL WHERE id='tree-child'");assert.equal((await find('Descendant')).total,1);
 await sql("UPDATE pages SET archived_at=?,lifecycle='archived' WHERE id='tree-child'",now);assert.equal((await find('Descendant')).total,0);assert.equal((await find('Descendant','reader',{includeArchived:true})).total,1);
 await sql("UPDATE pages SET trashed_at=? WHERE id='tree-child'",now);assert.equal((await find('Descendant','reader',{includeArchived:true})).total,0);assert.equal((await find('Descendant','reader',{includeArchived:true,includeTrashed:true})).total,1);
}
