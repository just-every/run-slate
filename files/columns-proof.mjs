const root='/home/agent/rer-consolidation/work/sd-slate-c-f190/run-slate';
const {withWorkspace,setupWorkspace}=await import(root+'/tests/qualification/ui-convergence/browser-support.mjs');
const {beginTouchJourney}=await import(root+'/tests/qualification/ui-convergence/touch-journey.mjs');
const {columnsJourney}=await import(root+'/tests/qualification/ui-convergence/columns-journey.mjs');
for(const width of [1440,390]){
  await withWorkspace({width,height:width===1440?1000:844},'core-wiki',async state=>{
    await setupWorkspace(state);
    const touch=await beginTouchJourney(state,width);
    try{await columnsJourney(state,width,touch);}
    finally{await touch.close();}
  });
}
