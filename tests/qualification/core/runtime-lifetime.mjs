import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createRuntime} from '../local/runtime.mjs';
const r=await createRuntime({root:process.env.QUAL_ROOT??process.cwd(),evidence:process.env.QUAL_EVIDENCE,appPort:Number(process.env.QUAL_APP_PORT),inspectorPort:Number(process.env.QUAL_INSPECTOR_PORT)});
try{
 const [first,second]=await Promise.all([r.sql('SELECT 1 AS n'),r.sql('SELECT 2 AS n')]);assert.equal(first[0].results[0].n,1);assert.equal(second[0].results[0].n,2);
 await assert.rejects(r.sql('SELECT missing_qualification_column FROM workspaces'),/missing_qualification_column|no such column/);
 assert.equal((await fetch(r.origin+'/health')).status,200);assert.equal((await r.sql('SELECT count(*) n FROM workspaces'))[0].results[0].n,0);
 const records=JSON.parse(await readFile(r.directory+'/storage-operations.json','utf8')).operations;assert.deepEqual(records.map(x=>x.outcome),['pass','pass','fail','pass']);assert.deepEqual(records.map(x=>x.workerGeneration),[1,2,3,4]);
 await writeFile(r.directory+'/runtime-lifetime.json',JSON.stringify({artifact:r.artifact.artifactHash,passed:true,records,limits:'Harness ownership regression only: explicit fixture/probe downtime; SQL errors remain visible, no retry or native app availability claim.'},null,2));console.log(r.directory);
}finally{await r.close();}
