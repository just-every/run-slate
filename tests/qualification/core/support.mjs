import {signInWithOutbox} from '../../e2e/outbox-auth.mjs';
import {randomUUID} from 'node:crypto';
export const q=value=>`'${String(value).replaceAll("'","''")}'`;
export const op=()=>randomUUID();
export async function rows(r,sql){return (await r.sql(sql))[0].results;}
export async function actor(r,id,{role='member',kind='member',expired=false,revoked=false}={}){
 const now=new Date().toISOString();
 await r.sql(`INSERT INTO members(id,workspace_id,email,display_name,initials,role,member_kind,status,created_at,updated_at) VALUES(${q(id)},'qualification-workspace',${q(id+'@test.invalid')},${q(id)},'QA',${q(role)},${q(kind)},'active',${q(now)},${q(now)});`);
 const {cookie}=await signInWithOutbox(r.origin,id+'@test.invalid');
 if(expired||revoked) await r.sql(`UPDATE sessions SET ${expired?"expires_at='2000-01-01T00:00:00Z'":"revoked_at="+q(now)} WHERE member_id=${q(id)}`);
 return cookie;
}
export async function api(r,path,cookie,body,method=body?'POST':'GET'){
 const start=performance.now(),res=await fetch(r.origin+path,{method,redirect:'manual',headers:{...(cookie?{cookie}:{}),...(body?{'content-type':'application/json',origin:r.origin}: {})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});const text=await res.text();let data;try{data=JSON.parse(text);}catch{data=text;}return {status:res.status,data,headers:res.headers,ms:performance.now()-start};
}
export async function pageFixture(r,id,{title=id,body='qualification searchable phrase',restricted=false,lifecycle='live',owner='qualification-owner'}={}){
 const now=new Date().toISOString(),container=(await rows(r,"SELECT id FROM containers WHERE visibility='default' LIMIT 1"))[0].id;
 await r.sql(`INSERT INTO pages(id,workspace_id,container_id,title,author_member_id,owner_member_id,lifecycle,working_revision_id,published_revision_id,created_at,updated_at,revision_id,access_inheritance,archived_at,trashed_at) VALUES(${q(id)},'qualification-workspace',${q(container)},${q(title)},'qualification-owner',${q(owner)},${q(lifecycle)},${q(id+'-revision')},${q(id+'-revision')},${q(now)},${q(now)},${q(id+'-revision')},${q(restricted?'restricted':'inherit')},${lifecycle==='archived'?q(now):'NULL'},${lifecycle==='trashed'?q(now):'NULL'}); INSERT INTO page_blocks(id,page_id,block_type,content_json,tree_position,revision_id,created_at,updated_at) VALUES(${q(id+'-block')},${q(id)},'paragraph',${q(JSON.stringify({text:[{text:body}]}))},'a',${q(id+'-block-revision')},${q(now)},${q(now)}); INSERT INTO page_revisions(id,page_id,author_member_id,origin,content_hash,body_json,properties_json,created_at) VALUES(${q(id+'-revision')},${q(id)},'qualification-owner','publish',${q(id+'-hash')},'[]',${q(JSON.stringify({title}))},${q(now)}); INSERT INTO page_grants(id,page_id,principal_kind,principal_id,level,created_at,updated_at) VALUES(${q(id+'-owner-grant')},${q(id)},'member','qualification-owner','full',${q(now)},${q(now)});`);return container;
}
