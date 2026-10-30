import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';
import { accessible } from './browser-evidence.mjs';
import { ok } from './two-people-support.mjs';

/** Search a native, nonempty gallery with independent title and description terms. */
export async function templateGalleryJourney({ page, context, origin, api }) {
  const source = (await api('/api/pages')).items.find(item => item.title === 'Welcome');
  assert.ok(source, 'First-run supplies the source page for native template creation.');
  const operations = 'synthetic-slate-42 Operations';
  const planning = 'synthetic-slate-42 Planning';
  const corpus = [
    { title: 'synthetic-slate-42 Lighthouse checklist', description: 'Beacon signals for incoming crews.', category: operations },
    { title: 'synthetic-slate-42 Crew handover', description: 'Beacon duties and watch changes.', category: operations },
    { title: 'synthetic-slate-42 Lighthouse review', description: 'Previous outcomes and lessons.', category: planning },
    { title: 'synthetic-slate-42 Launch record', description: 'Delivery sequence and owners.', category: operations },
  ];
  const templates = [];
  for (const authored of corpus) {
    const created = await ok(context, origin, 'POST', '/api/templates', {
      operationKey: randomUUID(), sourcePageId: source.id, includeChildren: false,
      containerId: null, ...authored,
    });
    templates.push({ id: created.value.id, ...authored });
  }
  const project = ({ id, title, description, category }) => ({ id, title, description, category });
  await page.goto(origin + '/app/templates', { waitUntil: 'networkidle' });
  const search = page.getByRole('searchbox', { name: 'Find a template', exact: true });
  const category = page.getByRole('textbox', { name: 'Category', exact: true });
  const choices = page.locator('.template-choice');
  const empty = page.getByText('No templates match this search.', { exact: true });
  async function results(query, selectedCategory, expectedIndexes) {
    const expected = expectedIndexes.map(index => templates[index]);
    const response = page.waitForResponse(response => {
      const url = new URL(response.url());
      return response.request().method() === 'GET' && url.pathname === '/api/templates'
        && url.searchParams.get('query') === query && url.searchParams.get('category') === selectedCategory;
    });
    await search.fill(query);
    await category.fill(selectedCategory);
    const loaded = await response;
    assert.equal(loaded.status(), 200, await loaded.text());
    const body = await loaded.json();
    assert.deepEqual(body.items.map(project), expected, 'The native response returns exactly the authored matching templates, in gallery order.');
    assert.deepEqual((await api(`/api/templates?${new URLSearchParams({ query, category: selectedCategory })}`)).items.map(project), expected, 'An independent native read returns the same exact choices.');
    await expect(choices.locator('h3')).toHaveText(expected.map(item => item.title));
    await expect(choices.locator('p')).toHaveText(expected.map(item => item.description));
    await expect(choices.locator('.eyebrow')).toHaveText(expected.map(item => item.category));
    await expect(search).toHaveValue(query);
    await expect(category).toHaveValue(selectedCategory);
    if (expected.length) {
      assert.equal(body.emptyMessage, null);
      await expect(empty).toHaveCount(0);
    } else {
      assert.equal(body.emptyMessage, 'No templates match this search.');
      await expect(empty).toBeVisible();
      await expect(choices).toHaveCount(0);
    }
  }
  await results('synthetic-slate-42', '', [1, 3, 0, 2]);
  await results('lighthouse', '', [0, 2]);
  await results('beacon', '', [1, 0]);
  await results('beacon', operations, [1, 0]);
  await accessible(page, 'template gallery description search and category');
  await results('lighthouse', operations, [0]);
  await results('beacon', planning, []);
  await accessible(page, 'template gallery unmatched search and category');
  await results('', operations, [1, 3, 0]);
  await results('synthetic-slate-42', '', [1, 3, 0, 2]);
  await page.reload({ waitUntil: 'networkidle' });
  for (const item of templates) await expect(choices.filter({ has: page.getByRole('heading', { name: item.title, exact: true }) })).toBeVisible();
}
