import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {getPlatformProxy} from 'wrangler';
import {createRuntime} from '../local/runtime.mjs';
import {launch,stop,delay,command} from '../local/process.mjs';
import {evidence} from './evidence.mjs';
const runtime=await createRuntime({root:process.cwd(),evidence,appPort:8752,inspectorPort:8753});
let proxy,server;
await runtime.close();
const report={clauses:['SEARCH-001','SEARCH-004','SEARCH-005','SEARCH-008','LIFE-002','LIFE-005','SHARE-007'],identity:runtime.artifact,fixture:'Local synthetic capacity records and session possession only; no mail/provider/bootstrap acceptance.',checks:[],timings:[]};
try {
 proxy=await getPlatformProxy({configPath:runtime.directory+'/wrangler.json',persist:{path:runtime.persist+'/v3'}});const db=proxy.env.DB;
 const sql=async(s,...args)=>db.prepare(s).bind(...args).run();
 const now=new Date().toISOString();
 await sql("INSERT INTO workspaces(id,name,mark,created_at,updated_at,revision_id) VALUES('w','Capacity fixture','S',?,?,'r')",now,now);
 for(const id of ['owner','reader','guest']){
 await sql("INSERT INTO members(id,workspace_id,email,display_name,initials,role,member_kind,created_at,updated_at) VALUES(?,'w',?,?,?,? ,?, ?,?)",id,`${id}@test.invalid`,id,id,id==='owner'?'owner':'member',id==='guest'?'guest':'member',now,now);
 const digest=createHmac('sha256',runtime.sessionSecret).update(id+'-token').digest('hex');
 await sql("INSERT INTO sessions(id,member_id,token_digest,created_at,updated_at,expires_at) VALUES(?,?,?,?,?,?)",id+'-session',id,digest,now,now,'2099-01-01T00:00:00.000Z');
 }
 for(let c=0;c<5;c++){
 await sql("INSERT INTO containers(id,workspace_id,name,created_at,updated_at,revision_id) VALUES(?,'w',?, ?,?,'r')",'c'+c,'Capacity '+c,now,now);
 await sql("INSERT INTO container_owners VALUES(?,'owner',?)",'c'+c,now);
 for(const actor of ['owner','reader'])await sql("INSERT INTO container_grants(id,container_id,principal_kind,principal_id,level,created_at,updated_at) VALUES(?,?,'member',?,?,?,?)",`cg-${c}-${actor}`,'c'+c,actor,actor==='owner'?'full':'view',now,now);
 }
 // Remove only the new additive schema, seed genuine pre-upgrade source tables, then apply it.
 const triggers=(await db.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'search_%'").all()).results;
 for(const {name} of triggers)await sql(`DROP TRIGGER ${name}`);
 for(const table of ['search_text','search_dirty'])await sql(`DROP TABLE ${table}`);
 await sql('ALTER TABLE discovery_snapshots DROP COLUMN search_summary_json');
 await sql('DROP INDEX pages_search_parent');
 const manifest=JSON.parse(await readFile('seed.json','utf8')),count=manifest.limits.capacityEstimate.pagesPerWorkspace;
 assert.equal(count,100000);assert.equal(manifest.limits.capacityEstimate.pagesPerContainer,20000);
 await sql(`WITH RECURSIVE n(x) AS (VALUES(0) UNION ALL SELECT x+1 FROM n WHERE x+1<${count}) INSERT INTO pages(id,workspace_id,container_id,title,author_member_id,lifecycle,working_revision_id,published_revision_id,created_at,updated_at,revision_id) SELECT 'p'||x,'w','c'||CAST(x/20000 AS INTEGER),CASE WHEN x<30 THEN 'Load sentinel '||x ELSE 'Capacity page '||x END,'owner','live','r'||x,'r'||x,?,?,'r'||x FROM n`,now,now);
 await sql("INSERT INTO page_blocks(id,page_id,block_type,content_json,tree_position,revision_id,created_at,updated_at) SELECT 'b'||id,id,'paragraph',json_object('text',json_array(json_object('text','Retained canonical body '||id))),'a','b'||id,?,? FROM pages",now,now);
 const migration=await readFile('migrations/core/0012_search_capacity.sql','utf8');
 for(const line of migration.split('\n').filter(l=>l.trim()&&!l.startsWith('--')))await sql(line);
 assert.equal((await db.prepare('SELECT count(*) n FROM search_dirty').first()).n,count+5);
 await proxy.dispose();proxy=undefined;
 const rebuildOutput=await command(process.execPath,['scripts/rebuild-search.mjs','--config',runtime.directory+'/wrangler.json','--persist-to',runtime.persist,'--workspace','w'],{cwd:process.cwd(),log:runtime.directory+'/rebuild.log'});
 const rebuilt=JSON.parse(rebuildOutput.trim().split('\n').findLast(line=>line.startsWith('{')));
 report.rebuild={pages:count,rows:rebuilt.refreshed,elapsedMs:rebuilt.elapsedMs,command:'node scripts/rebuild-search.mjs --config LOCAL_CONFIG --persist-to LOCAL_STATE --workspace w'};
 proxy=await getPlatformProxy({configPath:runtime.directory+'/wrangler.json',persist:{path:runtime.persist+'/v3'}});
 assert.equal((await proxy.env.DB.prepare("SELECT count(*) n FROM search_text WHERE kind='page' AND variant='working'").first()).n,count);
 assert.equal((await proxy.env.DB.prepare('SELECT count(*) n FROM search_dirty').first()).n,0);
 report.containerCounts=(await proxy.env.DB.prepare('SELECT container_id,COUNT(*) AS pages FROM pages GROUP BY container_id').all()).results;
 assert.equal(report.containerCounts.length,5);assert.ok(report.containerCounts.every(c=>c.pages===20000));
 report.checks.push('prior-data additive migration rebuilt every canonical page');
 await proxy.dispose();proxy=undefined;
 server=launch(process.execPath,['node_modules/wrangler/bin/wrangler.js','dev','--local','--config',runtime.directory+'/wrangler.json','--persist-to',runtime.persist,'--ip','127.0.0.1','--port','8752','--inspector-port','8753'],{cwd:process.cwd()});
 for(let i=0;i<300;i++){try{if((await fetch(runtime.origin+'/health')).ok)break;}catch{}await delay(200);}
 async function search(q,actor='reader',extra=''){
 const start=performance.now();const response=await fetch(runtime.origin+'/api/search?q='+encodeURIComponent(q)+'&kind=page'+extra,{headers:{cookie:`slate_session=${actor}-token`},signal:AbortSignal.timeout(30000)});const body=await response.json();const ms=performance.now()-start;
 assert.equal(response.status,200,JSON.stringify(body));return {body,ms};
 }
 for(let i=0;i<20;i++){const r=await search('Load sentinel');assert.equal(r.body.total,30);report.timings.push(r.ms);}
 report.broadTimings=[];
 for(let i=0;i<20;i++){const broad=await search('Capacity page');assert.equal(broad.body.total,count-30);report.broadTimings.push(broad.ms);}
 report.broadP95=report.broadTimings.toSorted((a,b)=>a-b)[Math.ceil(report.broadTimings.length*.95)-1];
 report.p95=report.timings.toSorted((a,b)=>a-b)[Math.ceil(report.timings.length*.95)-1];
 report.checks.push('selective total and broad total at declared capacity');
 await writeFile(runtime.directory+'/report.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify({directory:runtime.directory,...report},null,2));
 assert.ok(report.p95<=500,`selective p95 ${report.p95}`);assert.ok(report.broadP95<=500,`broad p95 ${report.broadP95}`);
} catch(error){report.error=error.stack;await writeFile(runtime.directory+'/report.json',JSON.stringify(report,null,2));throw error;}
finally {await proxy?.dispose();await stop(server);if(server)await writeFile(runtime.directory+'/search-worker.log',server.output());await runtime.close();}
