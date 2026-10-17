import {z} from 'zod';
import type {FeatureContext} from '../../app/feature-context';
import {createPage} from '../pages/service';

export const createPostSchema=z.object({
 operationKey:z.string().min(8).max(160),
 containerId:z.string().min(1).max(160),
 title:z.string().trim().min(1).max(1000),
}).strict();

/** The native editor, publication, watches and comments remain the page's doors. */
export function createPost(ctx:FeatureContext,input:z.infer<typeof createPostSchema>) {
 return createPage(ctx,{...input,lifecycle:'draft',properties:{post:{origin:'native',publishedAt:null,authorMemberId:ctx.actor.id}}});
}
