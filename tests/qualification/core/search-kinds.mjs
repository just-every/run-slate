import assert from 'node:assert/strict';
import {api,op,q,pageFixture} from './support.mjs';
export async function searchKinds({r,owner,reader,container,check}){
 await check(['SEARCH-001','SEARCH-002','SEARCH-003'],'all-five-search-kinds-use-retained-readable-content',async()=>{
 const now=new Date().toISOString();
 await pageFixture(r,'search-db',{title:'Search records database'});await pageFixture(r,'search-record',{title:'Search record'});
 await r.sql(`INSERT INTO databases(id,page_id,workspace_id,created_at,updated_at,revision_id) VALUES('search-database','search-db','qualification-workspace',${q(now)},${q(now)},'search-database-revision'); UPDATE pages SET page_kind='record',database_id='search-database' WHERE id='search-record'; INSERT INTO database_fields(id,database_id,name,field_type,config_json,position,created_at,updated_at,revision_id) VALUES('search-field','search-database','Details','text','{}',0,${q(now)},${q(now)},'search-field-revision'); INSERT INTO database_records(page_id,database_id,field_values_json,created_at,updated_at,revision_id) VALUES('search-record','search-database','{"search-field":"retained field sentinel"}',${q(now)},${q(now)},'search-record-revision'); INSERT INTO knowledge_templates(id,workspace_id,container_id,title,description,category,snapshot_json,created_at,updated_at,revision_id) VALUES('search-template','qualification-workspace',${q(container)},'Template sentinel','Retained template description','test','{}',${q(now)},${q(now)},'search-template-revision');`);
 const comment=await api(r,'/api/comments/page/discover-one',owner,{operationKey:op(),body:[{text:'Retained comment sentinel'}]});assert.equal(comment.status,200,JSON.stringify(comment.data));
 for(const [kind,query] of [['page','Freshness sentinel'],['record','retained field sentinel'],['container','Qualification container'],['template','Template sentinel'],['comment-thread','Retained comment sentinel']]){
 const response=await api(r,'/api/search?kind='+kind+'&q='+encodeURIComponent(query),reader);assert.equal(response.status,200);assert.equal(response.data.total,1,JSON.stringify({kind,body:response.data}));assert.equal(response.data.items[0].kind,kind);assert.ok(response.data.items[0].href.startsWith('/app/'));
 }
 });
}
