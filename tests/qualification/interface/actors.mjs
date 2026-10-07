import assert from 'node:assert/strict';
import {randomBytes,createHmac} from 'node:crypto';
/** Labelled identity fixture replaces mailbox possession; all subsequent interactions use the real UI. */
export async function actorFixture({runtime,browser,id,kind='member'}) {
 const token=randomBytes(32).toString('base64url'),digest=createHmac('sha256',runtime.sessionSecret).update(token).digest('hex');
 const now=new Date().toISOString(),expires=new Date(Date.now()+3600000).toISOString();
 await runtime.sql(`INSERT INTO members(id,workspace_id,email,display_name,initials,role,member_kind,status,is_setup_owner,created_at,updated_at) VALUES('${id}','qualification-workspace','${id}@test.invalid','${id}','QA','member','${kind}','active',0,'${now}','${now}'); INSERT INTO magic_links(id,email,token_digest,expires_at,created_at) VALUES('${id}-magic','${id}@test.invalid','${digest}','${expires}','${now}');`);
 const context=await browser.newContext({viewport:{width:390,height:900}}),page=await context.newPage();
 await page.goto(runtime.origin+'/api/auth/magic/accept?token='+token);await page.waitForLoadState('networkidle');
 assert.equal(new URL(page.url()).pathname,'/app');return {context,page,id};
}
