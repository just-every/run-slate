import {test} from 'node:test';import assert from 'node:assert/strict';
import {database} from './sqlite-harness.mts';
import {readContainer,containerIndex} from '../../../src/core/features/containers/queries.ts';
import {createContainer} from '../../../src/core/features/containers/service.ts';
import {createPage,updatePage} from '../../../src/core/features/pages/service.ts';
import {publishPublicPage} from '../../../src/core/features/publishing/service.ts';
import {createPublicPagesRoutes} from '../../../src/core/features/publishing/routes.ts';
import {Hono} from 'hono';import {ApiProblem} from '../../../src/core/app/problems.ts';
import type {FeatureContext} from '../../../src/core/app/feature-context.ts';
function fixture(){const f=database();f.sql.exec("INSERT INTO workspaces(id,name,mark,created_at,updated_at,revision_id) VALUES ('w','w','W','n','n','r'); INSERT INTO members(id,workspace_id,email,display_name,initials,role,created_at,updated_at) VALUES ('a','w','a@x.invalid','A','A','owner','n','n'),('b','w','b@x.invalid','B','B','member','n','n');");const ctx={db:f.db,now:new Date().toISOString(),actor:{id:'a',workspaceId:'w',workspaceName:'w',email:'a@x.invalid',displayName:'A',initials:'A',role:'owner'}} as FeatureContext;return{...f,ctx,reader:{...ctx,actor:{...ctx.actor,id:'b',role:'member' as const}}};}
const op=()=>crypto.randomUUID();
test('container metadata exposes authoritative policies/manage state and authorized archived index',async()=>{const f=fixture();try{
 const c=await createContainer(f.ctx,{operationKey:op(),name:'Team',description:'About',icon:'T',key:'TEAM'});const id=c.value.id;
 f.sql.prepare("UPDATE containers SET guest_access='forbidden',anonymous_access='forbidden' WHERE id=?").run(id);
 const owner=await readContainer(f.ctx,id);assert.equal(owner.description,'About');assert.equal(owner.guestAccess,'forbidden');assert.equal(owner.publicLinkAccess,'allowed');assert.equal(owner.anonymousAccess,'forbidden');assert.equal(owner.permissions.canManage,true);
 assert.equal((await readContainer(f.reader,id)).permissions.canManage,false);
 f.sql.prepare("UPDATE containers SET archived_at='archive' WHERE id=?").run(id);assert.equal((await containerIndex(f.ctx)).items.length,0);assert.equal((await containerIndex(f.ctx,true)).items[0].revisionId,c.value.revisionId);
 f.sql.exec("INSERT INTO containers(id,workspace_id,name,visibility,created_at,updated_at,revision_id) VALUES ('personal','w','Private name','personal','n','n','p'); INSERT INTO container_owners VALUES ('personal','b','n');");await assert.rejects(readContainer(f.ctx,'personal'),{status:404});assert.ok(!(await containerIndex(f.ctx)).items.some(c=>c.id==='personal'));
 f.sql.prepare("DELETE FROM container_grants WHERE container_id=? AND principal_kind='workspace'").run(id);await assert.rejects(readContainer(f.reader,id),{status:404});assert.equal((await containerIndex(f.reader,true)).items.length,0);
}finally{f.sql.close();}});
test('public header search/breadcrumbs/social metadata use only explicit published revisions and respect switches',async()=>{const f=fixture();try{
 const c=await createContainer(f.ctx,{operationKey:op(),name:'Team'});const page=async(title:string,parentPageId?:string)=>createPage(f.ctx,{operationKey:op(),containerId:c.value.id,title,parentPageId,lifecycle:'live'});
 const parent=await page('Public ancestor'),child=await page('Public child',parent.value.pageId),secret=await page('Needle private');
 const expose=async(p:any,slug:string,settings={})=>publishPublicPage(f.ctx,p.value.pageId,{operationKey:op(),expectedRevisionId:p.value.revisionId,host:'local.test',slug,...settings});
 await expose(parent,'ancestor');await expose(child,'child',{headerControls:['search','breadcrumbs','duplicate'],duplicateAsTemplate:true,socialPreview:{title:'Social <title>',description:'Description "quoted"'}});
 const app=new Hono();app.onError((e,c)=>e instanceof ApiProblem?c.json({code:e.code},e.status):c.json({error:e.message},500));app.route('/p',createPublicPagesRoutes());const get=async(path:string)=>{const r=await app.request(`https://local.test/p/${path}`,{}, {DB:f.db});assert.equal(r.status,200,await r.clone().text());return r.text();};
 let html=await get('child?q=Public');assert.match(html,/aria-label="Published ancestors"/);assert.match(html,/href="\/p\/ancestor"/);assert.match(html,/role="search"/);assert.match(html,/Duplicate this page/);assert.match(html,/og:title" content="Social &lt;title&gt;"/);assert.match(html,/Description &quot;quoted&quot;/);assert.doesNotMatch(html,/Needle private/);
 assert.match(await get('child?q=Needle'),/No published pages found/);
 f.sql.prepare('INSERT INTO workspace_policies VALUES (?,?,?)').run('w',JSON.stringify({'page.lifecycle.v1':'draft-then-publish'}),'n');await updatePage(f.ctx,parent.value.pageId,{operationKey:op(),expectedRevisionId:parent.value.revisionId,properties:{title:'Needle unpublished'}});html=await get('child?q=Needle');assert.doesNotMatch(html,/Needle unpublished/);assert.match(html,/Public ancestor/);
 f.sql.prepare("UPDATE public_exposures SET revoked_at='now' WHERE page_id=?").run(parent.value.pageId);html=await get('child');assert.doesNotMatch(html,/Public ancestor/);
 await expose(child,'child',{headerControls:[],duplicateAsTemplate:true});html=await get('child?q=Public');assert.doesNotMatch(html,/role="search"|Duplicate this page|Published ancestors|Search results/);
 await assert.rejects(expose(child,'child',{headerControls:['unknown']}),{code:'INVALID_HEADER_CONTROLS'});
}finally{f.sql.close();}});
