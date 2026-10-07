import {z} from 'zod';
import type {FeatureContext} from '../../app/feature-context';
import {ApiProblem} from '../../app/problems';
import {requestHash} from '../../app/operations';
import {connection,adapterFor} from '../connectors/service';
import {NativeAdapter} from '../connectors/native';
import {resolveEffectAudience} from '../connectors/effect-audience';
import {requireEffectRun} from './authority';
import {requireWorkspaceOwner} from '../sharing/current-access';
import {requirePublicEvidence} from '../ai/disclosure';
import {resolveEvidence} from '../ai/evidence';
import {issueGrant} from './grants';
import {prepareEffect} from './service';
import {effectSchema} from './contracts';

export const nativeProposalSchema=z.object({runId:z.string(),connectionId:z.string(),target:z.string(),content:z.record(z.string(),z.unknown())}).strict();
export const nativeAuthorizationSchema=nativeProposalSchema.extend({operationKey:z.string(),expectedRevision:z.string(),expectedAudienceRevision:z.string(),expiresAt:z.string().datetime()});
type Proposal=z.infer<typeof nativeProposalSchema>;
/** Resolve every scope from the signed-in run and native source, never browser-supplied hashes. */
export async function previewNativeEffect(ctx:FeatureContext,input:Proposal){
 const run=await requireEffectRun(ctx,input.runId);
 if(run.kind!=='procedure'||!['queued','running','needs-review'].includes(run.status))throw new ApiProblem(409,'PROCEDURE_REQUIRED','Choose an active procedure before preparing a source change.');
 if(JSON.parse(run.input_json).evaluationCaseSetId)throw new ApiProblem(403,'EVALUATION_IS_NOT_AUTHORITY','An evaluation cannot authorize changes.');
 const row=await connection(ctx,input.connectionId),adapter=await adapterFor(ctx,row,ctx.sourceSecret);
 if(!(adapter instanceof NativeAdapter))throw new ApiProblem(422,'UNSUPPORTED_EFFECT','Choose a HappyToHelp or Orbit connection.');
 const operation=adapter.provider==='happytohelp'?'happytohelp.article.update':'orbit.handoff.upsert';
 const identity=await adapter.identity();
 if(!identity.capabilities.operations.includes(operation))throw new ApiProblem(403,'SCOPE_DENIED','Reconnect this source with the required change permission.');
 const before=await adapter.check(input.target);
 const parsed=effectSchema.parse({...input,operationKey:'preview-native-effect',grantId:'preview',accountId:identity.accountId,operation,expectedRevision:before.revision,expectedAudienceRevision:'preview',costMicros:0});
 const destination=await resolveEffectAudience(ctx,row.id,input.target,operation,ctx.sourceSecret,parsed.operation==='happytohelp.article.update'?parsed.content.status:undefined);
 const refs=JSON.parse(run.refs_json);let audience=JSON.parse(run.audience_json) as string[];
 if(destination.publicAudience||destination.unmappedCount||parsed.operation==='happytohelp.article.update'&&parsed.content.status==='published'){await requirePublicEvidence(ctx,refs);audience=[...new Set([...audience,'public'])];}
 else{await resolveEvidence(ctx,refs,destination.memberIds,{current:true});audience=[...new Set([...audience,...destination.memberIds])];}
 return {runId:input.runId,connectionId:row.id,provider:adapter.provider,accountId:identity.accountId,target:input.target,operation,content:parsed.content,expectedRevision:before.revision,expectedAudienceRevision:destination.audienceRevision,audience,sourceIds:refs.map((ref:{sourceId:string})=>ref.sourceId),contentHash:await requestHash(parsed.content),costMicros:0 as const};
}
export async function authorizeNativeEffect(ctx:FeatureContext,input:z.infer<typeof nativeAuthorizationSchema>){
 await requireWorkspaceOwner(ctx);
 const proposal=await previewNativeEffect(ctx,{runId:input.runId,connectionId:input.connectionId,target:input.target,content:input.content});
 if(proposal.expectedRevision!==input.expectedRevision||proposal.expectedAudienceRevision!==input.expectedAudienceRevision)throw new ApiProblem(409,'SOURCE_CHANGED','The source or its audience changed. Review a fresh proposal.');
 const grant=await issueGrant(ctx,{operationKey:input.operationKey+':grant',subjectId:ctx.actor.id,kind:'effect',expiresAt:input.expiresAt,scope:{operations:[proposal.operation],targets:[proposal.target],accounts:[proposal.accountId],sourceIds:proposal.sourceIds,audience:proposal.audience,maxCostMicros:0,contentHash:proposal.contentHash,conditions:{expectedRevision:proposal.expectedRevision,expectedAudienceRevision:proposal.expectedAudienceRevision},acceptNonAtomicProvider:false}});
 const effect=await prepareEffect(ctx,effectSchema.parse({operationKey:input.operationKey,runId:input.runId,grantId:grant.value.id,connectionId:proposal.connectionId,operation:proposal.operation,accountId:proposal.accountId,target:proposal.target,expectedRevision:proposal.expectedRevision,expectedAudienceRevision:proposal.expectedAudienceRevision,content:proposal.content,costMicros:0}));
 return {grantId:grant.value.id,effectId:effect.value.id,state:effect.value.state};
}
