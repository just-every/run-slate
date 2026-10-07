import type {FeatureContext} from '../../app/feature-context';
/** Resolve retained parent identity, never page content. Erasure keeps the tombstone's ACL. */
export async function activityPageId(ctx:FeatureContext,kind:string,id:string):Promise<string|undefined>{
 if(['page','record','page-status'].includes(kind))return id;
 const query:Record<string,string>={database:'SELECT page_id FROM databases WHERE id=?',revision:'SELECT page_id FROM page_revisions WHERE id=?',comment:'SELECT t.page_id FROM comments c JOIN comment_threads t ON t.id=c.thread_id WHERE c.id=?','comment-thread':'SELECT page_id FROM comment_threads WHERE id=?'};
 return query[kind]?(await ctx.db.prepare(query[kind]).bind(id).first<{page_id:string}>())?.page_id:undefined;
}
