import {z} from 'zod';
import type {FeatureContext} from '../../app/feature-context';
import {ApiProblem} from '../../app/problems';
import {currentSubject,requireContainerLevel,resolveCurrentAccessMany} from '../sharing/current-access';
import {can} from '../sharing/access';
import {containerListAccess} from '../containers/list-access';
import {publishedImportContainerSql} from '../imports/publication';
import {postCoverUrl} from './cover';
import {postByline} from './byline';
import {postMetadataSchema,type PostFeed,type PostFeedItem} from './types';

export const postQuerySchema=z.object({
 containerId:z.string().min(1).max(160).optional(),
 following:z.enum(['true','false']).optional(),
 cursor:z.string().max(1000).optional(),
 limit:z.coerce.number().int().min(1).max(50).default(12),
}).strict();
type Query=z.infer<typeof postQuerySchema>;
interface Row {id:string;containerId:string;publishedRevisionId:string;properties:string;publishedAt:string}
const cursorSchema=z.tuple([z.string().datetime({offset:true}),z.string().min(1).max(160)]);
function cursorValue(value?:string):[string,string]|undefined {
 if(!value)return;
 try {return cursorSchema.parse(JSON.parse(decodeURIComponent(value)));}
 catch {throw new ApiProblem(400,'INVALID_CURSOR','This post cursor is invalid.');}
}
const cursorFor=(row:Pick<PostFeedItem,'publishedAt'|'id'>)=>encodeURIComponent(JSON.stringify([row.publishedAt,row.id]));

/** Always read the published snapshot, including for an editor with newer drafts. */
export async function queryPosts(ctx:FeatureContext,input:Query):Promise<PostFeed> {
 const subject=await currentSubject(ctx);
 if(input.containerId)await requireContainerLevel(ctx,input.containerId,'view');
 const levels=input.containerId?await containerListAccess(ctx,[input.containerId],subject):new Map();
 const canCreate=!!input.containerId&&['edit','full'].includes(levels.get(input.containerId)??'');
 let cursor=cursorValue(input.cursor);
 const visible:PostFeedItem[]=[];
 // Continue past inaccessible candidates, so neither counts nor pagination disclose them.
 while(visible.length<=input.limit) {
  const rows=(await ctx.db.prepare(`SELECT p.id,p.container_id AS containerId,p.published_revision_id AS publishedRevisionId,r.properties_json AS properties,json_extract(r.properties_json,'$.post.publishedAt') AS publishedAt
   FROM pages p JOIN page_revisions r ON r.id=p.published_revision_id AND r.page_id=p.id
   JOIN containers c ON c.id=p.container_id
   WHERE p.workspace_id=? AND p.lifecycle IN ('live','live-with-unpublished-changes')
    AND p.deleted_at IS NULL AND p.trashed_at IS NULL AND p.archived_at IS NULL
    AND c.trashed_at IS NULL AND c.archived_at IS NULL AND r.deleted_at IS NULL
    AND json_type(r.properties_json,'$.post')='object' AND json_type(r.properties_json,'$.post.publishedAt')='text'
    AND ${publishedImportContainerSql('c.id')}
    AND NOT EXISTS(SELECT 1 FROM import_native_targets it JOIN federation_imports ij ON ij.id=it.import_id WHERE it.kind='page' AND it.target_id=p.id AND ij.native_published=0)
    ${input.containerId?'AND p.container_id=?':''}
    ${input.following==='true'?'AND (EXISTS(SELECT 1 FROM page_watches pw WHERE pw.page_id=p.id AND pw.member_id=? AND pw.enabled=1) OR EXISTS(SELECT 1 FROM container_watches cw WHERE cw.container_id=p.container_id AND cw.member_id=?))':''}
    ${cursor?"AND (json_extract(r.properties_json,'$.post.publishedAt')<? OR (json_extract(r.properties_json,'$.post.publishedAt')=? AND p.id<?))":''}
   ORDER BY publishedAt DESC,p.id DESC LIMIT 100`)
   .bind(ctx.actor.workspaceId,...input.containerId?[input.containerId]:[],...input.following==='true'?[ctx.actor.id,ctx.actor.id]:[],...cursor?[cursor[0],cursor[0],cursor[1]]:[]).all<Row>()).results;
  if(!rows.length)break;
  const access=await resolveCurrentAccessMany(ctx,rows.map(row=>row.id),{subject});
  for(const row of rows) {
   const permission=access.get(row.id);
   if(!permission||!can(permission.decision,'view'))continue;
   const properties=JSON.parse(row.properties),parsed=postMetadataSchema.safeParse(properties.post);
   if(!parsed.success||!parsed.data.publishedAt)continue;
   const post=parsed.data,publishedAt=parsed.data.publishedAt;
   const [comments,byline,coverUrl]=await Promise.all([
    ctx.db.prepare('SELECT COUNT(*) AS count FROM comments c JOIN comment_threads t ON t.id=c.thread_id WHERE t.page_id=? AND t.workspace_id=? AND c.deleted_at IS NULL')
     .bind(row.id,ctx.actor.workspaceId).first<{count:number}>(),
    postByline(ctx,post),postCoverUrl(ctx,properties.coverFileId??null),
   ]);
   visible.push({id:row.id,containerId:row.containerId,title:properties.title,publishedRevisionId:row.publishedRevisionId,publishedAt,
    author:{memberId:byline.memberId,displayName:byline.displayName},coverUrl,...(properties.cover&&!properties.coverFileId?{cover:properties.cover}:{}),commentCount:comments?.count??0});
   if(visible.length>input.limit)break;
  }
  if(visible.length>input.limit||rows.length<100)break;
  const last=rows.at(-1)!;cursor=[last.publishedAt,last.id];
 }
 const items=visible.slice(0,input.limit);
 return {items,canCreate,nextCursor:visible.length>input.limit?cursorFor(items.at(-1)!):null};
}
