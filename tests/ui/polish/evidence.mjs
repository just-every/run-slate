import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';
import { insideViewport } from '../../qualification/ui-convergence/browser-evidence.mjs';
export { insideViewport };
import { recordCapture } from './inventory.mjs';
import { sweepControls, assertControlSweep } from './control-sweep.mjs';
import { guardCaptureCamera, assertScreenshotCamera } from './capture-camera.mjs';
import { waitForRenderedResourceReadiness } from './resource-readiness.mjs';
import { waitForScrollSettled } from './scroll-settle.mjs';

const output = process.env.SLATE_POLISH_SHOTS ?? fileURLToPath(new URL('../../../.artifacts/slate-polish/shots', import.meta.url));
const evidenceRoot = path.join(path.dirname(output), 'polish-evidence');
export async function capture(page, name, { fullPage = false, requiredControls = [], requiredDocumentControls = [] } = {}) {
  await page.waitForLoadState('networkidle');
  await waitForRenderedResourceReadiness(page);
  await waitForScrollSettled(page);
  const guard = await guardCaptureCamera(page, name, () => new AxeBuilder({ page }).analyze());
  try {
    const { axe, integrity } = guard;
    const { geometry } = await guard.unchanged('beforeSweep');
    const sweep = await sweepControls(page, { fullPage });
    await guard.unchanged('afterSweep');
    assert.deepEqual(sweep.initialScroll, { x: integrity.original.camera.x, y: integrity.original.camera.y }, `${name}: sweep uses the original screenshot camera`);
    await Promise.all([mkdir(output, { recursive: true }), mkdir(evidenceRoot, { recursive: true })]);
    const stem = `${page.viewportSize().width}-${name}`;
    const artifact = JSON.parse(await readFile(new URL('../../../.cache/slate/build-source.json', import.meta.url), 'utf8'));
    const frame = await guard.unchanged('beforeScreenshot');
    const screenshot = await page.screenshot({ path: path.join(output, `${stem}.png`), fullPage });
    integrity.screenshot = assertScreenshotCamera(screenshot, frame, fullPage, name);
    await guard.unchanged('afterScreenshot');
    await writeFile(path.join(evidenceRoot, `${stem}.json`), JSON.stringify({ name, url: page.url(), artifact, geometry, sweep, axe, integrity }, null, 2));
    await assertControlSweep(page, sweep, name);
    for (const required of requiredControls) {
      const record = sweep.records.find(record => !record.excluded && record.name === required);
      assert.ok(record, `${name}: required control ${required} was checked by the sweep`);
      assert.ok(record.capturedBox.right-record.capturedBox.left >= record.box.width-1 && record.capturedBox.bottom-record.capturedBox.top >= record.box.height-1 && record.hits.length > 0 && record.hits.every(hit => hit.own), `${name}: required control ${required} is fully captured and uncovered in the original viewport`);
    }
    for (const required of requiredDocumentControls) {
      const record = sweep.records.find(record => !record.excluded && record.name === required);
      assert.ok(fullPage && record, `${name}: required document control ${required} is enumerated and checked in the full-page capture`);
      assert.equal(record.paintVisible, true, `${name}: document control ${required} has native paint visibility`);
      assert.ok(record.capturedBox.top >= geometry.viewport.height && record.capturedBox.right-record.capturedBox.left >= record.box.width-1 && record.capturedBox.bottom-record.capturedBox.top >= record.box.height-1, `${name}: document control ${required} is fully captured below the original viewport`);
      assert.equal(record.hits.length, 0, `${name}: document control ${required} was not relocated for viewport hit testing`);
      assert.equal(record.documentFragments.length, 1, `${name}: document control ${required} contributes its original painted document fragment to every neighbor comparison`);
      assert.ok(record.gapBoxes.some(box => box.x === record.box.x && box.y === record.box.y && box.width === record.box.width && box.height === record.box.height), `${name}: document control ${required} retains its complete original geometry in the gap sweep`);
    }
    assert.ok(geometry.documentWidth <= geometry.viewport.width, `${name}: no horizontal overflow`);
    assert.deepEqual(axe.violations.filter(item => ['serious', 'critical'].includes(item.impact)).map(item => ({ id: item.id, targets: item.nodes.map(node => node.target) })), [], `${name}: no serious or critical axe violations`);
    const unlabeled = await page.locator('button').evaluateAll(els => els.filter(el => /^[≡☰]$/.test(el.textContent.trim()) && !el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby')).map(el => el.outerHTML));
    assert.deepEqual(unlabeled, [], `${name}: no unlabeled navigation glyph`);
    await writeFile(path.join(evidenceRoot, 'capture-inventory.json'), JSON.stringify(recordCapture(page.viewportSize().width, name, sweep), null, 2));
  } finally {
    await guard.dispose();
  }
}
export async function control(locator, name, { padding = 8 } = {}) {
  await expect(locator).toBeVisible();
  const style = await locator.evaluate(el => { const s = getComputedStyle(el), r = el.getBoundingClientRect(); return { height: r.height, left: parseFloat(s.paddingLeft), right: parseFloat(s.paddingRight), background: s.backgroundColor, borders: ['Top','Right','Bottom','Left'].map(side => ({ width: parseFloat(s[`border${side}Width`]), color: s[`border${side}Color`], style: s[`border${side}Style`] })) }; });
  assert.ok(style.height >= 32, `${name}: at least 32px high (${style.height})`);
  assert.ok(style.left >= padding && style.right >= padding, `${name}: horizontal padding at least ${padding}px (${style.left}, ${style.right})`);
  const transparent = color => color === 'transparent' || color === 'rgba(0, 0, 0, 0)' || /\/\s*0\)$/.test(color);
  assert.ok(!transparent(style.background) || style.borders.some(b => b.width > 0 && b.style !== 'none' && !transparent(b.color)), `${name}: visible surface or border`);
}
/** A menu entry: visible, a comfortable target (32px high, 8px inline padding); its row, not a painted button, is its surface. */
export async function menuEntry(locator, name, { padding = 8 } = {}) {
  await expect(locator).toBeVisible();
  const style = await locator.evaluate(el => { const s = getComputedStyle(el), r = el.getBoundingClientRect(); return { height: r.height, left: parseFloat(s.paddingLeft), right: parseFloat(s.paddingRight) }; });
  assert.ok(style.height >= 32, `${name}: at least 32px high (${style.height})`);
  assert.ok(style.left >= padding && style.right >= padding, `${name}: horizontal padding at least ${padding}px (${style.left}, ${style.right})`);
}
export async function separated(locators, label, { gap = 4 } = {}) {
  const boxes = await Promise.all(locators.map(l => l.boundingBox()));
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j]; assert.ok(a && b, `${label}: controls have boxes`);
    const horizontal = Math.max(b.x - (a.x + a.width), a.x - (b.x + b.width));
    const vertical = Math.max(b.y - (a.y + a.height), a.y - (b.y + b.height));
    assert.ok(Math.max(horizontal, vertical) >= gap, `${label}: separate boxes with at least ${gap}px gap (${i}, ${j})`);
  }
}
export async function labelsDoNotOverlap(scope) {
  const bad = await scope.locator('label').evaluateAll(labels => labels.flatMap(label => {
    const input = label.querySelector('input,select,textarea,[role=textbox]'); if (!input) return [];
    const nodes = [...label.childNodes].filter(n => n.nodeType === Node.TEXT_NODE && n.textContent.trim());
    if (!nodes.length) return [];
    const range = document.createRange(); range.selectNodeContents(nodes[0]); const t = range.getBoundingClientRect(), r = input.getBoundingClientRect();
    if (!r.width || !r.height) return [];
    const overlap = Math.min(t.right,r.right) > Math.max(t.left,r.left) && Math.min(t.bottom,r.bottom) > Math.max(t.top,r.top);
    return overlap ? [label.textContent.trim()] : [];
  }));
  assert.deepEqual(bad, [], 'Labels do not overlap their controls');
}
export async function checkboxBeside(locator, name) {
  await expect(locator).toBeVisible();
  const layout = await locator.evaluate(input => { const label = input.closest('label'); const nodes = [...label.childNodes].filter(n => n.nodeType === Node.TEXT_NODE && n.textContent.trim()); const span = label.querySelector('span'); const range = document.createRange(); range.selectNodeContents(span ?? nodes[0]); const t = range.getBoundingClientRect(), r = input.getBoundingClientRect(); return { gap: t.left-r.right, center: Math.abs((t.top+t.bottom-r.top-r.bottom)/2) }; });
  assert.ok(layout.gap >= 4 && layout.center <= 8, `${name}: checkbox beside its own label (${JSON.stringify(layout)})`);
}
