import assert from 'node:assert/strict';
import { expect } from '@playwright/test';

/**
 * One header system: every destination mounts the same top bar and the same page title, and the content column of every
 * destination starts on the same left edge. Read from the rendered document, so a destination that grows its own header fails here.
 */
async function headerMeasure(page) {
  return page.evaluate(() => {
    const topbars = [...document.querySelectorAll('.topbar')];
    const title = document.querySelector('.page-title');
    const bar = topbars[0]?.getBoundingClientRect();
    const barStyle = topbars[0] && getComputedStyle(topbars[0]);
    const titleStyle = title && getComputedStyle(title);
    return {
      topbars: topbars.length,
      height: bar && Math.round(bar.height),
      divider: barStyle && `${barStyle.borderBottomWidth} ${barStyle.borderBottomStyle} ${barStyle.borderBottomColor}`,
      location: topbars[0]?.querySelector('.crumbs [aria-current="page"]')?.textContent?.trim(),
      titles: document.querySelectorAll('h1.page-title, textarea.page-title').length,
      title: titleStyle && { family: titleStyle.fontFamily, size: titleStyle.fontSize, weight: titleStyle.fontWeight, left: Math.round(title.getBoundingClientRect().left) },
      pageEyebrows: document.querySelectorAll('.main > p.eyebrow').length,
    };
  });
}

export async function sharedHeaderJourney({ page, origin }, pageId) {
  const destinations = ['/app', '/app/search', '/app/inbox', '/app/containers', '/app/templates', '/app/archive', '/app/settings', `/app/pages/${pageId}`];
  const seen = [];
  for (const path of destinations) {
    await page.goto(origin + path, { waitUntil: 'networkidle' });
    await expect(page.locator('.page-title').first()).toBeVisible();
    const measured = await headerMeasure(page);
    assert.equal(measured.topbars, 1, `${path}: exactly one top bar`);
    assert.ok(measured.location, `${path}: the top bar names the current location`);
    assert.equal(measured.titles, 1, `${path}: exactly one visible page title`);
    assert.equal(measured.pageEyebrows, 0, `${path}: no ad-hoc eyebrow above the title`);
    seen.push({ path, ...measured });
  }
  const [first, ...rest] = seen;
  for (const other of rest) {
    assert.equal(other.height, first.height, `${other.path}: top bar height matches ${first.path}`);
    assert.equal(other.divider, first.divider, `${other.path}: top bar divider matches ${first.path}`);
    assert.deepEqual({ ...other.title, left: 0 }, { ...first.title, left: 0 }, `${other.path}: title family, size and weight match ${first.path}`);
    assert.equal(other.title.left, first.title.left, `${other.path}: content column starts on the same left edge as ${first.path}`);
  }
}
