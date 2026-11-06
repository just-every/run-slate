import {pathToFileURL} from 'node:url';
const root=process.cwd();
const {withWorkspace,setupWorkspace}=await import(pathToFileURL(root+'/tests/qualification/ui-convergence/browser-support.mjs'));
const {transferJobsJourney}=await import(pathToFileURL(root+'/tests/qualification/ui-convergence/transfer-jobs-journey.mjs'));
const width=Number(process.argv[2]??1440);
await withWorkspace({width,height:width===1440?1000:844},'core-wiki',async state=>{
  await setupWorkspace(state);
  await transferJobsJourney(state);
},{},{scheduled:true});
console.log(JSON.stringify({probe:'transferJobsJourney',width,status:'passed'}));
