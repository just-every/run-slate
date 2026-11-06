import { pathToFileURL } from 'node:url';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const root = process.cwd();
const packet = path.join(process.env.HOME, 'rer-consolidation/work/sd-slate-c-f187/packet');
const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const { withWorkspace, setupWorkspace } = await import(pathToFileURL(`${root}/tests/qualification/ui-convergence/browser-support.mjs`));
const { permissionLevelsJourney } = await import(pathToFileURL(`${root}/tests/qualification/ui-convergence/sharing-journey.mjs`));
const width = 390, screenDir = path.join(packet, 'screens', String(width));
await mkdir(screenDir, { recursive: true });
await withWorkspace({ width, height: 844 }, 'core-wiki', async state => {
  await setupWorkspace(state);
  const browser = state.context.browser(), originalContext = browser.newContext.bind(browser);
  browser.newContext = async (...args) => {
    const context = await originalContext(...args), originalPage = context.newPage.bind(context);
    context.newPage = async (...pageArgs) => {
      const page = await originalPage(...pageArgs), originalShot = page.screenshot.bind(page);
      page.screenshot = async options => {
        const buffer = await originalShot(options);
        const name = path.basename(options?.path ?? '').replace(/^\d+-390-/, '');
        if (/^(full|edit|comment|view)-.*\.png$/.test(name)) {
          await writeFile(path.join(screenDir, name), buffer);
          const evidence = JSON.parse(await readFile(options.path.replace(/\.png$/, '.json'), 'utf8'));
          assert.equal(evidence.artifact.commit, head);
          await writeFile(path.join(screenDir, name.replace(/\.png$/, '.json')), JSON.stringify(evidence, null, 2));
        }
        return buffer;
      };
      return page;
    };
    return context;
  };
  try {
    await permissionLevelsJourney(state);
    const matrix = JSON.parse(await readFile(path.join(root, '.artifacts/ui-convergence/permission-levels/390/matrix.json'), 'utf8'));
    assert.equal(matrix.extended, true);
    assert.equal(matrix.records.filter(item => item.read).length, 4);
    await writeFile(path.join(packet, 'native-390-matrix.json'), JSON.stringify(matrix, null, 2) + '\n');
  } finally { browser.newContext = originalContext; }
});
console.log(`CANDIDATE_BROWSER_PROOF head=${head} width=390`);
