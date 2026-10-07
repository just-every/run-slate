import type {FeatureContext} from '../../app/feature-context';
import {resolveEvidence} from '../ai/evidence';
import type {EvidenceInput} from '../ai/contracts';
import {requirePageLevel} from '../sharing/current-access';
/** All representations of a trial, including nested inquiry summaries, share this fence. */
export async function requireTrialDisclosure(ctx:FeatureContext,trial:{id:string;plan_json:string}){
 const plan=JSON.parse(trial.plan_json) as {refs:EvidenceInput[];measurement?:{subjects:{pageId:string}[]}};
 await resolveEvidence(ctx,plan.refs,[ctx.actor.id]);
 for(const subject of plan.measurement?.subjects??[])await requirePageLevel(ctx,subject.pageId,'view');
 const observations=(await ctx.db.prepare('SELECT refs_json FROM intelligence_observations WHERE experiment_id=?').bind(trial.id).all<{refs_json:string}>()).results;
 for(const observation of observations)await resolveEvidence(ctx,JSON.parse(observation.refs_json),[ctx.actor.id]);
}

/** Freeze every source whose information can enter the learned method, including measurement pages. */
export async function trialLearningRefs(ctx:FeatureContext,trial:{id:string;inquiry_id:string;plan_json:string},inquiry:{refs_json:string}){
 const plan=JSON.parse(trial.plan_json) as {refs:EvidenceInput[];measurement?:{subjects:{pageId:string}[]}};
 const refs:EvidenceInput[]=[...JSON.parse(inquiry.refs_json),...plan.refs];
 const packets=await ctx.db.batch([
  ctx.db.prepare('SELECT refs_json FROM intelligence_observations WHERE experiment_id=?').bind(trial.id),
  ctx.db.prepare('SELECT refs_json FROM intelligence_analyses WHERE inquiry_id=?').bind(trial.inquiry_id),
  ctx.db.prepare('SELECT refs_json FROM intelligence_artifacts WHERE inquiry_id=?').bind(trial.inquiry_id),
  ctx.db.prepare('SELECT evidence_json AS refs_json FROM intelligence_hypotheses WHERE inquiry_id=? AND evidence_json IS NOT NULL').bind(trial.inquiry_id),
 ]);
 for(const packet of packets)for(const row of packet.results as {refs_json:string}[])refs.push(...JSON.parse(row.refs_json));
 for(const subject of plan.measurement?.subjects??[]){
  await requirePageLevel(ctx,subject.pageId,'view');
  const page=await ctx.db.prepare('SELECT working_revision_id FROM pages WHERE id=? AND workspace_id=? AND deleted_at IS NULL').bind(subject.pageId,ctx.actor.workspaceId).first<{working_revision_id:string}>();
  if(!page)throw new Error('Measurement provenance is unavailable.');
  refs.push({kind:'page',sourceId:subject.pageId,revisionId:page.working_revision_id});
 }
 return [...new Map(refs.map(ref=>[JSON.stringify([ref.kind,ref.sourceId,ref.revisionId,ref.passageId??null]),ref])).values()];
}
