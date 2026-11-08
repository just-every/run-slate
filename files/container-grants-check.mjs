import test from 'node:test';
const base = new URL('file://' + process.cwd() + '/tests/qualification/ui-convergence/');
const {withWorkspace,setupWorkspace} = await import(new URL('browser-support.mjs',base));
const {containerGrantsJourney} = await import(new URL('container-grants-journey.mjs',base));
test('CONT-009 native container grants at 1440px', {timeout: 420000}, async () => {
  await withWorkspace({width:1440,height:1000},'core-wiki',async state=>{
    await setupWorkspace(state);
    await containerGrantsJourney(state,1440);
  },{RER_DEMO:'0'});
});
