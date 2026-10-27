import assert from 'node:assert/strict';
import { writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { expect as baseExpect } from '@playwright/test';
const expect = baseExpect.configure({ timeout: 30_000 });
export function createBusinessCarryRestart({ page, context, origin, carryFile, evidence, timeline, slowRestarts }) {
  let carryChange = 0;
  const name = () => page.getByLabel('Workspace name', { exact: true });
  return async function changeCarry(value) {
    const began = Date.now();
    const navigation = page.waitForNavigation({ waitUntil: 'commit', timeout: 30_000 });
    if (value) await writeFile(carryFile, JSON.stringify(value) + '\n');
    else await rm(carryFile);
    const automatic = await navigation;
    assert.equal(automatic.status(), 200, 'automatic restart document must succeed');
    assert.match(automatic.headers()['content-type'], /text\/html/);
    const detail = { documentMs: Date.now() - began, documentStatus: automatic.status() };
    timeline.push(detail);
    const setup = new URL(page.url()).pathname === '/setup';
    if (setup) await expect(name()).toHaveValue(value?.name ?? '');
    else await expect(page.getByRole('textbox', { name: 'Page title', exact: true })).toHaveValue('Welcome');
    detail.visibleMs = Date.now() - began;
    const repliesTask = Promise.all(['/api/workspace', ...(setup ? [] : [new URL(page.url()).pathname.replace('/app/', '/api/')])].map(async path => {
      try {
        const response = await context.request.get(origin + path, { timeout: 10_000 });
        const reply = { path, status: response.status(), body: await response.json(), atMs: Date.now() - began };
        (detail.replies ??= []).push(reply);
        return reply;
      } catch (error) {
        const reply = { path, status: null, error: error.name, atMs: Date.now() - began };
        (detail.replies ??= []).push(reply);
        return reply;
      }
    }));
    await page.waitForLoadState('load', { timeout: 30_000 });
    detail.loadMs = Date.now() - began;
    if (setup) await expect(name()).toBeEnabled();
    detail.interactiveMs = Date.now() - began;
    const replies = await repliesTask;
    assert.ok(replies.every(reply => reply.status === 200));
    const automaticMs = Date.now() - began;
    console.log('Automatic document and API timing ' + automaticMs + 'ms');
    if (automaticMs > 10_000) slowRestarts.push(automaticMs);
    const manualBegan = Date.now();
    const manual = await page.reload({ waitUntil: 'load', timeout: 10_000 });
    assert.equal(manual.status(), 200);
    if (setup) await expect(name()).toHaveValue(value?.name ?? '');
    else await expect(page.getByRole('textbox', { name: 'Page title', exact: true })).toHaveValue('Welcome');
    const details = { ...detail, automaticStatus: automatic.status(), automaticMs, manualStatus: manual.status(), manualMs: Date.now() - manualBegan, replies };
    await writeFile(join(evidence, 'text', `restart-${++carryChange}.json`), JSON.stringify(details, null, 2) + '\n');
    console.log(`Carry ${value ? 'write' : 'removal'} automatic document and APIs ${automaticMs}ms; explicit reload ${details.manualMs}ms; all 200`);
  };
}
