const base = 'file:///home/agent/rer-consolidation/work/sd-slate-c-f201/run-slate/';
const { withWorkspace, setupWorkspace, openPageAction, accessible } = await import(base + 'tests/qualification/ui-convergence/browser-support.mjs');
const { withSecondPerson, restrictedPage, grant, ok } = await import(base + 'tests/qualification/ui-convergence/two-people-support.mjs');
const { expect } = await import(base+'node_modules/@playwright/test/index.mjs');
for(const width of [1440,390]) {
  await withWorkspace({width,height:width===1440?1000:844},'core-wiki',async state=>{
    await setupWorkspace(state);
    const {id,revisionId,...fields}=await state.api('/api/workspace');
    await ok(state.context,state.origin,'PUT','/api/workspace',{...fields,operationKey:crypto.randomUUID(),expectedRevisionId:revisionId,policies:{...fields.policies,'page.lifecycle.v1':'draft-then-publish'}});
    await withSecondPerson(state,width,async({bob})=>{
      for(const level of ['full','edit']) {
        const {pageId}=await restrictedPage(state,`Publication control ${level}`,['Current response guidance.']);
        await grant(state.context,state.origin,pageId,bob.id,level);
        const document=await state.api(`/api/pages/${pageId}`);
        await ok(state.context,state.origin,'POST',`/api/pages/${pageId}/publish`,{operationKey:crypto.randomUUID(),expectedRevisionId:document.page.revisionId});
        await bob.page.goto(`${state.origin}/app/pages/${pageId}`,{waitUntil:'networkidle'});
        await bob.page.reload({waitUntil:'networkidle'});
        await openPageAction(bob.page,'Publish workspace revision');
        const dialog=bob.page.getByRole('dialog',{name:'Publish this revision',exact:true});
        const schedule=dialog.locator('input[name="publishAt"]');
        await schedule.scrollIntoViewIfNeeded();
        await expect(schedule).toBeVisible();
        if(level==='edit')await expect(schedule).toBeDisabled();else await expect(schedule).toBeEnabled();
        const geometry=await schedule.evaluate(element=>({fontSize:getComputedStyle(element).fontSize,labelFontSize:getComputedStyle(element.parentElement).fontSize,rect:element.getBoundingClientRect().toJSON(),viewport:{width:innerWidth,height:innerHeight}}));
        console.log('CONTROL_PROOF',JSON.stringify({width,level,geometry}));
        await accessible(bob.page,`${level} schedule control visible after reload`);
        await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
      }
    });
  });
}
