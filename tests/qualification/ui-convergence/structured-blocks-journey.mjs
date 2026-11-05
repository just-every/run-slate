import assert from 'node:assert/strict';
import { expect } from '@playwright/test';

const plain = spans => (spans ?? []).map(span => span.text).join('');
export const structuredContent = {
  headings: ['Recovery overview', 'Recovery responsibilities', 'Recovery checklist'],
  bullet: 'Notify the recovery lead', numbered: 'Confirm customer recovery',
  toggle: 'Recovery detail', detail: 'Preserve the complete recovery instructions.',
  quote: 'Recovery requires a second reader.', callout: 'Do not discard the recovery log.',
  summary: 'Escalation notes', expanded: 'Keep the complete escalation history.',
  columns: ['Owner', 'Next action'], cells: ['Morgan', 'Confirm <recovery> & retain | notes'],
  code: 'const recovered = count < 3;\nconsole.log("recovered", recovered);',
};

/** Populate every selected kind through the editor, including a genuinely nested quote. */
export async function authorStructuredBlocks(state, pageId) {
  const { page, api, origin } = state, value = structuredContent;
  await page.goto(`${origin}/app/pages/${pageId}`, { waitUntil: 'networkidle' });
  const previous = new Set((await api(`/api/pages/${pageId}`)).blocks.map(block => block.id));
  const save = (method, path) => page.waitForResponse(response => new URL(response.url()).pathname === path && response.request().method() === method);
  const add = async name => {
    const before = (await api(`/api/pages/${pageId}`)).blocks.length;
    await page.getByRole('button', { name: '＋ Add block', exact: true }).click();
    const search = page.getByPlaceholder('Type to search', { exact: true });
    await search.fill(name);
    await search.press('ArrowDown');
    await search.press('Enter');
    await expect.poll(async () => (await api(`/api/pages/${pageId}`)).blocks.length, { message: `Native insertion of ${name}` }).toBe(before + 1);
  };
  const fill = async (label, text) => {
    const field = page.getByRole('textbox', { name: label, exact: true });
    const id = await field.evaluate(element => element.closest('[data-block-id]').dataset.blockId);
    const [response] = await Promise.all([save('PATCH', `/api/pages/${pageId}/blocks/${id}`), field.fill(text)]);
    assert.equal(response.status(), 200);
  };
  for (const [i, heading] of value.headings.entries()) { await add(`Heading ${i + 1}`); await fill(`Heading level ${i + 1}`, heading); }
  await add('Bulleted list'); await fill('Bulleted list item', value.bullet);
  await add('Numbered list'); await fill('Numbered list item', value.numbered);
  await add('Toggle list'); await fill('Toggle item', value.toggle);
  let [response] = await Promise.all([page.waitForResponse(r => r.request().method() === 'PATCH' && new URL(r.url()).pathname.startsWith(`/api/pages/${pageId}/blocks/`)), page.getByRole('button', { name: 'Expand this item', exact: true }).click()]);
  assert.equal(response.status(), 200);
  await fill('Toggle item content', value.detail);
  const toggle = (await api(`/api/pages/${pageId}`)).blocks.find(b => b.content.variant === 'toggle');
  await add('Quote'); await fill('Quote', value.quote);
  const quote = page.getByRole('textbox', { name: 'Quote', exact: true }).locator('xpath=ancestor::*[@data-block-id][1]');
  await quote.getByRole('button', { name: /Block actions for/ }).click();
  [response] = await Promise.all([save('PUT', `/api/pages/${pageId}/blocks`), page.getByRole('menuitem', { name: /^Indent/ }).click()]);
  assert.equal(response.status(), 200);
  assert.equal((await api(`/api/pages/${pageId}`)).blocks.find(b => b.blockType === 'quote' && plain(b.content.text) === value.quote).parentBlockId, toggle.id);
  await add('Divider'); await add('Callout'); await fill('Callout text', value.callout);
  await add('Expandable section'); await fill('Expandable section summary', value.summary); await fill('Expandable section content', value.expanded);
  await add('Table');
  await fill('Column 1 heading', value.columns[0]); await fill('Column 2 heading', value.columns[1]);
  await fill('Row 1, Owner', value.cells[0]); await fill('Row 1, Next action', value.cells[1]);
  await add('Code');
  await page.getByRole('combobox', { name: 'Code language', exact: true }).click();
  [response] = await Promise.all([page.waitForResponse(r => r.request().method() === 'PATCH' && new URL(r.url()).pathname.startsWith(`/api/pages/${pageId}/blocks/`)), page.getByRole('option', { name: 'typescript', exact: true }).click()]);
  assert.equal(response.status(), 200);
  await fill('Code, typescript', value.code);
  const source = await api(`/api/pages/${pageId}`);
  const authored = source.blocks.filter(block => !previous.has(block.id));
  assert.deepEqual(authored.map(b => b.blockType), ['heading', 'heading', 'heading', 'list', 'list', 'list', 'quote', 'divider', 'callout', 'expandable', 'table', 'code']);
  assert.equal(authored[6].parentBlockId, authored[5].id);
  await page.reload({ waitUntil: 'networkidle' });
  assert.deepEqual((await api(`/api/pages/${pageId}`)).blocks, source.blocks);
  await inspectStructuredEditor(state);
  await page.screenshot({ path: `.artifacts/ui-convergence/structured-blocks-${page.viewportSize().width}-authored.png`, fullPage: true });
  return source;
}

export async function inspectStructuredEditor({ page, context }) {
  const value = structuredContent;
  for (const [i, heading] of value.headings.entries()) await expect(page.getByRole('textbox', { name: `Heading level ${i + 1}`, exact: true })).toHaveText(heading);
  for (const [label, text] of [['Bulleted list item', value.bullet], ['Numbered list item', value.numbered], ['Toggle item', value.toggle], ['Toggle item content', value.detail], ['Quote', value.quote], ['Callout text', value.callout], ['Expandable section summary', value.summary], ['Expandable section content', value.expanded], ['Column 1 heading', value.columns[0]], ['Column 2 heading', value.columns[1]], ['Row 1, Owner', value.cells[0]], ['Row 1, Next action', value.cells[1]], ['Code, typescript', value.code]]) await expect(page.getByRole('textbox', { name: label, exact: true })).toHaveText(text);
  await expect(page.getByRole('columnheader').filter({ hasText: 'Owner' })).toHaveCount(1);
  await expect(page.getByRole('combobox', { name: 'Code language', exact: true })).toHaveText('typescript');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: 'Copy', exact: true }).click();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), value.code);
  for (const [name, tooltip] of [['Collapse this item', 'Collapse item'], [`Collapse ${value.summary}`, 'Collapse section']]) {
    const control = page.getByRole('button', { name, exact: true });
    await control.focus();
    await expect(control).toHaveAttribute('data-tooltip', tooltip);
    assert.equal(await control.evaluate(element => getComputedStyle(element, '::after').opacity), '1', 'Disclosure tooltips appear immediately on keyboard focus.');
  }
}

/** Compare canonical bodies and the actual readable document independently. */
export async function inspectStructuredArchive({ context }, entries, format, pageId, source) {
  const value = structuredContent, decode = path => new TextDecoder().decode(entries[path]);
  const manifest = JSON.parse(decode('slate-readable.json'));
  assert.deepEqual(manifest.pages.find(p => p.id === pageId).blocks, source.blocks);
  const document = decode(`pages/${pageId}.${format === 'html' ? 'html' : 'md'}`);
  if (format === 'markdown') {
    for (const [i, heading] of value.headings.entries()) assert.ok(document.includes(`${'#'.repeat(i + 1)} ${heading}`));
    assert.ok(document.includes(`- ${value.bullet}`)); assert.ok(document.includes(`1. ${value.numbered}`));
    assert.ok(document.includes(`<blockquote>${value.quote}</blockquote>`)); assert.ok(document.includes('\n---\n'));
    assert.ok(document.includes('| Owner | Next action |\n| --- | --- |\n| Morgan | Confirm \\<recovery\\> & retain \\| notes |'));
    assert.ok(document.includes('```typescript\n' + value.code + '\n```'));
  }
  const output = await context.newPage();
  try {
    // Raw HTML is the Markdown equivalent for disclosure and callout blocks.
    await output.setContent(document);
    for (const summary of [value.toggle, value.summary]) {
      const details = output.locator('details').filter({ has: output.locator('summary').filter({ hasText: summary }) });
      await expect(details).toHaveCount(1);
      await details.evaluate(element => { element.open = true; });
      await expect(details).toContainText(summary === value.toggle ? value.detail : value.expanded);
    }
    await expect(output.locator('aside')).toHaveText(value.callout);
    const toggle = source.blocks.find(block => block.content.variant === 'toggle');
    await expect(output.locator(`[id="slate-block-${toggle.id}"] > .slate-block-children blockquote`)).toHaveText(value.quote);
    if (format === 'html') {
      for (const [i, heading] of value.headings.entries()) await expect(output.locator(`h${i + 1}`).filter({ hasText: heading })).toHaveCount(1);
      await expect(output.locator('ul > li').filter({ hasText: value.bullet })).toHaveCount(1);
      await expect(output.locator('ol > li')).toHaveText(value.numbered);
      await expect(output.locator('blockquote').filter({ hasText: value.quote })).toHaveCount(1);
      await expect(output.locator('hr')).toHaveCount(1);
      await expect(output.locator('thead th')).toHaveText(value.columns);
      await expect(output.locator('tbody td')).toHaveText(value.cells);
      await expect(output.locator('pre code.language-typescript')).toHaveText(value.code);
    }
    await output.screenshot({ path: `.artifacts/ui-convergence/structured-blocks-${format}-readable.png`, fullPage: true });
  } finally { await output.close(); }
}

export function assertCanonicalCopy(source, copy) {
  const sourceIds = new Map(source.blocks.map((b, i) => [b.id, i])), copyIds = new Map(copy.blocks.map((b, i) => [b.id, i]));
  const canonical = (blocks, ids) => blocks.map(b => ({ type: b.blockType, parent: b.parentBlockId ? ids.get(b.parentBlockId) : null, position: b.treePosition, content: JSON.parse(JSON.stringify(b.content), (key, value) => key === 'commentAnchorId' ? 'retained-anchor' : value) }));
  assert.deepEqual(canonical(copy.blocks, copyIds), canonical(source.blocks, sourceIds));
  assert.ok(copy.blocks.every(b => !sourceIds.has(b.id)), 'Imported blocks have fresh native identities.');
}
