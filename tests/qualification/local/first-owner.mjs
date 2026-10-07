import assert from 'node:assert/strict';
import {randomBytes,createHmac} from 'node:crypto';
/** Explicit identity fixture substitutes mailbox possession only; wizard remains real product UI. */
export async function fixtureFirstOwner(runtime,context){
 const token=randomBytes(32).toString('base64url'),digest=createHmac('sha256',runtime.sessionSecret).update(token).digest('hex');
 const now=new Date().toISOString(),expires=new Date(Date.now()+3600000).toISOString();
 await runtime.sql(`INSERT INTO workspaces(id,name,mark,created_at,updated_at,revision_id) VALUES('qualification-workspace','Fixture pre-wizard','', '${now}','${now}','fixture-revision'); INSERT INTO members(id,workspace_id,email,display_name,initials,role,member_kind,status,is_setup_owner,created_at,updated_at) VALUES('qualification-owner','qualification-workspace','qualification-owner@test.invalid','Qualification owner','QO','owner','member','active',1,'${now}','${now}'); INSERT INTO magic_links(id,email,token_digest,expires_at,created_at) VALUES('qualification-magic','qualification-owner@test.invalid','${digest}','${expires}','${now}');`);
 const page=await context.newPage();await page.goto(runtime.origin+'/api/auth/magic/accept?token='+token);
 await page.getByRole('heading',{name:'Name this workspace',exact:true}).waitFor();
 await page.getByLabel('Workspace name',{exact:true}).fill('Qualification workspace');await page.getByRole('button',{name:'Continue',exact:true}).click();
 await page.getByPlaceholder('Customer Success').fill('Qualification container');await page.getByLabel('First page title').fill('Qualification first page');await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByRole('button',{name:'Skip this step'}).click();
 await page.waitForLoadState('networkidle');
 const [counts]=await runtime.sql(`SELECT (SELECT count(*) FROM workspaces) AS workspaces,(SELECT count(*) FROM containers WHERE visibility != 'personal') AS containers,(SELECT count(*) FROM pages) AS pages,(SELECT count(*) FROM members) AS members;`);
 assert.deepEqual(counts.results[0],{workspaces:1,containers:1,pages:1,members:1});
 return {page,workspaceId:'qualification-workspace',memberId:'qualification-owner',limits:'Identity fixture replaces mailbox possession; no provider delivery or empty-database bootstrap acceptance.'};
}
