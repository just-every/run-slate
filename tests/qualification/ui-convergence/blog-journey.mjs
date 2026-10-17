import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';
import { accessible } from './browser-support.mjs';
import { ok } from './two-people-support.mjs';

const title = 'Harbour office reopens';

/**
 * CONT-010 in two browsers: Morgan watches the Handbook space, Alex publishes a
 * post from the space's blog, and Morgan is notified once, sees the post on Home
 * and opens it as the page it is.
 */
export async function blogJourney(state, people) {
  const { alice, bob } = people, origin = state.origin;
  const space = (await ok(alice.context, origin, 'GET', '/api/containers')).items.find(item => item.name === 'Handbook');
  await ok(alice.context, origin, 'POST', '/api/sharing', { operationKey: randomUUID(), targetKind: 'container', targetId: space.id, principalKind: 'member', principalId: bob.id, level: 'comment' });

  await bob.page.goto(`${origin}/app/containers/${space.id}`, { waitUntil: 'networkidle' });
  await bob.page.getByRole('button', { name: 'Watch space', exact: true }).click();
  await expect(bob.page.getByRole('button', { name: 'Stop watching space', exact: true })).toBeVisible();
  await bob.page.getByRole('navigation', { name: 'Space navigation' }).getByRole('button', { name: 'Blog', exact: true }).click();
  const bobBlog = bob.page.getByRole('region', { name: 'Blog' });
  await expect(bobBlog.getByText('No posts in this space yet.')).toBeVisible();
  await expect(bobBlog.getByRole('button', { name: 'Write a post' }), 'A commenter reads the blog but cannot post.').toHaveCount(0);

  await alice.page.goto(`${origin}/app/containers/${space.id}`, { waitUntil: 'networkidle' });
  await alice.page.getByRole('navigation', { name: 'Space navigation' }).getByRole('button', { name: 'Blog', exact: true }).click();
  const blog = alice.page.getByRole('region', { name: 'Blog' });
  await blog.getByRole('button', { name: 'Write a post' }).click();
  const dialog = alice.page.getByRole('dialog', { name: 'Write a post' });
  await dialog.getByLabel('Title').fill(title);
  await dialog.getByLabel('Cover').selectOption({ label: 'Ocean' });
  await dialog.getByLabel('Post').fill('The harbour office reopens on Monday.\n\nBring your badge to the front desk.');
  await accessible(alice.page, 'write a post dialog');
  await dialog.getByRole('button', { name: 'Publish post' }).click();
  await expect(dialog).toBeHidden();
  const listed = blog.getByRole('article', { name: title });
  await expect(listed).toContainText('By Alex Owner');
  await expect(listed).toContainText('0 comments');
  await accessible(alice.page, 'space blog with a post');
  await people.shot('alice', 'space blog');

  await bob.page.goto(`${origin}/app/inbox`, { waitUntil: 'networkidle' });
  const notices = bob.page.locator('.outcome-list li').filter({ hasText: title });
  await expect(notices).toHaveCount(1);
  await expect(notices).toContainText('post published');
  await people.shot('bob', 'post notification');

  await bob.page.goto(`${origin}/app`, { waitUntil: 'networkidle' });
  const home = bob.page.getByRole('region', { name: 'Posts' });
  const post = home.getByRole('article', { name: title });
  await expect(post).toContainText('By Alex Owner');
  await expect(post).toContainText('Handbook');
  await expect(bob.page.getByRole('region', { name: 'Following' }).locator('li').filter({ hasText: title })).toContainText('post published');
  await accessible(bob.page, 'home posts');
  await people.shot('bob', 'home posts');
  const overflow = await bob.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 0, `Home does not scroll sideways (${overflow}px).`);
  await post.getByRole('link', { name: title }).click();
  await bob.page.waitForURL(url => url.pathname.startsWith('/app/pages/'));
  await expect(bob.page.getByRole('textbox', { name: 'Page title', exact: true })).toHaveValue(title);
  await expect(bob.page.getByText('Bring your badge to the front desk.')).toBeVisible();
  await expect(bob.page.getByRole('img', { name: 'ocean gallery cover' })).toBeVisible();
  await people.shot('bob', 'post opened');
}
