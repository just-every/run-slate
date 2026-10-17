import type {FeatureContext} from '../../app/feature-context';
import type {PostMetadata} from './types';

export async function postByline(ctx:FeatureContext,post:PostMetadata) {
 const member=post.authorMemberId?await ctx.db.prepare('SELECT display_name,status FROM members WHERE id=? AND workspace_id=?')
  .bind(post.authorMemberId,ctx.actor.workspaceId).first<{display_name:string;status:string}>():null;
 return {
  memberId:member&&member.status!=='removed'?post.authorMemberId:null,
  displayName:post.authorMemberId?member&&member.status!=='removed'?member.display_name:'Former member':post.historicalAuthor?.displayName??'Former member',
  publishedAt:post.publishedAt,
 };
}
