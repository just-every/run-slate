import type {FeatureContext} from '../../../src/core/app/feature-context';
import {publishPage as commit} from '../../../src/core/features/lifecycle/publication';
import {previewPublication} from '../../../src/core/features/lifecycle/publication-preview';
import type {PublicationInput} from '../../../src/core/features/lifecycle/publication-input';
const reviewed=new Map<string,string>();
/** Model one review followed by confirmation/retries with the same operation identity. */
export async function publishPage(ctx:FeatureContext,id:string,input:PublicationInput) {
 if(!input.destination&&!input.generalAccess&&!input.previewFingerprint)return commit(ctx,id,input);
 const identity=`${ctx.actor.id}:${id}:${input.operationKey}`;
 let previewFingerprint=input.previewFingerprint??reviewed.get(identity);
 if(!previewFingerprint){previewFingerprint=(await previewPublication(ctx,id,input)).previewFingerprint;reviewed.set(identity,previewFingerprint);}
 return commit(ctx,id,{...input,previewFingerprint});
}
