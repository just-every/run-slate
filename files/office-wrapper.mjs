import {readFile} from 'node:fs/promises';
import {wordColumnsFixture} from '/workspace/run-slate/tests/helpers/word-columns-fixture.mjs';
import {assertPaginatedWordColumns} from '/workspace/run-slate/tests/helpers/word-columns-pagination.mjs';
const corpus=wordColumnsFixture(()=>crypto.randomUUID());
const result=await assertPaginatedWordColumns(await readFile(process.argv[2]),corpus,(11906-2880)/20);
console.log(JSON.stringify(result,null,2));
