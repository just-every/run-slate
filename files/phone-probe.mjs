const base = 'file:///home/agent/rer-consolidation/work/sd-slate-c-f201/run-slate/';
const { withWorkspace, setupWorkspace } = await import(base + 'tests/qualification/ui-convergence/browser-support.mjs');
const { permissionLevelsJourney } = await import(base + 'tests/qualification/ui-convergence/sharing-journey.mjs');
const width = Number(process.argv[2] ?? 1440);
await withWorkspace({ width, height: width === 1440 ? 1000 : 844 }, 'core-wiki', async state => {
  await setupWorkspace(state);
  await permissionLevelsJourney(state);
});
