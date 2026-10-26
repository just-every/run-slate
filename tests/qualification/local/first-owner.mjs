import assert from 'node:assert/strict';
import {signInBrowser} from '../../e2e/outbox-auth.mjs';
/** Explicit identity fixture substitutes mailbox possession only; wizard remains real product UI. */
export async function fixtureFirstOwner(runtime,context){
 const now=new Date().toISOString();
 await runtime.sql(`INSERT INTO workspaces(id,name,mark,created_at,updated_at,revision_id) VALUES('qualification-workspace','Fixture pre-wizard','', '${now}','${now}','fixture-revision'); INSERT INTO members(id,workspace_id,email,display_name,initials,role,member_kind,status,is_setup_owner,created_at,updated_at) VALUES('qualification-owner','qualification-workspace','qualification-owner@test.invalid','Qualification owner','QO','owner','member','active',1,'${now}','${now}');`);
 const page=await context.newPage();await signInBrowser(page,runtime.origin,'qualification-owner@test.invalid');
 await page.getByRole('heading',{name:'Name this workspace',exact:true}).waitFor();
 await page.getByLabel('Your name',{exact:true}).fill('Qualification Owner');
 await page.getByLabel('Workspace name',{exact:true}).fill('Qualification workspace');await page.getByRole('button',{name:'Continue',exact:true}).click();
 await page.getByRole('textbox',{name:'Space name',exact:true}).fill('Qualification container');await page.getByLabel('First page title').fill('Qualification first page');await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByRole('button',{name:'Skip this step'}).click();
 await page.waitForLoadState('networkidle');
 const [counts]=await runtime.sql(`SELECT (SELECT count(*) FROM workspaces) AS workspaces,(SELECT count(*) FROM containers WHERE visibility != 'personal') AS containers,(SELECT count(*) FROM pages) AS pages,(SELECT count(*) FROM members) AS members;`);
 assert.deepEqual(counts.results[0],{workspaces:1,containers:1,pages:1,members:1});
 return {page,workspaceId:'qualification-workspace',memberId:'qualification-owner',limits:'Identity records are test fixtures; native form and development outbox prove mailbox possession without provider delivery.'};
}
