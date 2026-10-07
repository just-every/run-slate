import type {FeatureContext} from '../../app/feature-context';
import {ApiProblem} from '../../app/problems';
import {createUlid} from '../../shared/ulid';
import {stagePortabilityJob,runPortabilityJob} from './jobs';
/** Synchronous compatibility entry points retain final results without post-restore authentication. */
export async function exportWorkspace(ctx:FeatureContext,input?:{operationKey:string}){
 const staged=await stagePortabilityJob(ctx,'export',input?.operationKey??`export:${createUlid()}`);
 const result=staged.state==='queued'?await runPortabilityJob(ctx,staged.id):staged;
 if(result.state==='failed')throw new ApiProblem(409,result.report.code??'EXPORT_FAILED',result.report.message??'Export failed.');
 return {id:result.id,state:result.state,counts:result.counts};
}
export async function restoreWorkspace(ctx:FeatureContext,bytes:Uint8Array){
 const staged=await stagePortabilityJob(ctx,'restore',`restore:${createUlid()}`,bytes);
 const result=staged.state==='queued'?await runPortabilityJob(ctx,staged.id):staged;
 if(result.state!=='completed')throw new ApiProblem(409,result.report.code??'RESTORE_FAILED',result.report.message??'Restore failed.');
 return {state:'completed',restoreId:result.restoreId!,counts:result.counts,reconnect:result.reconnect!};
}
