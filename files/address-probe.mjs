import path from 'node:path';
import { pathToFileURL } from 'node:url';
const fromRoot = name => import(pathToFileURL(path.join(process.cwd(), name)).href);
const { withWorkspace, setupWorkspace } = await fromRoot('tests/qualification/ui-convergence/browser-support.mjs');
const { templateScopeJourney } = await fromRoot('tests/qualification/ui-convergence/template-scope-journey.mjs');
for (const width of [1440, 390]) {
  await withWorkspace({ width, height: width === 1440 ? 1000 : 844 }, 'core-wiki', async state => {
    await setupWorkspace(state);
    await templateScopeJourney(state);
  });
  console.log(`FOCUSED_TEMPLATE_WIDTH=${width} PASS`);
}
