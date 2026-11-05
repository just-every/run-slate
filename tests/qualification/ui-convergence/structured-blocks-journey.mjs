import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import { expect } from '@playwright/test';

// Use the installed Markdown parser and GFM extensions to read the downloaded body.
const require = createRequire(import.meta.url);
const markdownRequire = createRequire(require.resolve('react-markdown'));
const parserRequire = createRequire(markdownRequire.resolve('remark-parse'));
const gfmRequire = createRequire(require.resolve('remark-gfm'));
const gfmHtml = createRequire(gfmRequire.resolve('micromark-extension-gfm'))('./html.js');
const renderMarkdown = source => parserRequire('micromark')(source, {
  allowDangerousHtml: true,
  extensions: [gfmRequire('micromark-extension-gfm')()],
  htmlExtensions: [gfmHtml],
});

const plain = spans => (spans ?? []).map(span => span.text).join('');
export const structuredContent = {
  headings: ['Recovery overview', 'Recovery responsibilities', 'Recovery checklist'],
  bullet: 'Notify the recovery lead', numbered: 'Confirm customer recovery',
  toggle: 'Recovery detail', detail: 'Preserve the complete recovery instructions.',
  quote: 'Recovery requires a second reader.', callout: 'Do not discard the recovery log.',
  summary: 'Escalation notes', expanded: 'Keep the complete escalation history.',
  columns: ['Owner', 'Next action'], cells: ['Morgan', 'Confirm <recovery> & retain | notes'],
  code: 'const recovered = count < 3;\nconsole.log("recovered", recovered);',
  python: 'print("recovery <ready> & retained")\n\n# preserve this comment\nprint("complete")',
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
    const hints = { 'Heading 1': '#', 'Heading 2': '##', 'Heading 3': '###', 'Bulleted list': '-', 'Numbered list': '1.', Quote: '>', Divider: '---', Code: '```' };
    await page.getByRole('option', { name: hints[name] ? `${name} ${hints[name]}` : name, exact: true }).click();
    await expect.poll(async () => (await api(`/api/pages/${pageId}`)).blocks.length, { message: `Native insertion of ${name}` }).toBe(before + 1);
  };
  const fill = async (label, text) => {
    const field = page.getByRole('textbox', { name: label, exact: true });
    const id = await field.evaluate(element => element.closest('[data-block-id]').dataset.blockId);
    const [response] = await Promise.all([save('PATCH', `/api/pages/${pageId}/blocks/${id}`), field.fill(text)]);
    assert.equal(response.status(), 200);
  };
  for (const [i, heading] of value.headings.entries()) { await add(`Heading ${i + 1}`); await fill(`Heading level ${i + 1}`, heading); }
  await add('Code');
  await page.getByRole('combobox', { name: 'Code language', exact: true }).click();
  let [response] = await Promise.all([page.waitForResponse(r => r.request().method() === 'PATCH' && new URL(r.url()).pathname.startsWith(`/api/pages/${pageId}/blocks/`)), page.getByRole('option', { name: 'python', exact: true }).click()]);
  assert.equal(response.status(), 200);
  await fill('Code, python', value.python);
  const python = page.getByRole('textbox', { name: 'Code, python', exact: true }).locator('xpath=ancestor::*[@data-block-id][1]');
  await python.getByRole('button', { name: /Block actions for/ }).click();
  [response] = await Promise.all([save('PUT', `/api/pages/${pageId}/blocks`), page.getByRole('menuitem', { name: /^Indent/ }).click()]);
  assert.equal(response.status(), 200);
  const nested = await api(`/api/pages/${pageId}`);
  assert.equal(nested.blocks.find(b => b.blockType === 'code').parentBlockId, nested.blocks.find(b => b.blockType === 'heading' && b.content.level === 3).id);
  await add('Bulleted list'); await fill('Bulleted list item', value.bullet);
  await add('Numbered list'); await fill('Numbered list item', value.numbered);
  await add('Toggle list'); await fill('Toggle item', value.toggle);
  [response] = await Promise.all([page.waitForResponse(r => r.request().method() === 'PATCH' && new URL(r.url()).pathname.startsWith(`/api/pages/${pageId}/blocks/`)), page.getByRole('button', { name: 'Expand this item', exact: true }).click()]);
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
  await page.getByRole('combobox', { name: 'Code language', exact: true }).last().click();
  [response] = await Promise.all([page.waitForResponse(r => r.request().method() === 'PATCH' && new URL(r.url()).pathname.startsWith(`/api/pages/${pageId}/blocks/`)), page.getByRole('option', { name: 'typescript', exact: true }).click()]);
  assert.equal(response.status(), 200);
  await fill('Code, typescript', value.code);
  const source = await api(`/api/pages/${pageId}`);
  const authored = source.blocks.filter(block => !previous.has(block.id));
  assert.deepEqual(authored.map(b => b.blockType), ['heading', 'heading', 'heading', 'code', 'list', 'list', 'list', 'quote', 'divider', 'callout', 'expandable', 'table', 'code']);
  assert.equal(authored[3].parentBlockId, authored[2].id);
  assert.equal(authored[7].parentBlockId, authored[6].id);
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
  await expect(page.locator('[data-block-id] hr')).toHaveCount(1);
  const quote = page.getByRole('textbox', { name: 'Quote', exact: true });
  const parent = page.getByRole('textbox', { name: 'Toggle item', exact: true });
  const contentEdge = field => field.locator('xpath=ancestor::*[@data-block-id][1]').locator(':scope > .block-content').evaluate(element => element.getBoundingClientRect().x + Number.parseFloat(getComputedStyle(element).paddingLeft));
  assert.ok(await contentEdge(quote) > await contentEdge(parent), 'The reloaded quote remains visibly nested under its parent.');
  await expect(page.getByRole('columnheader').filter({ hasText: 'Owner' })).toHaveCount(1);
  await expect(page.getByRole('textbox', { name: 'Code, python', exact: true })).toHaveText(value.python);
  await expect(page.getByRole('combobox', { name: 'Code language', exact: true })).toHaveText(['python', 'typescript']);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.evaluate(() => navigator.clipboard.writeText('synthetic-slate-clipboard-before-copy'));
  await page.getByRole('button', { name: 'Copy', exact: true }).last().click();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), value.code);
  await page.getByRole('button', { name: 'Copy', exact: true }).first().click();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), value.python);
  for (const [name, tooltip] of [['Collapse this item', 'Collapse item'], [`Collapse ${value.summary}`, 'Collapse section']]) {
    const control = page.getByRole('button', { name, exact: true });
    await control.focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(control).toBeFocused();
    await expect(control).toHaveAttribute('data-tooltip', tooltip);
    assert.equal(await control.evaluate(element => getComputedStyle(element, '::after').opacity), '1', 'Disclosure tooltips appear immediately on keyboard focus.');
  }
}

/** Compare canonical bodies and the actual readable document independently. */
export async function inspectStructuredArchive({ context }, entries, format, pageId, source) {
  const value = structuredContent, decode = path => new TextDecoder().decode(entries[path]);
  const manifest = JSON.parse(decode('slate-readable.json'));
  assert.deepEqual(manifest.pages.find(p => p.id === pageId).blocks, source.blocks);
  const extension = format === 'html' ? 'html' : 'md';
  const document = decode(`pages/${pageId}.${extension}`);
  await writeFile(`.artifacts/ui-convergence/structured-blocks-readable.${extension}`, document);
  await writeFile(`.artifacts/ui-convergence/structured-blocks-${format}-manifest.json`, JSON.stringify(manifest, null, 2));
  if (format === 'markdown') {
    for (const [i, heading] of value.headings.entries()) {
      const block = source.blocks.find(b => b.blockType === 'heading' && plain(b.content.text) === heading);
      if (!source.blocks.some(child => child.parentBlockId === block.id)) assert.ok(document.includes(`${'#'.repeat(i + 1)} ${heading}`));
      else assert.ok(document.includes(`<h${i + 1} id="block-${block.id}">${heading}</h${i + 1}>`));
    }
    assert.ok(document.includes(`- ${value.bullet}`)); assert.ok(document.includes(`1. ${value.numbered}`));
    assert.ok(document.includes(`<blockquote>${value.quote}</blockquote>`)); assert.ok(document.includes('\n---\n'));
    assert.ok(document.includes('| Owner | Next action |\n| --- | --- |\n| Morgan | Confirm \\<recovery\\> & retain \\| notes |'));
    assert.ok(document.includes('```typescript\n' + value.code + '\n```'));
  }
  const output = await context.newPage();
  try {
    await output.setContent(format === 'markdown' ? renderMarkdown(document) : document);
    const heading = source.blocks.find(block => block.blockType === 'heading' && block.content.level === 3);
    const nestedCode = output.locator(`[id="slate-block-${heading.id}"] > .slate-block-children pre code.language-python`);
    await expect(nestedCode).toHaveCount(1);
    assert.equal(await nestedCode.textContent(), value.python, 'Readable code retains every character, including blank lines and the Python comment marker.');
    for (const summary of [value.toggle, value.summary]) {
      const details = output.locator('details').filter({ has: output.locator('summary').filter({ hasText: summary }) });
      await expect(details).toHaveCount(1);
      await details.evaluate(element => { element.open = true; });
      await expect(details).toContainText(summary === value.toggle ? value.detail : value.expanded);
    }
    await expect(output.locator('aside')).toHaveText(value.callout);
    const toggle = source.blocks.find(block => block.content.variant === 'toggle');
    await expect(output.locator(`[id="slate-block-${toggle.id}"] > .slate-block-children blockquote`)).toHaveText(value.quote);
    {
      for (const [i, heading] of value.headings.entries()) await expect(output.locator(`h${i + 1}`).filter({ hasText: heading })).toHaveCount(1);
      await expect(output.locator('ul > li').filter({ hasText: value.bullet })).toHaveCount(1);
      await expect(output.locator('ol > li')).toHaveText(value.numbered);
      await expect(output.locator('blockquote').filter({ hasText: value.quote })).toHaveCount(1);
      await expect(output.locator('hr')).toHaveCount(1);
      await expect(output.locator('thead th')).toHaveText(value.columns);
      await expect(output.locator('tbody td')).toHaveText(value.cells);
      await expect(output.locator('pre code.language-typescript')).toHaveText(value.code);
    }
    await output.screenshot({ path: `.artifacts/ui-convergence/structured-blocks-${format}-readable-1440.png`, fullPage: true });
    await output.setViewportSize({ width: 390, height: 844 });
    await output.screenshot({ path: `.artifacts/ui-convergence/structured-blocks-${format}-readable-390.png`, fullPage: true });
  } finally { await output.close(); }
}

export function assertCanonicalCopy(source, copy) {
  const sourceIds = new Map(source.blocks.map((b, i) => [b.id, i])), copyIds = new Map(copy.blocks.map((b, i) => [b.id, i]));
  const canonical = (blocks, ids) => blocks.map(b => ({ type: b.blockType, parent: b.parentBlockId ? ids.get(b.parentBlockId) : null, position: b.treePosition, content: JSON.parse(JSON.stringify(b.content), (key, value) => key === 'commentAnchorId' ? 'retained-anchor' : value) }));
  assert.deepEqual(canonical(copy.blocks, copyIds), canonical(source.blocks, sourceIds));
  assert.ok(copy.blocks.every(b => !sourceIds.has(b.id)), 'Imported blocks have fresh native identities.');
}
