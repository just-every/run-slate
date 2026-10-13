import {signInBrowser} from '../../e2e/outbox-auth.mjs';
import assert from 'node:assert/strict';
/** Labelled identity fixture replaces mailbox possession; all subsequent interactions use the real UI. */
export async function actorFixture({runtime,browser,id,kind='member'}) {
 const now=new Date().toISOString();
 await runtime.sql(`INSERT INTO members(id,workspace_id,email,display_name,initials,role,member_kind,status,is_setup_owner,created_at,updated_at) VALUES('${id}','qualification-workspace','${id}@test.invalid','${id}','QA','member','${kind}','active',0,'${now}','${now}');`);
 const context=await browser.newContext({viewport:{width:390,height:900}}),page=await context.newPage();
 await signInBrowser(page,runtime.origin,id+'@test.invalid');await page.waitForLoadState('networkidle');
 assert.equal(new URL(page.url()).pathname,'/app');return {context,page,id};
}
