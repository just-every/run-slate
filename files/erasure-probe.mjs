const base = 'file:///home/agent/rer-consolidation/work/sd-slate-c-f201/run-slate/';
const { withWorkspace, setupWorkspace } = await import(base + 'tests/qualification/ui-convergence/browser-support.mjs');
const { withSecondPerson } = await import(base + 'tests/qualification/ui-convergence/two-people-support.mjs');
const { permissionPermanentDeleteMatrix } = await import(base + 'tests/qualification/ui-convergence/sharing-lifecycle-matrix.mjs');
await withWorkspace({ width:1440, height:1000 }, 'core-wiki', async state => {
  await setupWorkspace(state);
  await withSecondPerson(state,1440,async({bob})=>{
    const records=[];
    for(const level of ['full','edit','comment','view']) await permissionPermanentDeleteMatrix({state,bob,api:state.api,level,records});
  });
});
