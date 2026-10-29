import {z} from 'zod';
import type {AppBindings} from '../../app/types';
import {resolveEvidence} from '../ai/evidence';
import {evidenceSchema} from '../ai/contracts';
import {authorizeSdk} from './sdk-credentials';
import {job,standard} from './tool';
import {sensitiveKinds} from './classification';

export function evidenceTools(env:AppBindings) {
 // Source, decision and skill evidence remain behind their native flagship
 // profile. Page evidence is the same immutable revision readers use in the wiki.
 const reference=env.SLATE_PROFILE==='flagship'?evidenceSchema:evidenceSchema.extend({kind:z.literal('page')});
 const schema=z.object({refs:z.array(reference).min(1).max(100),audience:z.array(z.string().min(1)).min(1).max(100)});
 const read=async(a:z.infer<typeof schema>,ctx:Parameters<typeof resolveEvidence>[0])=>{
  await authorizeSdk(ctx,'read_evidence',a.refs.map(ref=>ref.sourceId),a.audience);
  return resolveEvidence(ctx,a.refs,a.audience);
 };
 return [job(env,{name:'evidence.read',title:'Read immutable evidence for a permitted native audience',clauses:['AI-004','AI-007','AI-013',...(env.SLATE_PROFILE==='flagship'?['SOURCE-002']:[])],schema,readOnly:true,classes:['standard','sensitive'],classify:async(a,c)=>{const kinds=sensitiveKinds(await read(a,c));return kinds.length?[{class:'sensitive',facts:{measure:1,kind:kinds.join(', ')}}]:standard();},run:async(a,c)=>({items:await read(a,c)})})];
}
