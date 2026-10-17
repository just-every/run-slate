import type {FeatureContext} from '../../app/feature-context';
import type {PageCreateInput} from '../pages/types';
import {prepareCreatePage,type PostPlacement} from '../pages/service';

/** Only successfully prepared INSERTs enter this invocation's new-destination set.
 * They remain invisible during staged import. Existing destinations keep all guards. */
export function importCreationPlan(){
 const created={containers:new Set<string>(),pages:new Set<string>()};
 return {
  container(id:string){created.containers.add(id);},
  async page(ctx:FeatureContext,input:PageCreateInput,revisionId:string,post?:PostPlacement){
   const plan=await prepareCreatePage(ctx,input,revisionId,created,post);
   created.pages.add(plan.value.pageId);
   return plan;
  },
 };
}
