import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {root} from '../../e2e/runtime-harness.mjs';
import {publicationChecks} from '../interface/publication.mjs';
import {withSecondPerson} from './two-people-support.mjs';

/** Fold the existing publication assertions into the loaded native browser journey. */
export async function publicationJourney(state) {
  const width=state.page.viewportSize().width;
  const directory=path.join(root,'.artifacts/ui-convergence/publication',String(width));
  await mkdir(directory,{recursive:true});
  const id=(await state.api('/api/pages')).items.find(item=>item.title==='Welcome').id;
  await withSecondPerson(state,width,async people=>{
    await publicationChecks({page:state.page,context:state.context,id,
      runtime:{origin:state.origin,directory},reader:people.bob,check:()=>{}});
  });
}
