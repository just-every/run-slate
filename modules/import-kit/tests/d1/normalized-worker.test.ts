import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare, convertV4MiniflareOptions } from '../../../container/adapters/d1-workerd.mjs';

test('Worker entry retains originals and reverses normalized streams inside actual workerd', async () => {
  const root = fileURLToPath(new URL('../../src/', import.meta.url)), modules: any[] = [], seen = new Set<string>();
  async function collect(path: string) {
    if (seen.has(path)) return; seen.add(path);
    const contents = stripTypeScriptTypes(await readFile(path, 'utf8'));
    assert.ok(!contents.includes("from 'node:sqlite'"));
    modules.push({ type: 'ESModule', path, contents });
    for (const match of contents.matchAll(/(?:from\s+|import\s*)['"]([^'"]+)['"]/g)) if (match[1].startsWith('.')) await collect(resolve(dirname(path), match[1]));
  }
  await collect(join(root, 'd1/index.ts'));
  const script = `import { initializeD1ImportStorage,planD1Import,createD1ImportJob,readD1ImportOriginals,canonicalJson,sha256,planD1ImportStream,createD1ImportStream,resumeD1ImportStream,undoD1ImportStream } from './d1/index.ts';
import { Buffer } from 'node:buffer';
export default {async fetch(req,env){
await initializeD1ImportStorage(env.DB);
await env.DB.prepare('CREATE TABLE IF NOT EXISTS authority (actor TEXT PRIMARY KEY)').run();
await env.DB.prepare("INSERT OR IGNORE INTO authority VALUES('owner')").run();
const bytes='[]',hash=sha256(bytes);
const source={records:[],diagnostics:[],artifacts:[{name:'empty.json',sha256:hash,size:2,original:{status:'available',base64:Buffer.from(bytes).toString('base64')}}]};
const ctx={destination:'d',namespace:'n',mappingVersion:'v',storage:{database:env.DB,targets:{planCodec:{id:'worker-identity-v1',encode:p=>p,decode:p=>p}}},authorization:{principalId:'owner',predicate:()=>({sql:"EXISTS(SELECT 1 FROM authority WHERE actor=?)",params:['owner']})}};
const plan=await planD1Import(source,{version:'v',map(){throw Error('no records')}},ctx);
const job=await createD1ImportJob(plan,{...ctx,reviewedFingerprint:plan.fingerprint});
const normalized={...source,artifacts:[{...source.artifacts[0],original:{status:'unavailable',reason:'not-supplied'}}],records:Array.from({length:201},(_,i)=>({namespace:'n',kind:'note',sourceId:String(i),payload:{text:'retained '+i},payloadHash:sha256(canonicalJson({text:'retained '+i})),artifactHash:hash,location:{artifact:'empty.json',row:i+1}}))};
const paged=await planD1ImportStream(normalized,{version:'v',map(){return {effects:[],unmapped:[{reason:'Retained source-only record.'}]}}},ctx);
let streamed=await createD1ImportStream(paged,{...ctx,reviewedFingerprint:paged.fingerprint});
while(streamed.state!=='completed')streamed=await resumeD1ImportStream(streamed.id,ctx);
const completed=streamed;
while(streamed.state!=='undone')streamed=await undoD1ImportStream(streamed.id,ctx);
return Response.json({job,originals:await readD1ImportOriginals(job.id,ctx),completed,streamed,pages:paged.pages.length});
}};`;
  const directory = await mkdtemp(join(tmpdir(), 'import-worker-'));
  const mf = new Miniflare({ ...convertV4MiniflareOptions({ modules: [{ type: 'ESModule', path: join(root, 'worker.js'), contents: script }, ...modules], modulesRoot: resolve(root, "../.."), compatibilityDate: '2026-09-01', compatibilityFlags: ['nodejs_compat'], d1Databases: { DB: 'worker-import' } }), resourcePersistencePath: directory });
  try { const response = await mf.dispatchFetch('http://localhost'); assert.equal(response.status, 200, await response.clone().text()); const result = await response.json() as any; assert.equal(result.job.state, 'queued'); assert.equal(result.originals[0].original.base64, 'W10='); assert.equal(result.completed.total,201); assert.equal(result.completed.checkpoint,201); assert.equal(result.streamed.state,'undone'); assert.equal(result.pages,3); }
  finally { await mf.dispose(); await rm(directory, { recursive: true, force: true }); }
});
