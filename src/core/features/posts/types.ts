import {z} from 'zod';

/** A post is an ordinary page. Its kind and byline travel with each revision. */
export const postMetadataSchema=z.object({
 origin:z.enum(['native','import']),
 publishedAt:z.string().datetime().refine(value=>{const date=new Date(value);return Number.isFinite(date.getTime())&&date.toISOString()===value;},'Use an ISO UTC publication date.').nullable(),
 authorMemberId:z.string().min(1).max(160).nullable(),
 historicalAuthor:z.object({displayName:z.string().min(1).max(1000),sourceId:z.string().min(1).max(1000).optional()}).strict().optional(),
}).strict();
export type PostMetadata=z.infer<typeof postMetadataSchema>;

export interface PostFeedItem {
 id:string;
 containerId:string;
 title:string;
 publishedRevisionId:string;
 publishedAt:string;
 author:{memberId:string|null;displayName:string};
 coverUrl:string|null;
 cover?:{kind:"gallery";id:string}|{kind:"link";url:string};
 commentCount:number;
}
export interface PostFeed {items:PostFeedItem[];nextCursor:string|null;canCreate:boolean}
