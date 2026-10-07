import type { FeatureContext } from '../../app/feature-context';
import { requestHash } from '../../app/operations';
import { ApiProblem } from '../../app/problems';
import { pageRow, snapshot } from '../pages/repository';
import { descendants } from '../pages/tree';
import { requirePageLevel } from '../sharing/current-access';
import { contentPolicy } from '../pages/policy';
import { publicationLocation } from './publication-location';
import { publicationAudience } from './publication-audience';
import { publicationPreviewSchema, type PublicationInput, type ScheduledChoices } from './publication-input';

export async function previewPublication(ctx:FeatureContext,id:string,raw:unknown) {
  ctx.authorizationEpoch=undefined;
  const input={...publicationPreviewSchema.parse(raw),operationKey:'publication-preview'};
  await requirePageLevel(ctx,id,input.generalAccess?'full':'edit');
  const page=await pageRow(ctx,id);
  if(page.revision_id!==input.expectedRevisionId)throw new ApiProblem(409,'REVISION_CONFLICT','The page changed. Reload before reviewing publication.');
  await publicationLocation(ctx,page,input);
  const review=await publicationReview(ctx,id,input);
  const epoch=(await ctx.db.prepare('SELECT epoch FROM core_acl_epoch WHERE id=1').first<{epoch:number}>())!.epoch;
  if(epoch!==ctx.authorizationEpoch)throw new ApiProblem(409,'PUBLICATION_PREVIEW_CHANGED','Access changed. Review publication again.');
  return {...review,previewFingerprint:await requestHash({review,epoch,actorId:ctx.actor.id})};
}
export async function publicationReview(ctx:FeatureContext,id:string,input:PublicationInput,saved?:ScheduledChoices) {
  if(!saved) {
    const prior=await ctx.db.prepare("SELECT publication_json FROM content_schedules WHERE page_id=? AND state IN ('scheduled','failed')").bind(id).first<{publication_json:string|null}>();
    if(prior?.publication_json)saved=JSON.parse(prior.publication_json);
  }
  const page=await pageRow(ctx,id),location=await publicationLocation(ctx,page,input);
  const pages=(await descendants(ctx,id)).sort((a,b)=>a.id.localeCompare(b.id));
  // A review never reveals a descendant the actor cannot read.
  for(const p of pages)await requirePageLevel(ctx,p.id,'view');
  const content=await snapshot(ctx,page);
  if(input.publishAsMemberId) {
    const member=await ctx.db.prepare("SELECT display_name FROM members WHERE id=? AND workspace_id=? AND status='active'").bind(input.publishAsMemberId,ctx.actor.workspaceId).first<{display_name:string}>();
    if(!member)throw new ApiProblem(400,'INVALID_ATTRIBUTION','Choose an active member.');
    content.properties.byline=member.display_name;
  }
  const destination=(await ctx.db.prepare('SELECT id,name FROM containers WHERE id=?').bind(location.target.containerId).first<{id:string;name:string}>())!;
  const parent=location.target.parentPageId?await pageRow(ctx,location.target.parentPageId):null;
  const audience=await publicationAudience(ctx,page,pages,location.target,input,saved);
  return {pageId:id,expectedRevisionId:input.expectedRevisionId,destination:{...location.target,containerName:destination.name,parentTitle:parent?.title??null},content,
    options:{generalAccess:input.generalAccess??null,label:input.label??null,publishAt:input.publishAt??null,publishAsMemberId:input.publishAsMemberId??null},
    descendants:pages.filter(p=>p.id!==id).map(p=>({pageId:p.id,title:p.title,revisionId:p.revision_id,containerId:location.target.containerId,parentPageId:p.parent_page_id,lifecycle:p.lifecycle})),
    audience,...(location.publicAccess.length?{publicAccess:location.publicAccess}:{}),policies:await contentPolicy(ctx)};
}
export type PublicationReview=Awaited<ReturnType<typeof publicationReview>>;
/** Store the reviewed release itself. Staging changes root lifecycle/revision and before-access only. */
export function releaseReview(review:PublicationReview) {
  const {expectedRevisionId:_,...release}=review;
  return {...release,audience:review.audience.map(p=>({pageId:p.pageId,readers:p.readers.filter(r=>r.after).map(({before:_,...reader})=>reader)}))};
}
export type PublicationReleaseReview=ReturnType<typeof releaseReview>;
export function previewConflict():never {throw new ApiProblem(409,'PUBLICATION_PREVIEW_CHANGED','Publication content, destination or audience changed. Review publication again.');}

export type PublicationPreviewResponse=Awaited<ReturnType<typeof previewPublication>>;
