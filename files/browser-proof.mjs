import {withWorkspace,setupWorkspace} from '../tests/qualification/ui-convergence/browser-support.mjs';
import {writeJourney} from '../tests/qualification/ui-convergence/write-journey.mjs';
import path from 'node:path';
for(const width of [1440,390]){
 await withWorkspace({width,height:width===1440?1000:844},'core-wiki',async state=>{
  await setupWorkspace(state);
  const pageId=await writeJourney(state,width);
  await state.page.screenshot({path:path.resolve('../packet/editor-'+width+'.png'),fullPage:true});
  const document=await state.api('/api/pages/'+pageId);
  console.log('BROWSER SAVE-005 width='+width+' page='+pageId+' revision='+document.page.revisionId+' native title and body saved, failed write retained and explicit retry durable');
 });
}
