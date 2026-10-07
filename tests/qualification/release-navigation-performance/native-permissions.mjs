import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {expect} from '@playwright/test';
import {actorFixture} from '../interface/actors.mjs';

export async function actorChecks({runtime, browser, context, page, parent, child, checks}) {
  const viewer = await actorFixture({runtime, browser, id: 'navigation-reader', kind: 'guest'});
  const tree = viewer.page.getByRole('navigation', {name: 'Pages', exact: true});
  try {
    assert.deepEqual((await (await viewer.context.request.get(runtime.origin+'/api/pages')).json()).items, []);
    assert.equal(await tree.getByRole('link', {name: 'Renamed navigation parent', exact: true}).count(), 0);
    const grantInput = {operationKey: randomUUID(), targetKind: 'page', targetId: parent, principalKind: 'member', principalId: viewer.id, level: 'view'};
    const grant = await context.request.post(runtime.origin+'/api/sharing', {data: grantInput});
    assert.equal(grant.status(), 200, await grant.text());
    const grantBody = await grant.json();
    await viewer.page.goto(runtime.origin+'/app/pages/'+parent);
    await viewer.page.getByRole('button', {name: 'Open navigation', exact: true}).click();
    await expect(tree.getByRole('button', {name: 'Expand Renamed navigation parent', exact: true})).toBeVisible();
    assert.equal(await tree.getByRole('link', {name: 'Navigation child', exact: true}).count(), 0);
    assert.equal((await (await viewer.context.request.get(runtime.origin+`/api/pages/${parent}/expansion`)).json()).expanded, false);
    checks.push('Second real actor gets its own empty tree and expansion preference, independent of the owner');
    const revoked = await context.request.post(runtime.origin+'/api/sharing', {data: {...grantInput, operationKey: randomUUID(), id: grantBody.value.id, revoke: true}});
    assert.equal(revoked.status(), 200, await revoked.text());
    await viewer.page.evaluate(() => window.dispatchEvent(new Event('slate:navigation-changed')));
    await expect(tree.getByRole('link', {name: 'Renamed navigation parent', exact: true})).toHaveCount(0);
    for (const pathname of ['/api/pages/'+parent, `/api/pages/${parent}/expansion`, '/api/pages/'+child]) {
      assert.equal((await viewer.context.request.get(runtime.origin+pathname)).status(), 404);
    }
    checks.push('Real grant revocation plus existing invalidation clears the tree; page and expansion reads are denied');
    // The same previously authenticated browser tab now changes actor and reloads the native route.
    await context.clearCookies();
    await context.addCookies(await viewer.context.cookies());
    await page.goto(runtime.origin+'/app');
    await page.waitForLoadState('networkidle');
    assert.equal(await page.getByRole('navigation', {name: 'Pages', exact: true}).getByRole('link').count(), 0);
    checks.push('Actor change in the existing browser tab cannot retain the former owner tree');
    const logout = await context.request.post(runtime.origin+'/api/auth/logout', {headers: {Origin: runtime.origin}});
    assert.equal(logout.status(), 204, await logout.text());
    await page.goto(runtime.origin+'/app');
    await page.waitForURL(url => url.pathname === '/signin');
    assert.equal((await context.request.get(runtime.origin+'/api/pages')).status(), 401);
    assert.equal(await page.locator('.page-tree').count(), 0);
    checks.push('Native logout clears session and redirects the existing tab without a cached private tree');
  } finally {await viewer.context.close();}
}
