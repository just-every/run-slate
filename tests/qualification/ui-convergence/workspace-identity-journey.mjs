import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {expect} from '@playwright/test';
import {signInWithOutbox} from '../../e2e/outbox-auth.mjs';
import {accessible} from './browser-evidence.mjs';
import {call,ok} from './two-people-support.mjs';

/** Existing settings registrations own this identity flow; the phone shows its responsive proof. */
export async function workspaceIdentityJourney(state, width) {
  const {page,context,origin,api}=state;
  const name='Response team', mark='🌿';
  await page.goto(origin+'/app/settings?section=workspace',{waitUntil:'networkidle'});
  const before=await api('/api/workspace');
  await page.getByRole('button',{name:'Edit workspace & policies',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Workspace settings',exact:true});
  await dialog.getByRole('textbox',{name:'Name',exact:true}).fill(name);
  await dialog.getByRole('textbox',{name:'Mark',exact:true}).fill(mark);
  await accessible(page,'workspace identity settings edit');
  await dialog.getByRole('button',{name:'Save settings',exact:true}).click();
  await expect(dialog).toBeHidden();

  async function header(view, label) {
    if(width===390) {
      await expect(view.locator('.mobile-workspace-identity .brand-name')).toHaveText(name);
      await expect(view.locator('.mobile-workspace-identity .workspace-mark')).toHaveText(mark);
      await view.getByRole('button',{name:'Open navigation',exact:true}).click();
    }
    await expect(view.getByTestId('workspace-name')).toHaveText(name);
    await expect(view.getByTestId('workspace-mark')).toHaveText(mark);
    await expect(view.getByTestId('workspace-mark')).toBeVisible();
    await expect(view.locator('.sidebar-header .brand-mark svg')).toBeVisible();
    // The workspace and account menus expose navigation, never another workspace.
    await view.locator('.workrow').click();
    await expect(view.getByRole('button',{name:/^(Create|Add|New) workspace$/i})).toHaveCount(0);
    await expect(view.getByRole('link',{name:/^(Create|Add|New) workspace$/i})).toHaveCount(0);
    await view.locator('.workrow').click();
    await accessible(view,label);
    if(width===390)await view.getByRole('button',{name:'Close navigation',exact:true}).first().click();
  }

  const saved=await api('/api/workspace');
  assert.equal(saved.id,before.id);
  assert.equal(saved.name,name);
  assert.equal(saved.mark,mark);
  await header(page,'workspace identity saved owner header');
  // Existing phone registration is presentation proof; persistence and authority
  // assertions run once, in the desktop settings journey.
  if(width===390)return;
  await page.reload({waitUntil:'networkidle'});
  await header(page,'workspace identity reloaded owner header');
  // Reloaded Settings also reads back both saved controls, rather than relying on header state.
  await page.getByRole('button',{name:'Edit workspace & policies',exact:true}).click();
  await expect(dialog.getByRole('textbox',{name:'Name',exact:true})).toHaveValue(name);
  await expect(dialog.getByRole('textbox',{name:'Mark',exact:true})).toHaveValue(mark);
  await dialog.getByRole('button',{name:'Cancel',exact:true}).click();

  // Only the mailbox network edge is substituted. This is a newly issued native
  // member session, not a copy of the owner's or the existing reader session.
  const signedIn=await signInWithOutbox(origin,['reader','test.invalid'].join('@'));
  assert.notEqual(signedIn.cookie,state.readerCookie);
  const reader=await context.browser().newContext({viewport:page.viewportSize()});
  try {
    await reader.addCookies([{name:'slate_session',value:signedIn.cookie.split('=')[1],url:origin}]);
    const view=await reader.newPage();
    await view.goto(origin+'/app/settings?section=workspace',{waitUntil:'networkidle'});
    await expect(view.getByRole('button',{name:'Edit workspace & policies',exact:true})).toHaveCount(0);
    await header(view,'workspace identity fresh member header');
    const retained=await ok(reader,origin,'GET','/api/workspace');
    assert.deepEqual(retained,saved);
    const denied=await call(reader,origin,'PUT','/api/workspace',{
      operationKey:randomUUID(),expectedRevisionId:saved.revisionId,
      name:'Unauthorized workspace',mark:'X',description:saved.description,
      guestAccess:saved.guestAccess,publicLinkAccess:saved.publicLinkAccess,
      anonymousAccess:saved.anonymousAccess,policies:saved.policies,
    });
    assert.equal(denied.status,403);
    assert.deepEqual(await api('/api/workspace'),saved,'Refused member editing preserves both identity values.');
    const setup=await view.goto(origin+'/setup',{waitUntil:'networkidle'});
    assert.equal(setup.status(),200);
    await expect(view).toHaveURL(origin+'/app');
    await expect(view.getByRole('heading',{name:'Name this workspace',exact:true})).toHaveCount(0);
  } finally {await reader.close();}
  console.log(`PROBE WORK-001 acceptance-1: Settings name/mark -> persisted ${name} ${mark}, owner reload and fresh member headers at ${width}px; member write refused unchanged`);
}
