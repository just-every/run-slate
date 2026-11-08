import {pathToFileURL} from 'node:url';
import path from 'node:path';
const root=process.cwd();
const {withWorkspace,setupWorkspace}=await import(pathToFileURL(path.join(root,'tests/qualification/ui-convergence/browser-support.mjs')));
const {decisionStatesJourney}=await import(pathToFileURL(path.join(root,'tests/qualification/ui-convergence/decision-states-journey.mjs')));
for(const width of [1440,390]){
  await withWorkspace({width,height:width===1440?1000:844},'core-wiki',async state=>{
    await setupWorkspace(state);
    await decisionStatesJourney(state);
  });
}
console.log('DEC-002 focused native browser probe passed at 1440 and 390.');
