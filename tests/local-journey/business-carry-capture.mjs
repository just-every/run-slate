import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function captureBusinessCarry(evidence, label, target) {
  for (const width of [1440, 390]) {
    await target.setViewportSize({ width, height: 1000 });
    await target.screenshot({ path: join(evidence, 'shots', `${label}-${width}.png`), fullPage: true });
    const details = await target.evaluate(() => ({
      path: location.pathname + location.search,
      text: document.body.innerText,
      inputs: [...document.querySelectorAll('input,textarea')].map(el => ({
        id: el.id, value: el.value, disabled: el.disabled,
      })),
      iconControls: [...document.querySelectorAll('button,a')]
        .filter(el => el.getBoundingClientRect().width && !el.textContent.trim())
        .map(el => ({
          label: el.getAttribute('aria-label'),
          title: el.getAttribute('title'),
          tooltip: el.getAttribute('data-tooltip'),
        })),
      workspaceNames: [...document.querySelectorAll('[data-testid="workspace-name"]')]
        .map(el => ({ text: el.textContent, visible: !!el.getBoundingClientRect().width })),
      mobileWorkspaceName: document.querySelector('.mobile-bar [data-rer-name]')?.textContent,
      mobileWorkspaceVisible: !!document.querySelector('.mobile-bar [data-rer-name]')?.getBoundingClientRect().width,
    }));
    if (details.workspaceNames.length) {
      if (width === 1440) assert.ok(details.workspaceNames[0].visible, 'desktop rail shows the saved name');
      else {
        assert.ok(details.mobileWorkspaceVisible, 'mobile workspace bar is visible');
        assert.equal(details.mobileWorkspaceName, details.workspaceNames[0].text);
      }
    }
    await writeFile(join(evidence, 'text', `${label}-${width}.json`), JSON.stringify(details, null, 2) + '\n');
  }
  console.log(`Captured ${label} at 1440 and 390`);
}
