import assert from 'node:assert/strict';
import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
let devKey;
/** The checkout's .rer/local dev key; each browser context trades it for the outbox gate cookie, as RER_OPEN does. */
export const useDevKey = key => { devKey = key; };
export async function signIn(browser, appUrl, email, width=1440, inspect) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  try {
    assert.equal((await context.request.post(new URL('/__dev/key', appUrl).href, { data: { key: devKey } })).status(), 204);
    const page = await context.newPage();
    await page.goto(appUrl);
    const link = page.getByRole('link', { name: 'Open this link', exact: true });
    const href = await link.getAttribute('href');
    assert.equal(new URL(href).pathname, '/auth/confirm', 'outbox uses native magic link');
    await page.route('**/*', route => route.request().resourceType() === 'script' ? route.abort() : route.continue());
    await link.click();
    const scanPage = await context.newPage();
    try {
      await scanPage.goto(href);
      const result = await new AxeBuilder({page:scanPage}).analyze();
      assert.deepEqual(result.violations.filter(v => ['serious','critical'].includes(v.impact)), []);
      const captures = new URL('../../.artifacts/local-journey/', import.meta.url);
      await mkdir(captures, {recursive:true});
      await scanPage.screenshot({path:fileURLToPath(new URL(`confirmation-${width}.png`,captures)),fullPage:true});
      await scanPage.goto(new URL('/api/auth/magic/accept',href).href);
      const retired = await new AxeBuilder({page:scanPage}).analyze();
      assert.deepEqual(retired.violations.filter(v => ['serious','critical'].includes(v.impact)), []);
      await scanPage.screenshot({path:fileURLToPath(new URL(`retired-link-${width}.png`,captures)),fullPage:true});
      console.log(JSON.stringify({identityPages:{width,confirmationSeriousCritical:0,retiredSeriousCritical:0}}));
    } finally { await scanPage.close(); }
    await page.getByRole('button', {name:'Confirm',exact:true}).click();
    await page.unroute('**/*');
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    const session = await page.evaluate(async () => { const r = await fetch('/api/session'); return { status: r.status, body: await r.json() }; });
    assert.equal(session.status, 200);
    assert.equal(session.body.member.email, email);
    assert.equal(session.body.member.role, 'owner');
    assert.ok(session.body.member.id && session.body.member.workspaceId);
    const replay = await page.request.get(href);
    assert.ok(replay.status() >= 400, 'native magic link is one-use');
    await inspect?.(page, session.body.member);
    return session.body.member;
  } catch (error) {
    throw new Error(error.message.replace(/([?&]token=)[^\s"'<>]+/g, '$1[redacted]'));
  } finally { await context.close(); }
}
