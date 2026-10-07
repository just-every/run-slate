import { createRequire } from 'node:module';
import { readFile,readdir,mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHmac } from 'node:crypto';
const require=createRequire(import.meta.url);const dependencies=createRequire(require.resolve('wrangler/package.json'));
const {Miniflare,convertV4MiniflareOptions}=dependencies('miniflare');const {build}=dependencies('esbuild');
export async function harness(options={}){
 const temp=await mkdtemp(path.join(tmpdir(),'slate-discovery-'));const outfile=path.join(temp,'worker.mjs');
 await build({entryPoints:['tests/flagship/discovery/worker.ts'],outfile,bundle:true,format:'esm',platform:'browser',target:'es2022'});
 const mf=new Miniflare(convertV4MiniflareOptions({workers:[{name:'discovery',modules:true,script:await readFile(outfile,'utf8'),compatibilityDate:'2026-09-08',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'discovery'},r2Buckets:['FILES'],queueProducers:{JOBS:'discovery-jobs'},bindings:{SESSION_SECRET:'test-session-secret-with-at-least-32-characters',CONNECTOR_CREDENTIALS_KEY:'test-credential-key-with-at-least-32-characters'}}]}));
 let db;try{db=await mf.getD1Database('DB');}catch(error){await mf.dispose();throw error;}
 try{
 // SQLite complete statements preserve trigger bodies while D1 batch gives the real migration transaction.
 function split(sql){const out=[];let current='';for(const line of sql.split('\n')){const clean=line.replace(/--.*$/,'').trim();if(!clean)continue;current+=line+'\n';if(clean.endsWith(';')&&(!/^CREATE TRIGGER/i.test(current.trim())||/END;\s*$/.test(current))){out.push(current);current='';}}if(current.trim())throw Error('Incomplete migration SQL');return out;}
 for(const file of (await readdir('migrations/core')).filter(x=>/^000[12345]_/.test(x)).sort()){if(file.startsWith('0005'))await options.beforeDiscovery?.(db);const sql=await readFile(`migrations/core/${file}`,'utf8');for(const statement of split(sql))await db.prepare(statement).run();}
 const now=new Date().toISOString();
 await db.prepare("INSERT INTO workspaces(id,name,mark,created_at,updated_at,revision_id) VALUES('w','Discovery fixture','S',?,?,'wrev')").bind(now,now).run();
 for(const [id,role,kind] of [['owner','owner','member'],['reader','member','member'],['denied','member','member'],['guest','member','guest']]){
  await db.prepare('INSERT INTO members(id,workspace_id,email,display_name,initials,role,member_kind,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(id,'w',`${id}@example.test`,id,id.slice(0,2),role,kind,now,now).run();
  const digest=createHmac('sha256','test-session-secret-with-at-least-32-characters').update(`${id}-token`).digest('hex');await db.prepare('INSERT INTO sessions(id,member_id,token_digest,created_at,updated_at,expires_at) VALUES(?,?,?,?,?,?)').bind(`${id}-session`,id,digest,now,now,'2099-01-01T00:00:00.000Z').run();
 }
 await db.prepare("INSERT INTO containers(id,workspace_id,name,created_at,updated_at,revision_id) VALUES('c','w','Shared fixture',?,?,'crev')").bind(now,now).run();
 await db.prepare("INSERT INTO container_owners VALUES('c','owner',?)").bind(now).run();
 for(const id of ['owner','reader'])await db.prepare("INSERT INTO container_grants(id,container_id,principal_kind,principal_id,level,created_at,updated_at) VALUES(?, 'c','member',?,?,?,?)").bind(`cg-${id}`,id,id==='owner'?'full':'view',now,now).run();
 async function page(id,title,body='alpha beta',extra={}){await db.prepare("INSERT INTO pages(id,workspace_id,container_id,title,author_member_id,lifecycle,working_revision_id,published_revision_id,created_at,updated_at,revision_id,access_inheritance,status_key,archived_at,trashed_at) VALUES(?,'w','c',?,'owner',?,?,?,?,?,?,?,?,?,?)").bind(id,title,extra.lifecycle??'live',`${id}-rev`,`${id}-rev`,extra.at??now,extra.at??now,`${id}-rev`,extra.restricted?'restricted':'inherit',extra.status??null,extra.archivedAt??null,extra.trashedAt??null).run();await db.prepare("INSERT INTO page_blocks VALUES(?,?,NULL,'paragraph',?,'a',?,?,?)").bind(`${id}-block`,id,JSON.stringify({text:[{text:body}]}),`${id}-block-rev`,now,now).run();return id;}
 async function request(url,actor='reader',body,method=body?'POST':'GET'){const response=await mf.dispatchFetch(`http://localhost${url}`,{method,headers:{...(actor?{cookie:`slate_session=${actor}-token`}:{}),...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return {status:response.status,body:await response.json()};}
 return {db,page,request,now,close:async()=>{await mf.dispose();await rm(temp,{recursive:true,force:true});}};
 }catch(error){await mf.dispose();await rm(temp,{recursive:true,force:true});throw error;}
}
