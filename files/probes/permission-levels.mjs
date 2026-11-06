import { withWorkspace, setupWorkspace } from '../tests/qualification/ui-convergence/browser-support.mjs';
import { permissionLevelsJourney } from '../tests/qualification/ui-convergence/sharing-journey.mjs';
for (const width of [1440,390]) {
  await withWorkspace({ width, height: width===1440?1000:844 }, 'core-wiki', async state => {
    await setupWorkspace(state);
    await permissionLevelsJourney(state);
  });
}
