import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { expect } from '@playwright/test';
import { inbox, newOutboxLink } from '../../e2e/outbox-auth.mjs';
import { root } from '../../e2e/runtime-harness.mjs';
import { accessible } from './browser-evidence.mjs';

/** ADMIN-001: real SP/IdP POST binding, DNS ownership and email enforcement. */
export async function samlJourney(state) {
  const { page, context, origin, samlFixture, fixtureSql, setSamlDns, setSamlAssertion, installSamlIdp, readSamlRequests } = state;
  assert.ok(samlFixture, 'The SAML journey requires its network edge fixture');
  const width = page.viewportSize().width;
  const evidence = process.env.SLATE_SAML_EVIDENCE_DIR ?? path.join(root, 'evidence/saml');
  await mkdir(evidence, { recursive: true });
  const domain = samlFixture.emailDomain;
  const jitEmail = `synthetic-slate-603@${domain}`, memberEmail = `synthetic-slate-605@${domain}`;
  const otherOwnerEmail = `synthetic-slate-606@${domain}`, guestEmail = 'synthetic-slate-607@test.invalid';
  const now = new Date().toISOString();
  // Identity-only records, exactly as the harness's initial owner and reader.
  await fixtureSql([
    `UPDATE members SET email='${memberEmail}' WHERE id='browser-reader'`,
    `INSERT INTO members(id,workspace_id,email,display_name,initials,role,member_kind,status,is_setup_owner,created_at,updated_at) VALUES('synthetic-slate-606','browser-workspace','${otherOwnerEmail}','Casey Owner','CO','owner','member','active',0,'${now}','${now}')`,
    `INSERT INTO members(id,workspace_id,email,display_name,initials,role,member_kind,status,is_setup_owner,created_at,updated_at) VALUES('synthetic-slate-607','browser-workspace','${guestEmail}','Taylor Guest','TG','member','guest','active',0,'${now}','${now}')`,
  ]);
  const browserErrors = [], consoleErrors = [];
  const authContext = await context.browser().newContext({ viewport: page.viewportSize(), locale: 'en-US' });
  await installSamlIdp(authContext);
  const auth = await authContext.newPage();
  auth.on('pageerror', cause => browserErrors.push(String(cause)));
  auth.on('console', message => { if (message.type() === 'error') consoleErrors.push({text:message.text(), path:new URL(auth.url()).pathname}); });
  const shot = async (view, label, focus) => {
    if (focus) await focus.scrollIntoViewIfNeeded();
    await accessible(view, `SAML ${label}`, { fullPage: false });
    await view.screenshot({ path: path.join(evidence, `saml-${width}-${label}.png`), fullPage: false });
  };
  const anonymous = async () => { await auth.goto('about:blank'); await authContext.clearCookies(); };
  const session = () => authContext.request.get(origin + '/api/session');
  const noSession = async label => {
    assert.equal((await session()).status(), 401, `${label} must not issue an authenticated session`);
    assert.ok(!(await authContext.cookies(origin)).some(cookie => cookie.name === 'slate_session'), `${label} must not set a session cookie`);
  };
  const mutation = async (route, method, action) => {
    const pending = page.waitForResponse(response => new URL(response.url()).pathname === route && response.request().method() === method);
    await action();
    const response = await pending;
    assert.equal(response.status(), 200, await response.text());
    return response.json();
  };
  const settings = () => page.goto(origin + '/app/settings?section=saml', { waitUntil: 'networkidle' });
  const save = () => mutation('/api/auth/saml', 'PUT', () => page.getByRole('button', { name: 'Save SAML settings', exact: true }).click());
  const requestMagic = async email => {
    const before = await inbox(origin);
    const response = await fetch(origin + '/api/auth/magic', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ email, requestKey: randomUUID() }) });
    assert.equal(response.status, 200);
    return newOutboxLink(origin, before);
  };
  const confirm = async link => {
    await auth.goto(link, { waitUntil: 'networkidle' });
    const pending = auth.waitForResponse(response => new URL(response.url()).pathname === '/auth/confirm' && response.request().method() === 'POST');
    await auth.getByRole('button', { name: 'Confirm', exact: true }).click();
    return pending;
  };
  const samlSignIn = async ({ email, variant = 'valid', initiated = 'sp', expected = 303, label }) => {
    await anonymous();
    await setSamlAssertion({ email, variant });
    if (initiated === 'sp') {
      await auth.goto(origin + '/signin', { waitUntil: 'networkidle' });
      if (label === 'unsigned-refused') await shot(auth, 'sign-in-methods');
      await auth.getByRole('button', { name: 'Continue with SAML', exact: true }).click();
    } else await auth.goto(samlFixture.ssoUrl, { waitUntil: 'networkidle' });
    await expect(auth.getByRole('heading', { name: 'Identity verified by the test IdP', exact: true })).toBeVisible();
    const pending = auth.waitForResponse(response => new URL(response.url()).pathname === '/auth/saml/acs' && response.request().method() === 'POST');
    await auth.getByRole('button', { name: 'Continue to Slate', exact: true }).click();
    const response = await pending;
    assert.equal(response.status(), expected, response.status() === expected ? undefined : await response.text());
    if (expected === 303) {
      await auth.waitForURL(url => url.origin === origin && url.pathname === '/app');
      const current = await session();
      assert.equal(current.status(), 200);
      const identity = (await current.json()).member;
      assert.equal(identity.email, email);
      await expect(auth.getByTestId('member-name')).toHaveText(identity.displayName);
    } else await noSession(label);
    await shot(auth, label);
  };

  try {
    const oldMemberLink = await requestMagic(memberEmail);
    const oldOtherOwnerLink = await requestMagic(otherOwnerEmail);
    await settings();
    await expect(page.getByRole('heading', { name: 'SAML single sign-on', exact: true })).toBeVisible();
    await page.getByLabel('Identity provider issuer', { exact: true }).fill(samlFixture.idpEntityId);
    await page.getByLabel('Single sign-on URL', { exact: true }).fill(samlFixture.ssoUrl);
    await page.getByLabel('Signing certificate', { exact: true }).fill(samlFixture.certificate);
    await page.getByLabel('Email domain', { exact: true }).fill(domain);
    await page.getByLabel('Allowed email addresses', { exact: true }).fill(jitEmail);
    await page.getByLabel('Emergency access owner', { exact: true }).selectOption('browser-owner');
    await page.getByLabel('Enable SAML', { exact: true }).check();
    await save();
    await shot(page, 'identity-provider-settings', page.getByLabel('Identity provider issuer', { exact: true }));
    await expect(page.getByLabel('Require SAML for members', { exact: true })).toBeDisabled();
    await shot(page, 'configured-pending-domain', page.getByRole('heading', { name: 'Domain verification', exact: true }));
    await samlSignIn({ email: jitEmail, initiated: 'idp', expected: 503, label: 'unverified-domain-refused' });
    const membersBefore = await state.api('/api/members');
    assert.ok(!JSON.stringify(membersBefore).includes(jitEmail), 'Unverified domain must not JIT-create a member');
    const name = await page.getByLabel('TXT name', { exact: true }).inputValue();
    const value = await page.getByLabel('TXT value', { exact: true }).inputValue();
    assert.equal(name, '_slate-saml.' + domain);
    assert.ok(value.startsWith('slate-saml-verification='));
    await setSamlDns({ name, value, published: true });
    await mutation('/api/auth/saml/verify-domain', 'POST', () => page.getByRole('button', { name: 'Check domain', exact: true }).click());
    await expect(page.getByText('Verified', { exact: true })).toBeVisible();
    await shot(page, 'domain-verified', page.getByRole('heading', { name: 'Domain verification', exact: true }));
    const metadata = await context.request.get(origin + '/auth/saml/metadata');
    assert.equal(metadata.status(), 200);
    assert.ok((await metadata.text()).includes(origin + '/auth/saml/acs'));

    for (const variant of ['unsigned', 'wrong-signature', 'wrong-audience']) {
      await samlSignIn({ email: jitEmail, variant, initiated: 'sp', expected: 400, label: variant + '-refused' });
      assert.ok(!JSON.stringify(await state.api('/api/members')).includes(jitEmail), `${variant} must not create a member`);
    }
    await samlSignIn({ email: jitEmail, initiated: 'sp', label: 'sp-initiated-member' });
    await samlSignIn({ email: jitEmail, initiated: 'idp', label: 'idp-initiated-member' });

    await page.getByLabel('Require SAML for members', { exact: true }).check();
    await save();
    await expect(page.getByText('Members must use SAML.', { exact: false })).toBeVisible();
    await shot(page, 'saml-required', page.getByLabel('Require SAML for members', { exact: true }));
    // Previously issued native proofs are fenced at consumption, too.
    for (const [email, link] of [[memberEmail, oldMemberLink], [otherOwnerEmail, oldOtherOwnerLink]]) {
      await anonymous();
      const response = await confirm(link);
      assert.ok(response.status() >= 400, `${email}: an old email proof must be refused after enforcement`);
      await noSession('Pre-enforcement email link');
    }
    for (const email of [memberEmail, otherOwnerEmail]) {
      await anonymous();
      const before = await inbox(origin);
      await auth.goto(origin + '/signin', { waitUntil: 'networkidle' });
      await auth.getByLabel('Email address', { exact: true }).fill(email);
      const pending = auth.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/magic' && response.request().method() === 'POST');
      await auth.getByRole('button', { name: 'Email me a sign-in link', exact: true }).click();
      assert.equal((await pending).status(), 200, 'Magic requests do not expose membership or owner status');
      await noSession('Enforced email sign-in');
      assert.equal((await inbox(origin)).length, before.length, 'Only the designated owner and guests receive email links');
      await shot(auth, email === memberEmail ? 'member-email-refused' : 'other-owner-email-refused');
    }
    await samlSignIn({ email: memberEmail, label: 'enforced-member-sso' });
    for (const [email, label] of [[guestEmail, 'guest-email-sign-in'], ['owner@test.invalid', 'designated-owner-break-glass']]) {
      await anonymous();
      const response = await confirm(await requestMagic(email));
      assert.equal(response.status(), 303);
      await auth.waitForURL(url => url.origin === origin && url.pathname === '/app');
      const current = await session();
      assert.equal(current.status(), 200);
      assert.equal((await current.json()).member.email, email);
      await shot(auth, label);
    }
    const edge = await readSamlRequests();
    assert.ok(edge.some(item => item.kind === 'dns' && item.published));
    assert.ok(edge.some(item => item.kind === 'idp' && item.initiated === 'sp' && item.requestId));
    assert.ok(edge.some(item => item.kind === 'idp' && item.initiated === 'idp' && item.requestId === null));
    assert.deepEqual(browserErrors, [], 'SAML journeys must not raise uncaught browser errors');
    // Chromium reports deliberate refused document responses as resource errors.
    // Their exact HTTP statuses and absence of a session are asserted above; all
    // other console errors, including script failures, still fail this journey.
    assert.deepEqual(consoleErrors.filter(item => !(item.path === '/auth/saml/acs' && /^Failed to load resource:.*status of (400|503) /.test(item.text)) && !(item.path === '/auth/confirm' && /^Failed to load resource:.*status of 403 /.test(item.text))), [], 'No unexpected SAML console errors');
    state.assertNoConsoleErrors();
  } finally {
    await authContext.close();
  }
}
