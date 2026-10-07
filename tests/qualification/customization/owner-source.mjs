import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
export const migration='9001_owner_review.sql';
export async function customize(root){
 const edits=[
 ['src/core/platform/config/runtime.ts','if (localSampleData) {',"if (localSampleData || (isLoopback && env.AI_PROVIDER==='local-codex')) {"],
 ['src/core/platform/config/runtime.ts','return {localSampleData:true,sessionSecret:', 'return {localSampleData,sessionSecret:'],
 ['src/core/app/ui/AppNavigation.tsx','<nav\n        className="primary"','<a className="navlink" href="/app/decisions">Owner review desk</a>\n      <nav\n        className="primary"'],
 ['src/core/features/pages/service.ts',"labels: [], typeface: 'default'","labels: ['owner-review'], typeface: 'default'"],
 ['src/core/features/pages/service.ts',"return { statements, entity: { id, kind: 'page', revisionId }, value: { pageId: id, revisionId } };","statements.push(ctx.db.prepare('UPDATE pages SET owner_review_required=1 WHERE id=?').bind(id));\n    return { statements, entity: { id, kind: 'page', revisionId }, value: { pageId: id, revisionId } };"]
 ];
 for(const [file,from,to]of edits){const location=path.join(root,file),source=await readFile(location,'utf8');assert.equal(source.split(from).length,2,`Unambiguous owner patch ${file}`);await writeFile(location,source.replace(from,to));}
 await writeFile(path.join(root,'migrations/core',migration),'-- Owner review policy: existing documents retain their previous review status.\nALTER TABLE pages ADD COLUMN owner_review_required INTEGER NOT NULL DEFAULT 0 CHECK(owner_review_required IN (0,1));\n');
}
