import type {JsonValue} from '../../shared/api/common';
import type {FeatureContext} from '../../app/feature-context';
import type {CommentArchive} from '../workspace-export/comment-archive';
import {validateBlockContent} from '../editor/validation';

/** Historical custody only: no actor impersonation, watches, or notifications. */
export function prepareImportedComments(ctx:FeatureContext,data:CommentArchive,pageId:string,pageRevisionId:string,idFor:(kind:string,id:string)=>string):D1PreparedStatement[]{
 const statements:D1PreparedStatement[]=[];
 for(const t of data.threads){
  const threadId=idFor('comment-thread',t.id),revision=idFor('comment-thread-revision',t.id);
  const anchor=t.anchor?{...t.anchor,anchorId:idFor('comment-anchor',t.anchor.anchorId)}:null;
  statements.push(ctx.db.prepare('INSERT INTO comment_threads (id,workspace_id,page_id,kind,block_id,anchor_json,anchor_revision_id,state,resolved_at,resolved_by_member_id,orphaned,created_at,updated_at,revision_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(threadId,ctx.actor.workspaceId,pageId,t.kind,t.blockId?idFor('block',t.blockId):null,anchor?JSON.stringify(anchor):null,t.kind==='inline'?pageRevisionId:null,t.state,t.resolvedAt,t.resolvedBy?idFor('member',t.resolvedBy):null,t.orphaned?1:0,t.createdAt,t.updatedAt,revision));
  const pending=new Map(t.comments.map(c=>[c.id,c]));
  while(pending.size)for(const [id,c]of pending){if(c.parentCommentId&&pending.has(c.parentCommentId))continue;
   const body=c.deletedAt?[]:(validateBlockContent('paragraph',{text:c.body as JsonValue}) as {text:unknown}).text;
   statements.push(ctx.db.prepare('INSERT INTO comments (id,thread_id,parent_comment_id,author_member_id,body_json,created_at,updated_at,deleted_at,revision_id) VALUES (?,?,?,?,?,?,?,?,?)').bind(idFor('comment',id),threadId,c.parentCommentId?idFor('comment',c.parentCommentId):null,c.authorId?idFor('member',c.authorId):null,JSON.stringify(body),c.createdAt,c.updatedAt,c.deletedAt,idFor('comment-revision',id)));pending.delete(id);
  }
 }
 return statements;
}
