import assert from 'node:assert/strict';
import {writeFile,readFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {createRuntime} from '../local/runtime.mjs';
import {fixtureFirstOwner} from '../local/first-owner.mjs';
import {q,rows} from './support.mjs';
import {command} from '../local/process.mjs';
const root=process.env.QUAL_ROOT??process.cwd(),manifest=JSON.parse(await readFile(root+'/seed.json','utf8'));
const count=manifest.limits.capacityEstimate.pagesPerWorkspace;
assert.equal(count,100000,'This proof qualifies the declared 100000-page capacity without a reduced override');
assert.equal(manifest.limits.capacityEstimate.pagesPerContainer,20000);
let r,browser;const samples=[];
try{
 r=await createRuntime({root,evidence:process.env.QUAL_EVIDENCE,appPort:Number(process.env.QUAL_APP_PORT),inspectorPort:Number(process.env.QUAL_INSPECTOR_PORT)});
 browser=await chromium.launch({headless:true});const context=await browser.newContext();await fixtureFirstOwner(r,context);const cookie=(await context.cookies()).map(c=>c.name+'='+c.value).join('; ');await browser.close();browser=undefined;
 const now=new Date().toISOString(),perContainer=manifest.limits.capacityEstimate.pagesPerContainer,containers=Math.ceil(count/perContainer),firstContainer=(await rows(r,"SELECT id FROM containers WHERE visibility='default'"))[0].id;
 await r.sql(`WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<${containers-1}) INSERT INTO containers(id,workspace_id,name,visibility,created_at,updated_at,revision_id) SELECT 'load-container-'||x,'qualification-workspace','Load fixture '||x,'default',${q(now)},${q(now)},'load-container-revision-'||x FROM n; INSERT INTO container_grants(id,container_id,principal_kind,principal_id,level,created_at,updated_at) SELECT 'load-grant-'||id,id,'member','qualification-owner','full',${q(now)},${q(now)} FROM containers WHERE id LIKE 'load-container-%';`);
 await r.sql(`WITH RECURSIVE n(x) AS (SELECT 0 UNION ALL SELECT x+1 FROM n WHERE x<${count-2}) INSERT INTO pages(id,workspace_id,container_id,title,author_member_id,lifecycle,working_revision_id,published_revision_id,created_at,updated_at,revision_id) SELECT 'load-page-'||x,'qualification-workspace',CASE WHEN (x+1)/${perContainer}=0 THEN ${q(firstContainer)} ELSE 'load-container-'||((x+1)/${perContainer}) END,'Load sentinel '||x,'qualification-owner','live','load-revision-'||x,'load-revision-'||x,${q(now)},${q(now)},'load-revision-'||x FROM n; INSERT INTO page_revisions(id,page_id,author_member_id,origin,content_hash,body_json,properties_json,created_at) SELECT working_revision_id,id,'qualification-owner','publish',id,'[]',json_object('title',title),${q(now)} FROM pages WHERE id LIKE 'load-page-%';`);
 const actual=(await rows(r,"SELECT count(*) n FROM pages"))[0].n;assert.equal(actual,100000);
 const populations=await rows(r,"SELECT container_id,count(*) n FROM pages GROUP BY container_id");assert.equal(populations.length,5);assert.ok(populations.every(x=>x.n<=20000));
 await r.close();const rebuildStarted=performance.now();
 const rebuildOutput=await command(process.execPath,['scripts/rebuild-search.mjs','--config',r.directory+'/wrangler.json','--persist-to',r.persist,'--workspace','qualification-workspace'],{cwd:root,log:r.directory+'/rebuild.log',timeout:600000});
 const rebuild={...JSON.parse(rebuildOutput.trim().split('\n').findLast(line=>line.startsWith('{'))),wallMs:performance.now()-rebuildStarted};
 await writeFile(r.directory+'/rebuild.json',JSON.stringify(rebuild,null,2));await r.restart();
 const indexed=(await rows(r,"SELECT count(DISTINCT id) n FROM search_text WHERE kind='page' AND workspace_id='qualification-workspace'"))[0].n;assert.equal(indexed,100000);
 assert.equal((await rows(r,"SELECT count(*) n FROM search_dirty WHERE workspace_id='qualification-workspace'"))[0].n,0);
 for(let n=0;n<20;n++){
 const start=performance.now();try{const response=await fetch(r.origin+'/api/search?q=Load%20sentinel&kind=page',{headers:{cookie},signal:AbortSignal.timeout(15000)});const body=await response.json();samples.push({ms:performance.now()-start,status:response.status,total:body.total});if(response.status!==200)break;}catch(error){samples.push({ms:performance.now()-start,error:String(error)});break;}
 }
 const times=samples.map(x=>x.ms).sort((a,b)=>a-b),p95=samples.length===20&&samples.every(x=>x.status===200)?times[Math.ceil(times.length*.95)-1]:null;
 const passed=samples.length===20&&samples.every(x=>x.status===200&&x.total===count-1)&&p95!==null&&p95<=500;
 await writeFile(r.directory+'/load.json',JSON.stringify({clauses:['SEARCH-001','SEARCH-008','FLAG-002'],id:'declared-page-capacity-search-p95',artifact:r.artifact.artifactHash,date:new Date().toISOString(),pages:count,containers,populations,indexed,rebuild,profile:'default AI off',targetP95Ms:500,p95,passed,samples,limits:'Metadata-only page capacity; does not establish simultaneous maximum block/record/activity dimensions or deployed capacity.'},null,2));console.log(r.directory,JSON.stringify({pages:count,p95,passed}));if(!passed)process.exitCode=1;
}finally{await browser?.close();await r?.close();}
