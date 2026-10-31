import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';
import { inbox, newOutboxLink } from '../../e2e/outbox-auth.mjs';
import { accessible } from './browser-evidence.mjs';
import { call, ok } from './two-people-support.mjs';

const switches = ['guestAccess', 'publicLinkAccess', 'anonymousAccess'];
const allowed = Object.fromEntries(switches.map(name => [name, 'allowed']));

/** Populated native grants and real readers survive presentation-only profile changes. */
export async function containerAccessProfileJourney(state, width) {
  const { page, context, origin, api } = state;
  const post = (route, data) => ok(context, origin, 'POST', route, { operationKey: randomUUID(), ...data });
  const space = (await post('/api/containers', { name: 'Profile response guides', visibility: 'private' })).value.id;
  const pageId = (await post('/api/pages', { containerId: space, title: 'Profile response checklist' })).value.pageId;
  const excluded = (await post('/api/containers', { name: 'Unrelated private profile space', visibility: 'private' })).value.id;
  const excludedPage = (await post('/api/pages', { containerId: excluded, title: 'Unrelated private profile plan' })).value.pageId;
  const group = (await post('/api/groups', { name: 'Profile response team', memberIds: ['browser-reader'] })).value.id;
  for (const [principalKind, principalId, level] of [['member', 'browser-reader', 'comment'], ['group', group, 'edit']]) {
    await post('/api/sharing', { targetKind: 'container', targetId: space, principalKind, principalId, level });
  }
  const members = await api('/api/members');
  const beforeMail = await inbox(origin);
  await post('/api/invitations', { email: [`synthetic-slate-profile-${width}`, 'test.invalid'].join('@'), kind: 'guest', containerId: space, level: 'view' });
  const invitation = new URL(await newOutboxLink(origin, beforeMail));
  const guest = await context.browser().newContext({ viewport: page.viewportSize() });
  const reader = await context.browser().newContext({ viewport: page.viewportSize() });
  const anonymous = await context.browser().newContext({ viewport: page.viewportSize() });
  try {
    const accepted = await guest.request.post(origin + '/api/auth/invitation/accept', { headers: { origin }, form: { token: invitation.searchParams.get('token') }, maxRedirects: 0 });
    assert.equal(accepted.status(), 303);
    const guestMember = await ok(guest, origin, 'GET', '/api/members/current');
    assert.equal(guestMember.memberKind, 'guest');
    await reader.addCookies([{ name: 'slate_session', value: state.readerCookie.split('=')[1], url: origin }]);
    assert.deepEqual(await api('/api/members'), members, 'The guest is not a workspace member.');
    const slug = `profile-${randomUUID()}`;
    await post(`/api/publishing/${pageId}`, { expectedRevisionId: (await api(`/api/pages/${pageId}`)).page.revisionId, host: new URL(origin).host, slug, theme: 'light' });
    const publicPath = `/p/${slug}`;
    const openSpace = async () => {
      await page.goto(`${origin}/app/containers/${space}`, { waitUntil: 'networkidle' });
      await page.getByRole('navigation', { name: 'Space navigation', exact: true }).getByRole('button', { name: 'Settings', exact: true }).click();
      await expect(page.getByRole('region', { name: 'Space settings', exact: true })).toBeVisible();
    };
    const settings = page.getByRole('region', { name: 'Space settings', exact: true });
    const grants = settings.getByRole('region', { name: 'Space grants', exact: true });
    const currentProfile = async () => (await api('/api/workspace')).policies['container.access.v1'];
    const saveSwitches = async values => {
      const profile = await currentProfile();
      await settings.getByRole('button', { name: profile === 'class-led' ? 'Visibility & public access' : 'External access', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Space access', exact: true });
      assert.equal(await dialog.locator('select[name=visibility]').count(), profile === 'class-led' ? 1 : 0);
      for (const name of switches) {
        await expect(dialog.locator(`select[name=${name}]`)).toBeVisible();
        await dialog.locator(`select[name=${name}]`).selectOption(values[name]);
      }
      await dialog.getByRole('button', { name: 'Save settings', exact: true }).click();
      await expect(dialog).toHaveCount(0);
      const stored = await api(`/api/containers/${space}`);
      for (const name of switches) assert.equal(stored[name], values[name]);
      return stored;
    };
    const access = async values => {
      const guestExpected = values.guestAccess === 'allowed' ? 200 : 404;
      assert.equal((await call(guest, origin, 'GET', `/api/containers/${space}`)).status, guestExpected);
      const guestPage = await call(guest, origin, 'GET', `/api/pages/${pageId}`);
      assert.equal(guestPage.status, guestExpected);
      if (guestExpected === 200) {
        assert.equal(guestPage.body.page.title, 'Profile response checklist');
        assert.equal((await call(guest, origin, 'PATCH', `/api/pages/${pageId}`, { operationKey: randomUUID(), expectedRevisionId: guestPage.body.page.revisionId, properties: { title: 'Unauthorized guest edit' } })).status, 404);
      }
      for (const route of ['/api/members', '/api/containers', `/api/sharing/containers/${space}`]) {
        assert.ok([403, 404].includes((await call(guest, origin, 'GET', route)).status), 'A named grant gives no workspace or access-management authority.');
      }
      for (const actor of [reader, guest]) {
        assert.equal((await call(actor, origin, 'GET', `/api/pages/${excludedPage}`)).status, 404, 'The profile never widens access to an unrelated private space.');
      }
      const memberPage = await ok(reader, origin, 'GET', `/api/pages/${pageId}`);
      assert.equal(memberPage.page.title, 'Profile response checklist');
      assert.equal((await ok(reader, origin, 'GET', `/api/containers/${space}`)).permissions.canCreatePages, true, 'The group edit grant remains effective.');
      const publicExpected = values.publicLinkAccess === 'allowed' && values.anonymousAccess === 'allowed' ? 200 : 404;
      const response = await anonymous.request.get(origin + publicPath);
      assert.equal(response.status(), publicExpected);
      if (publicExpected === 200) assert.ok((await response.text()).includes('Profile response checklist'));
      return { guest: guestExpected, public: publicExpected, memberTitle: memberPage.page.title, memberPermissions: memberPage.permissions };
    };
    const canonical = async values => ({
      container: await api(`/api/containers/${space}`),
      grants: await api(`/api/sharing/containers/${space}`),
      document: (await api(`/api/pages/${pageId}`)).page,
      revisions: await api(`/api/revisions/${pageId}`),
      access: await access(values),
    });
    const switchProfile = async profile => {
      const before = await api('/api/workspace');
      await page.goto(origin + '/app/settings', { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: 'Edit workspace & policies', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Workspace settings', exact: true });
      await dialog.getByLabel('Space access', { exact: true }).selectOption(profile);
      await dialog.getByRole('button', { name: 'Save settings', exact: true }).click();
      await expect(dialog).toHaveCount(0);
      const after = await api('/api/workspace');
      assert.deepEqual(after.policies, { ...before.policies, 'container.access.v1': profile }, 'Only the requested policy changes.');
      for (const name of switches) assert.equal(after[name], before[name], 'Switching profiles never changes workspace external-access policy.');
      await page.reload({ waitUntil: 'networkidle' });
      assert.equal(await currentProfile(), profile);
      await openSpace();
    };
    const inventory = async profile => {
      const stored = (await api(`/api/sharing/containers/${space}`)).items;
      assert.equal(stored.length, 4, 'Creator, direct member, group and guest grants are populated.');
      const guestGrant = stored.find(item => item.principalId === guestMember.id);
      assert.equal(guestGrant.principalKind, 'member', 'Guest presentation preserves the stored authorization principal kind.');
      assert.equal(guestGrant.principalMemberKind, 'guest');
      assert.equal(guestGrant.principalLabel, guestMember.displayName);
      assert.ok(stored.some(item => item.principalId === group && item.principalKind === 'group'));
      const ids = () => grants.locator('li[data-grant-id]').evaluateAll(rows => rows.map(row => row.dataset.grantId).sort());
      if (profile === 'class-led') {
        const disclosure = settings.locator('details.space-access-details');
        await expect(disclosure.locator('summary')).toHaveText('Manage access');
        assert.equal(await disclosure.evaluate(element => element.open), false);
        await expect(grants).toBeHidden();
        await disclosure.locator('summary').click();
        await expect(grants).toBeVisible();
        assert.deepEqual(await ids(), stored.map(item => item.id).sort());
        await expect(grants).toContainText(guestMember.displayName);
        await expect(grants).toContainText('Profile response team');
        await expect(grants).toContainText('Morgan Reader');
        await expect(grants.getByRole('navigation', { name: 'Access principals' })).toHaveCount(0);
      } else {
        await expect(settings.locator('details.space-access-details')).toHaveCount(0);
        const tabs = grants.getByRole('navigation', { name: 'Access principals' });
        for (const [name, expected] of [
          ['Members', stored.filter(item => item.principalKind === 'member' && item.principalMemberKind === 'member')],
          ['Groups', stored.filter(item => item.principalKind === 'group')],
          ['Guests', [guestGrant]],
        ]) {
          await tabs.getByRole('button', { name, exact: true }).click();
          await expect(tabs.getByRole('button', { name, exact: true })).toHaveAttribute('aria-pressed', 'true');
          await expect.poll(ids).toEqual(expected.map(item => item.id).sort());
          for (const grant of expected) await expect(grants.locator(`li[data-grant-id="${grant.id}"]`)).toContainText(grant.principalLabel);
        }
        const row = grants.locator(`li[data-grant-id="${guestGrant.id}"]`);
        await row.getByRole('button', { name: 'Edit access', exact: true }).click();
        const dialog = page.getByRole('dialog', { name: 'Space access grant', exact: true });
        await expect(dialog.getByLabel('Person or group', { exact: true })).toHaveValue(`member:${guestMember.id}`);
        await expect(dialog.getByLabel('Access', { exact: true })).toHaveValue('view');
        await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
        await expect(settings.getByRole('region', { name: 'External access', exact: true })).toBeVisible();
        await expect(settings.locator('select[name=visibility]')).toHaveCount(0);
      }
    };
    const proof = async profile => {
      await inventory(profile);
      await settings.getByRole('button', { name: profile === 'class-led' ? 'Visibility & public access' : 'External access', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Space access', exact: true });
      if (profile === 'class-led') {
        assert.deepEqual(await dialog.locator('select[name=visibility] option').evaluateAll(options => options.map(option => option.value)), ['default', 'open', 'closed', 'private']);
        // Each choice explains actual grant-based admission instead of promising a new grant.
        for (const option of await dialog.locator('select[name=visibility] option').allTextContents()) assert.match(option, /grant/i);
        await expect(dialog.locator('select[name=visibility]')).toHaveValue('private');
        await expect(settings.getByRole('region', { name: 'Space visibility' })).toContainText('who may see and join');
      } else await expect(dialog.locator('select[name=visibility]')).toHaveCount(0);
      for (const name of switches) await expect(dialog.locator(`select[name=${name}]`)).toBeVisible();
      const close = dialog.getByRole('button', { name: 'Close dialog', exact: true });
      await close.focus();
      await expect(close).toHaveAttribute('data-tooltip', 'Close dialog');
      await expect.poll(() => close.evaluate(element => getComputedStyle(element, '::after').opacity)).toBe('1');
      const fonts = await dialog.locator('label, select, button').evaluateAll(elements => elements.map(element => parseFloat(getComputedStyle(element).fontSize)));
      assert.ok(fonts.every(size => size >= 13), 'The touched access controls use readable text.');
      await accessible(page, `container access ${profile} controls`);
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
      await accessible(page, `container access ${profile} populated grants`);
    };

    if (await currentProfile() !== 'class-led') await switchProfile('class-led');
    else await openSpace();
    await saveSwitches(allowed);
    await proof('class-led');
    const allGrants = await api(`/api/sharing/containers/${space}`);
    const exerciseSwitches = async () => {
      await saveSwitches(allowed);
      await access(allowed);
      for (const name of switches) {
        const values = { ...allowed, [name]: 'forbidden' };
        await saveSwitches(values);
        await access(values);
        assert.deepEqual(await api(`/api/sharing/containers/${space}`), allGrants, 'External switches never rewrite grants.');
        await saveSwitches(allowed);
        await access(allowed);
      }
    };
    await exerciseSwitches();
    const mixed = { guestAccess: 'forbidden', publicLinkAccess: 'allowed', anonymousAccess: 'forbidden' };
    await saveSwitches(mixed);
    const beforeGrant = await canonical(mixed);
    await switchProfile('grant-led');
    assert.deepEqual(await canonical(mixed), beforeGrant, 'Class-led to grant-led preserves visibility, grants, switches, revisions and effective access after reload.');
    await proof('grant-led');
    await exerciseSwitches();
    await saveSwitches(mixed);
    const beforeClass = await canonical(mixed);
    await switchProfile('class-led');
    assert.deepEqual(await canonical(mixed), beforeClass, 'Grant-led to class-led preserves visibility, grants, switches, revisions and effective access after reload.');
    await inventory('class-led');
    await saveSwitches(allowed);
    // The read-only member cannot manage settings under either presentation.
    const unchanged = await canonical(allowed);
    assert.equal((await call(reader, origin, 'POST', '/api/sharing/container-settings', { operationKey: randomUUID(), id: space, expectedRevisionId: unchanged.container.revisionId, visibility: 'open', ...allowed })).status, 403);
    assert.deepEqual(await canonical(allowed), unchanged, 'Refused management leaves both content and access unchanged.');
    await post('/api/guests/revoke', { memberIds: [guestMember.id] });
    assert.equal((await call(guest, origin, 'GET', `/api/pages/${pageId}`)).status, 401);
    assert.equal((await guest.request.post(origin + '/api/auth/invitation/accept', { headers: { origin }, form: { token: invitation.searchParams.get('token') }, maxRedirects: 0 })).status(), 400, 'A profile journey never makes an accepted invitation reusable.');
    assert.deepEqual(await api('/api/members'), members);
    console.log(`PROBE CONT-008 1–5: native profiles at ${width}px; populated grants, three external switches, bidirectional reload snapshots and current-authority refusals passed.`);
  } finally {
    await Promise.all([guest.close(), reader.close(), anonymous.close()]);
  }
}
