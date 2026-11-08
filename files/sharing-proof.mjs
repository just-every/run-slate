import test from 'node:test';
import { setupWorkspace, withWorkspace } from '../tests/qualification/ui-convergence/browser-support.mjs';
import { shareJourney } from '../tests/qualification/ui-convergence/sharing-journey.mjs';
import { ok } from '../tests/qualification/ui-convergence/two-people-support.mjs';
for (const [width, run] of [[390, 1], [390, 2], [1440, 1]]) {
  test(`merged sharing proof ${width} repeat ${run}`, {timeout: 300000}, async () => {
    await withWorkspace({width, height: width === 390 ? 844 : 1000}, 'core-wiki', async state => {
      await setupWorkspace(state);
      const space = (await state.api('/api/containers')).items.find(item => item.name === 'Handbook');
      const blocks = ['Keep this unsent detail.', 'Second block: record the next action.'].map((text,index) => ({id:crypto.randomUUID(),blockType:'paragraph',content:{text:[{text}]},treePosition:`a${index}`}));
      const created = await ok(state.context,state.origin,'POST','/api/pages',{operationKey:crypto.randomUUID(),containerId:space.id,title:'Sharing journey proof',blocks});
      const id=created.value.pageId;
      const document=await state.api(`/api/pages/${id}`);
      await ok(state.context,state.origin,'POST',`/api/pages/${id}/publish`,{operationKey:crypto.randomUUID(),expectedRevisionId:document.page.revisionId});
      await shareJourney(state,id);
    });
  });
}
