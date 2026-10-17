import type {FeatureContext} from '../../app/feature-context';
/** Preserve the post and original date while removing its erased author's identity. */
export function erasePostAuthor(ctx:FeatureContext,memberId:string):D1PreparedStatement[]{
 return [ctx.db.prepare("UPDATE page_revisions SET properties_json=json_remove(json_set(properties_json,'$.post.authorMemberId',NULL),'$.post.historicalAuthor') WHERE json_extract(properties_json,'$.post.authorMemberId')=?").bind(memberId)];
}
