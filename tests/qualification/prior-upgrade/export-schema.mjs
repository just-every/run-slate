import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {save,sha} from './support.mjs';
/** The frozen product's declared inventory supplies names; stopped storage supplies actual column order. */
export async function exportReference(root,snapshot,exportId){
 const source=await readFile(path.join(root,'src/core/features/portability/tables.ts'),'utf8');
 const declaration=source.match(/export const portableTables\s*=\s*(\[[\s\S]*?\])\s*as const;/);
 assert.ok(declaration,'Frozen portableTables declaration is not inspectable; refuse unknown schema');
 const portableTables=JSON.parse(declaration[1]);assert.ok(portableTables.every(name=>typeof name==='string'));
 assert.equal(new Set(portableTables).size,portableTables.length);
 for(const name of portableTables)assert.ok(snapshot.tables[name],`Frozen canonical table missing from installed schema: ${name}`);
 await save('export-reference.json',{sourceSchemaHash:sha(source),portableTables,exportId,snapshot});
}
