import type {FeatureContext} from '../../app/feature-context';
import {ApiProblem} from '../../app/problems';
/** Unpublished native batches are recovery state, including in trash views. */
export async function requireImportPublication(ctx:FeatureContext,containerId:string) {
  const pending=await ctx.db.prepare("SELECT 1 FROM import_native_targets t JOIN federation_imports j ON j.id=t.import_id WHERE t.kind='container' AND t.target_id=? AND j.native_published=0 LIMIT 1").bind(containerId).first();
  if(pending)throw new ApiProblem(404,'NOT_FOUND','Not found.');
}
export const publishedImportContainerSql=(idExpression:string)=>`NOT EXISTS(SELECT 1 FROM import_native_targets it JOIN federation_imports ij ON ij.id=it.import_id WHERE it.kind='container' AND it.target_id=${idExpression} AND ij.native_published=0)`;
