import type {FeatureContext} from '../../app/feature-context';
import {ApiProblem} from '../../app/problems';
import {shareIntent,shareNotification} from './messages';
import {identityRevision} from '../workspace/revisions';
export async function invitationShare(ctx:FeatureContext,shareId:string,pageId:string,email:string){
 const intent=await shareIntent(ctx,shareId,pageId);
 if(!intent.emails.includes(email.toLowerCase()))throw new ApiProblem(400,'INVALID_RECIPIENT','This address was not selected for this share.');
 return intent;
}
export async function invitationShareRevision(ctx:FeatureContext,revisionId:string,invitationId:string,shareId:string,pageId:string){
 return identityRevision(ctx,revisionId,'invitation-share',invitationId,{shareId,pageId});
}
export async function acceptedShareStatements(ctx:FeatureContext,invitationId:string,pageId:string,memberId:string){
 const row=await ctx.db.prepare("SELECT content_json FROM core_entity_revisions WHERE workspace_id=? AND entity_kind='invitation-share' AND entity_id=? ORDER BY id DESC LIMIT 1").bind(ctx.actor.workspaceId,invitationId).first<{content_json:string}>();
 if(!row)return [];
 const link=JSON.parse(row.content_json) as {shareId?:string;pageId?:string};
 if(!link.shareId||link.pageId!==pageId)return [];
 const intent=await shareIntent(ctx,link.shareId,pageId);
 return shareNotification(ctx,pageId,link.shareId,memberId,intent.message);
}
