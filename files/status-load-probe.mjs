import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { setupWorkspace, withWorkspace } from './browser-support.mjs';
import { statusVocabularyJourney } from './status-vocabulary-journey.mjs';
test('retirement response under controlled six-second hosted delay', {timeout:300000}, async()=>{
 await withWorkspace({width:1440,height:1000},'core-wiki',async state=>{
  await setupWorkspace(state);
  await state.context.route('**/api/status',async route=>{
   const request=route.request();
   if(request.method()==='POST'&&request.postDataJSON().retire){
    const response=await route.fetch({maxRetries:0});
    console.log('RETIREMENT_COMMITTED',response.status());
    await delay(6000);
    await route.fulfill({response});
   } else await route.continue();
  });
  await statusVocabularyJourney(state,1440);
 },{RER_DEMO:'0'});
});
