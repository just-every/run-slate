import assert from 'node:assert/strict';
let devKey;
/** Each context exchanges the checkout key for a native one-click dev session. */
export const useDevKey = key => { devKey = key; };
export async function signIn(browser, appUrl, email, width=1440, inspect) {
  const context = await browser.newContext({viewport: {width, height: 900}});
  try {
    const origin = new URL(appUrl).origin;
    assert.equal((await context.request.post(origin + '/__dev/key', {data: {key: devKey}})).status(), 204);
    const page = await context.newPage();
    await page.goto(origin + '/auth/dev/enter?as=owner');
    const response = await context.request.get(origin + '/api/session');
    assert.equal(response.status(), 200);
    const session = await response.json();
    assert.equal(session.member.email, email);
    assert.equal(session.member.role, 'owner');
    assert.ok(session.member.id && session.member.workspaceId);
    await inspect?.(page, session.member);
    return session.member;
  } finally { await context.close(); }
}
