import {plainContent} from '../editor/validation';
import type {JsonValue} from '../../shared/api/common';
import type {BlockView} from '../../shared/api/content';
import type {FeatureContext} from '../../app/feature-context';
import {listComments} from '../comments/list';
import {html} from '../publishing/html';
import {htmlText} from './rich-text';
import {commentArchiveSchema,type CommentArchive} from './comment-archive';

interface ExportComment {id:string;threadId:string;parentCommentId:string|null;authorMemberId:string|null;authorDisplayName:string|null;body:JsonValue[]|null;createdAt:string;updatedAt:string;deletedAt:string|null}

/** Use the same reader projection as the comments panel, including tombstones. */
export async function exportComments(ctx:FeatureContext,pageId:string,blocks:BlockView[],canEdit:boolean):Promise<CommentArchive>{
 const listed=await listComments(ctx,pageId),data={...listed,comments:listed.comments as unknown as ExportComment[]},authors=new Map<string,string>();
 const visibleBlocks=new Map(blocks.map(b=>[b.id,b]));
 data.threads=data.threads.filter(t=>{if(t.kind!=='inline'||canEdit)return true;const block=visibleBlocks.get(t.block_id);const anchor=t.anchor_json?JSON.parse(t.anchor_json):null;return !!block&&typeof anchor?.quote==='string'&&anchor.quote.length>0&&plainContent(block.content).includes(anchor.quote);});
 const threadIds=new Set(data.threads.map(t=>t.id));data.comments=data.comments.filter(c=>threadIds.has(c.threadId));
 for(const c of data.comments)if(c.authorMemberId)authors.set(c.authorMemberId,c.authorDisplayName??'');
 for(const t of data.threads)if(t.resolved_by_member_id){const member=await ctx.db.prepare('SELECT display_name FROM members WHERE id=? AND workspace_id=?').bind(t.resolved_by_member_id,ctx.actor.workspaceId).first<{display_name:string}>();if(member)authors.set(t.resolved_by_member_id,member.display_name);}
 return commentArchiveSchema.parse({version:1,authors:[...authors].map(([id,displayName])=>({id,displayName})),threads:data.threads.map(t=>({id:t.id,kind:t.kind,blockId:visibleBlocks.has(t.block_id)?t.block_id:null,anchor:t.anchor_json?JSON.parse(t.anchor_json):null,state:t.state,resolvedAt:t.resolved_at,resolvedBy:t.resolved_by_member_id,orphaned:!!t.orphaned||(t.kind==='inline'&&!visibleBlocks.has(t.block_id)),createdAt:t.created_at,updatedAt:t.updated_at,comments:data.comments.filter(c=>c.threadId===t.id).map(c=>({id:c.id,parentCommentId:c.parentCommentId,authorId:c.authorMemberId,body:c.body,createdAt:c.createdAt,updatedAt:c.updatedAt,deletedAt:c.deletedAt}))}))});
}
export const blockAnchor=(id:string)=>`slate-block-${id}`;
export function commentsHtml(data:CommentArchive):string{
 const authors=new Map(data.authors.map(a=>[a.id,a.displayName]));
 return `<section aria-label="Comments"><h2>Comments</h2>${data.threads.map(t=>`<article id="slate-thread-${html(t.id)}" data-state="${t.state}"><h3>${t.blockId?`<a href="#${html(blockAnchor(t.blockId))}">Inline thread</a>`:t.kind==='inline'?'Inline thread (anchor unavailable)':'Page thread'} · ${t.state}</h3>${t.anchor?.quote?`<blockquote>${html(t.anchor.quote)}</blockquote>`:''}<p>Created <time>${html(t.createdAt)}</time>; updated <time>${html(t.updatedAt)}</time>${t.resolvedAt?`; resolved <time>${html(t.resolvedAt)}</time>${t.resolvedBy?` by ${html(authors.get(t.resolvedBy)??'')}`:''}`:''}</p>${t.comments.map(c=>`<div id="slate-comment-${html(c.id)}"${c.parentCommentId?` data-parent-comment="${html(c.parentCommentId)}"`:''}><p>${html(c.authorId?authors.get(c.authorId)??'':'')} · <time>${html(c.createdAt)}</time> · updated <time>${html(c.updatedAt)}</time></p>${c.deletedAt?`<p>Deleted <time>${html(c.deletedAt)}</time></p>`:`<p>${htmlText(c.body)}</p>`}</div>`).join('')}</article>`).join('')}</section>`;
}
