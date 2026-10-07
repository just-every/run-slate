import assert from 'node:assert/strict';
import {createHmac,randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {snapshot,retained} from './custody.mjs';
async function session(runtime){
 const token=randomBytes(32).toString('base64url'),digest=createHmac('sha256',runtime.sessionSecret).update(token).digest('hex');
 await runtime.sql(`INSERT INTO sessions(id,member_id,token_digest,created_at,updated_at,expires_at) VALUES('${token}','qualification-owner','${digest}','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z','2099-01-01T00:00:00.000Z');`);
 return 'slate_session='+token;
}
export async function restoreOwner(runtime,archive,before){
 await runtime.sql("INSERT INTO workspaces(id,name,mark,created_at,updated_at,revision_id) VALUES('qualification-workspace','Empty restore target','','2026-01-01','2026-01-01','empty'); INSERT INTO members(id,workspace_id,email,display_name,initials,role,member_kind,status,is_setup_owner,created_at,updated_at) VALUES('qualification-owner','qualification-workspace','qualification-owner@test.invalid','Qualification owner','QO','owner','member','active',1,'2026-01-01','2026-01-01');");
 const cookie=await session(runtime),body=new FormData();body.set('file',new Blob([await readFile(archive)],{type:'application/zip'}),'owner-archive.zip');
 const response=await fetch(runtime.origin+'/api/exports/restore',{method:'POST',headers:{cookie,origin:runtime.origin},body});const receipt=await response.json();assert.equal(response.status,200,JSON.stringify(receipt));assert.equal(receipt.state,'completed');
 const columns={...before.columns};delete columns.d1_migrations;
 const restored=await snapshot(runtime,columns);const expected={...before,tables:{...before.tables}};delete expected.tables.d1_migrations;expected.tables.workspaces=expected.tables.workspaces.map(row=>({...row,ai_enabled:0}));retained(expected,restored);
 const migrations=(await runtime.sql('SELECT name FROM d1_migrations ORDER BY name'))[0].results.map(r=>r.name);assert.deepEqual(migrations,before.tables.d1_migrations.map(r=>r.name).sort());
 return {cookie:await session(runtime),receipt,restored,migrations};
}
