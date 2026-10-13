import { env } from 'cloudflare:test';
import { test,expect } from 'vitest';
import { searchFixture } from './route-fixture';

test('Indexed search uses current native authority for literal matches, totals, facets and cursors',async()=>{
 const f=await searchFixture(env.DB),{sql,page,find,now}=f;
 type Document={id:string;title:string;body:string;container:string;status:string|null};
 type Row={actor:string;name:string;query:string;visible:Document[];filters?:Record<string,string>;total?:number;facetsFrom?:Document[]};
 const documents:Document[]=[];
 const seed=async(id:string,title:string,body:string,options:Parameters<typeof page>[2]={})=>{
  await page(id,body,{...options,title});
  const document={id,title,body,container:options.container??'c',status:options.status??null};
  documents.push(document);return document;
 };
 const alpha=await seed('alpha','TitleUniquealpha','BodyUniqueCAFÉ phrase 😀 OR NEAR foo* -bar (baz) title:needle',{status:'review'});
 const beta=await seed('beta','TitleUniquebeta','BodyUniquebeta CAFÉ phrase',{status:'approved'});
 const parent=await seed('parent','ReadableParentTitle','ReadableParentBody');
 const draft=await seed('draft','PrivateDraftTitle','PrivateDraftBody',{parent:'parent',lifecycle:'draft'});
 const otherDraft=await seed('other-draft','MemberDraftTitle','MemberDraftBody',{parent:'parent',author:'reader',lifecycle:'draft'});
 const restricted=await seed('restricted','RestrictedChildTitle','RestrictedChildBody',{parent:'parent',restricted:true});
 for(const [id,owner]of [['personal','owner'],['member-personal','reader']]){
  await sql("INSERT INTO containers(id,workspace_id,name,visibility,created_at,updated_at,revision_id) VALUES(?,'w',?,'personal',?,?,'r')",id,id,now,now);
  await sql('INSERT INTO container_owners VALUES(?,?,?)',id,owner,now);
  await sql("INSERT INTO container_grants(id,container_id,principal_kind,principal_id,level,created_at,updated_at) VALUES(?,?,'member',?,'full',?,?)",id+'-grant',id,owner,now,now);
 }
 const personal=await seed('personal-child','PersonalTitle','PersonalBody',{container:'personal'});
 const otherPersonal=await seed('member-personal-child','MemberOnlyTitle','MemberOnlyBody',{container:'member-personal',author:'reader'});
 const pageOnly=await seed('page-only','PageOnlyTitle','PageOnlyBody',{restricted:true});
 await sql("INSERT INTO page_grants(id,page_id,principal_kind,principal_id,level,created_at,updated_at) VALUES('guest-page','page-only','member','page-guest','view',?,?)",now,now);
 // This guest has no container grant: its one readable page must not expose siblings.
 expect((await f.db.prepare("SELECT COUNT(*) AS n FROM container_grants WHERE principal_id='page-guest'").first<{n:number}>())?.n).toBe(0);
 const archived=await seed('archived','ArchiveTitle','ArchiveMarker',{lifecycle:'archived'});
 await sql("UPDATE pages SET archived_at=? WHERE id='archived'",now);
 const trashed=await seed('trashed','TrashTitle','TrashMarker');
 await sql("UPDATE pages SET trashed_at=? WHERE id='trashed'",now);
 const actors=['owner','reader','denied','guest','page-guest','expired','revoked','inactive','removed','anonymous'];
 const shared=['owner','reader','guest'];
 const cases:{name:string;document:Document;allowed:string[];filters?:Record<string,string>}[]=[
  {name:'shared alpha',document:alpha,allowed:shared},
  {name:'shared beta',document:beta,allowed:shared},
  {name:'readable parent',document:parent,allowed:shared},
  {name:'owner draft',document:draft,allowed:['owner']},
  {name:'another member draft',document:otherDraft,allowed:['reader']},
  {name:'restricted child under readable parent',document:restricted,allowed:[]},
  {name:'owner personal container',document:personal,allowed:['owner']},
  {name:'another member personal container',document:otherPersonal,allowed:['reader']},
  {name:'page-only guest grant',document:pageOnly,allowed:['page-guest']},
 ];
 for(const includeArchived of [false,true])for(const includeTrashed of [false,true]){
  const filters:Record<string,string>={};
  if(includeArchived)filters.includeArchived='true';
  if(includeTrashed)filters.includeTrashed='true';
  const combination=`archive=${includeArchived},trash=${includeTrashed}`;
  cases.push({name:`archived ${combination}`,document:archived,allowed:includeArchived?shared:[],filters});
  cases.push({name:`trashed ${combination}`,document:trashed,allowed:includeTrashed?shared:[],filters});
 }
 const rows:Row[]=cases.flatMap(({name,document,allowed,filters})=>
  actors.flatMap(actor=>[document.title,document.body].map(query=>({actor,name,query,filters,visible:allowed.includes(actor)?[document]:[]}))));
 // Combined matches prove exact totals and facet counts, including two statuses.
 for(const actor of actors)for(const query of ['TitleUnique','BodyUnique'])rows.push({actor,name:'combined matches',query,visible:shared.includes(actor)?[alpha,beta]:[]});
 const assertRow=async(row:Row)=>{
  const response=await find(row.query,row.actor,row.filters),label=`${row.actor}: ${row.name}: ${row.query}`;
  const sessionDenied=['anonymous','inactive','removed'].includes(row.actor);
  expect(response.status,label).toBe(sessionDenied?401:200);
  if(sessionDenied){
   for(const field of ['items','total','facets','nextCursor'])expect(response.data,label).not.toHaveProperty(field);
   for(const document of documents)for(const marker of [document.title,document.body])expect(JSON.stringify(response.data),label).not.toContain(marker);
   return;
  }
  expect(response.data.total,label).toBe(row.total??row.visible.length);
  expect(response.data.items.map((item:{id:string;title:string;snippet:string})=>({id:item.id,title:item.title,snippet:item.snippet})),label).toEqual(row.visible.map(document=>({id:document.id,title:document.title,snippet:document.body+'\n'})));
  const counted=row.facetsFrom??row.visible;
  const counts=(values:string[])=>Object.fromEntries([...new Set(values)].map(value=>[value,values.filter(v=>v===value).length]));
  expect(response.data.facets,label).toEqual({kind:counted.length?{page:counted.length}:{},container:counts(counted.map(d=>d.container)),status:counts(counted.flatMap(d=>d.status?[d.status]:[]))});
  // The route echoes the supplied query in filters; only retained result content
  // may disclose a seeded title/body. All other response fields are checked.
  const {filters:_,...disclosure}=response.data;
  for(const document of documents.filter(d=>!counted.includes(d)))for(const marker of [document.title,document.body])expect(JSON.stringify(disclosure),label).not.toContain(marker);
  if(!row.visible.length)expect(response.data,label).not.toHaveProperty('nextCursor');
  return response.data;
 };
 for(const row of rows)await assertRow(row);
 for(const query of ['CAFÉ','nique','"CAFÉ phrase"','😀','OR','NEAR','foo*','-bar','(baz)','title:needle','a','*','-','()','"','z'.repeat(1000),'a '.repeat(500)])expect((await find(query)).status).toBe(200);
 expect((await find('z'.repeat(1001))).status).toBe(400);
 const first=await assertRow({actor:'reader',name:'cursor before revocation',query:'TitleUnique',filters:{limit:'1'},visible:[alpha],total:2,facetsFrom:[alpha,beta]});
 expect(first.nextCursor).toBeTruthy();
 await sql("UPDATE container_grants SET revoked_at=? WHERE id='reader'",now);
 await assertRow({actor:'reader',name:'cursor after revocation',query:'TitleUnique',filters:{limit:'1',cursor:first.nextCursor},visible:[]});
 // Reader-dependent formulas remain matching after the underlying target grant changes.
 await sql("UPDATE container_grants SET revoked_at=NULL WHERE id='reader'");
 await page('database','Database');await sql("INSERT INTO databases(id,page_id,workspace_id,created_at,updated_at,revision_id) VALUES('db','database','w',?,?,'r')",now,now);
 const fields=[['amount','number',{}],['related','relation',{databaseId:'db'}],['sum','rollup',{relationField:'related',targetField:'amount',calculation:'sum'}],['computed','formula',{expression:{op:'concat',args:[{literal:'Computed'},{field:'sum'}]}}]];
 for(const [i,[id,type,config]]of fields.entries())await sql('INSERT INTO database_fields(id,database_id,name,field_type,config_json,position,created_at,updated_at,revision_id) VALUES(?,?,?,?,?,?,?,?,?)',id,'db',id,type,JSON.stringify(config),i,now,now,'r');
 await page('source','RecordSource',{kind:'record'});await page('target','RecordTarget',{kind:'record',restricted:true});
 for(const [id,values]of [['source',{related:['target']}],['target',{amount:731}]])await sql("INSERT INTO database_records(page_id,database_id,field_values_json,created_at,updated_at) VALUES(?,'db',?,?,?)",id,JSON.stringify(values),now,now);
 await sql("INSERT INTO page_grants(id,page_id,principal_kind,principal_id,level,created_at,updated_at) VALUES('target-owner','target','member','owner','full',?,?)",now,now);
 expect((await find('Computed731','owner')).data.total).toBe(1);expect((await find('Computed731')).data.total).toBe(0);
 expect((await find('Computed0')).data.items.some((r:any)=>r.id==='source')).toBe(true);
 // Generations are unique only within their member/trash scope. Even a shared
 // generation must preserve each reader's complete public search response.
 const collisionRows=[];
 for(const includeTrashed of [false,true])for(const [actor,query]of [['owner','Computed731'],['reader','Computed731'],['reader','Computed0']]){
  const filters:Record<string,string>={kind:'record',...(includeTrashed?{includeTrashed:'true'}:{})};
  collisionRows.push({actor,query,filters,expected:await find(query,actor,filters)});
 }
 const readerScope=JSON.stringify(['w','reader',false]);
 const generation=(await f.db.prepare('SELECT generation FROM search_record_cache WHERE scope=?').bind(readerScope).first<{generation:string}>())!.generation;
 for(const actor of ['owner','reader'])for(const includeTrashed of [false,true]){
  const scope=JSON.stringify(['w',actor,includeTrashed]);
  await f.db.batch([
   f.db.prepare('UPDATE search_record_text SET generation=? WHERE scope=?').bind(generation,scope),
   f.db.prepare('UPDATE search_record_cache SET generation=? WHERE scope=?').bind(generation,scope),
  ]);
 }
 for(const {actor,query,filters,expected}of collisionRows)expect(await find(query,actor,filters),`${actor}: ${query}: colliding member/trash scope`).toEqual(expected);
 await sql("INSERT INTO page_revisions(id,page_id,author_member_id,origin,content_hash,body_json,properties_json,created_at) VALUES('target-pub','target','owner','publish','h','[]',?,?)",JSON.stringify({title:'Published target',databaseFields:{amount:732}}),now);
 await sql("UPDATE pages SET published_revision_id='target-pub',lifecycle='live-with-unpublished-changes' WHERE id='target'");
 await sql("INSERT INTO page_grants(id,page_id,principal_kind,principal_id,level,created_at,updated_at) VALUES('target-reader','target','member','reader','view',?,?)",now,now);
 expect((await find('Computed732')).data.total).toBe(1);expect((await find('Computed731')).data.total).toBe(0);
 await sql("UPDATE page_grants SET revoked_at=? WHERE id='target-reader'",now);
 expect((await find('Computed732')).data.total).toBe(0);expect((await find('Computed0')).data.items.some((r:any)=>r.id==='source')).toBe(true);
 // Scalar records retain the complete public response through native value and
 // definition changes; changing to a relation must start filtering private IDs.
 await page('scalar-database','Scalar database');await page('scalar','Scalar body',{kind:'record',title:'Scalar title'});
 await sql("INSERT INTO databases(id,page_id,workspace_id,created_at,updated_at,revision_id) VALUES('scalar-db','scalar-database','w',?,?,'r')",now,now);
 await sql("INSERT INTO database_fields(id,database_id,name,field_type,config_json,position,created_at,updated_at,revision_id) VALUES('scalar-field','scalar-db','Value','multi-select','{}',0,?,?,'r')",now,now);
 await sql("INSERT INTO database_records(page_id,database_id,field_values_json,created_at,updated_at,revision_id) VALUES('scalar','scalar-db',?, ?,?,'r')",JSON.stringify({'scalar-field':['ScalarBefore']}),now,now);
 const beforeScalar=await find('ScalarBefore');expect(beforeScalar.status).toBe(200);expect(beforeScalar.data.total).toBe(1);
 expect(beforeScalar.data.items[0]).toMatchObject({id:'scalar',snippet:'Scalar body\n\nScalarBefore',title_fold:'scalar title',text_fold:'scalar body\n\nscalarbefore'});
 const editScalar=await f.mutate('/databases/scalar-db/records/scalar',{operationKey:'search-scalar-value',expectedRevisionId:'r',values:{'scalar-field':['target']}},'PATCH');
 expect(editScalar.status).toBe(200);expect((await find('ScalarBefore')).data.total).toBe(0);
 expect((await find('target','reader',{kind:'record'})).data.items.some((r:any)=>r.id==='scalar')).toBe(true);
 const relationField={id:'scalar-field',name:'Value',type:'relation',config:{databaseId:'db'},position:0};
 const relation=await f.mutate('/databases/scalar-db/fields',{operationKey:'search-scalar-relation',expectedRevisionId:'r',field:relationField});
 expect(relation.status).toBe(200);
 expect((await find('target','reader',{kind:'record'})).data.items.some((r:any)=>r.id==='scalar')).toBe(false);
 expect((await find('target','owner',{kind:'record'})).data.items.some((r:any)=>r.id==='scalar')).toBe(true);
 const scalar=await f.mutate('/databases/scalar-db/fields',{operationKey:'search-relation-scalar',expectedRevisionId:relation.data.receipt.revisionId,field:{...relationField,type:'multi-select',config:{}}});
 expect(scalar.status).toBe(200);
 expect((await find('target','reader',{kind:'record'})).data.items.some((r:any)=>r.id==='scalar')).toBe(true);
 await sql("INSERT INTO page_revisions(id,page_id,author_member_id,origin,content_hash,body_json,properties_json,created_at) VALUES('scalar-pub','scalar','owner','publish','h',?, ?,?)",JSON.stringify([{text:'Published scalar body'}]),JSON.stringify({title:'Published scalar title',databaseFields:{'scalar-field':['ScalarPublished']}}),now);
 await sql("UPDATE pages SET published_revision_id='scalar-pub',lifecycle='live-with-unpublished-changes' WHERE id='scalar'");
 const publishedScalar=await find('ScalarPublished');expect(publishedScalar.data.total).toBe(1);
 expect(publishedScalar.data.items[0]).toMatchObject({title:'Published scalar title',snippet:'Published scalar body\nScalarPublished',revisionId:'scalar-pub',title_fold:'published scalar title',text_fold:'published scalar body\nscalarpublished'});
 expect((await find('ScalarPublished','owner')).data.total).toBe(0);
 await sql("UPDATE container_grants SET revoked_at=? WHERE id='reader'",now);
 expect((await find('ScalarPublished')).data.total).toBe(0);
},90_000);
