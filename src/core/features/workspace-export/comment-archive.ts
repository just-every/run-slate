import {z} from 'zod';
const time=z.string().datetime({offset:true});
const author=z.object({id:z.string(),displayName:z.string()});
const comment=z.object({id:z.string(),parentCommentId:z.string().nullable(),authorId:z.string().nullable(),body:z.array(z.unknown()).nullable(),createdAt:time,updatedAt:time,deletedAt:time.nullable()});
const thread=z.object({id:z.string(),kind:z.enum(['page','inline']),blockId:z.string().nullable(),anchor:z.object({anchorId:z.string(),quote:z.string().optional()}).passthrough().nullable(),state:z.enum(['open','resolved']),resolvedAt:time.nullable(),resolvedBy:z.string().nullable(),orphaned:z.boolean(),createdAt:time,updatedAt:time,comments:z.array(comment)});
export const commentArchiveSchema=z.object({version:z.literal(1),authors:z.array(author),threads:z.array(thread)});
export type CommentArchive=z.infer<typeof commentArchiveSchema>;
