import {env} from 'cloudflare:test';
import {createApi} from '../../../src/core/app/hono';
import type {FeatureContext} from '../../../src/core/app/feature-context';
import {readImport} from '../../../src/core/features/imports/jobs';
import {sessionFor} from '../setup/fixtures';
/** Existing space-flow fixtures use the same native session-bound review doors
 * as the product. Document-format fixtures keep their existing direct helper. */
export async function applyReviewedSpace(ctx:FeatureContext,id:string) {
 const cookie=await sessionFor(ctx.actor.id),app=createApi();
 const invoke=async(action:string,body:unknown={})=>{
  const response=await app.request(`https://slate.example/api/imports/${id}/${action}`,{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify(body)},env);
  const result=await response.json() as {state:string;report:{fingerprint?:string}};
  if(!response.ok)throw new Error(`Import ${action} failed: ${response.status}`);return result;
 };
 let current=await readImport(ctx,id);
 if(['queued','failed'].includes(current.state))await invoke('preview');
 current=await readImport(ctx,id);
 if(current.state==='preview')await invoke('apply',{fingerprint:JSON.parse(current.report_json).fingerprint});
 for(let index=0;index<150;index++){current=await readImport(ctx,id);if(current.state==='completed')return current;await invoke('resume');}
 throw new Error('Import did not complete within its fixture bounds.');
}
