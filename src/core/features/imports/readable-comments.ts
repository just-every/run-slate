import type {JsonValue} from '../../shared/api/common';
import type {CommentArchive} from '../workspace-export/comment-archive';
import {ApiProblem} from '../../app/problems';
import {validateBlockContent} from '../editor/validation';

/** Refuse dangling identities rather than silently moving or dropping threads. */
export function validateReadableComments(data:CommentArchive,blocks:{id:string}[]):void{
 const unique=(ids:string[])=>new Set(ids).size===ids.length;
 if(!unique(data.authors.map(a=>a.id))||!unique(data.threads.map(t=>t.id))||!unique(data.threads.flatMap(t=>t.comments.map(c=>c.id))))throw new ApiProblem(400,'INVALID_COMMENT_ARCHIVE','Duplicate comment identities.');
 const authors=new Set(data.authors.map(a=>a.id)),blockIds=new Set(blocks.map(b=>b.id));
 for(const t of data.threads){
  if((t.kind==='inline'&&!t.orphaned&&(!t.blockId||!t.anchor))||(t.blockId&&!blockIds.has(t.blockId))||(t.resolvedBy&&!authors.has(t.resolvedBy)))throw new ApiProblem(400,'INVALID_COMMENT_ARCHIVE','Comment anchor or resolver is missing.');
  const comments=new Map(t.comments.map(c=>[c.id,c]));
  for(const c of t.comments){
   if(c.authorId&&!authors.has(c.authorId))throw new ApiProblem(400,'INVALID_COMMENT_ARCHIVE','Comment author is missing.');
   if(!c.deletedAt)validateBlockContent('paragraph',{text:c.body as JsonValue});
   const visited=new Set([c.id]);let parent=c.parentCommentId;
   while(parent){if(visited.has(parent)||!comments.has(parent))throw new ApiProblem(400,'INVALID_COMMENT_ARCHIVE','Comment reply relationship is invalid.');visited.add(parent);parent=comments.get(parent)!.parentCommentId;}
  }
 }
}
