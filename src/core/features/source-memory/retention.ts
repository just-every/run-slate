import {mutationGuard} from '../../app/operations';
import type {ConnectionRow} from '../connectors/types';
import {prepareEraseSource} from '../archive/erasure-source';
import type {FeatureContext} from '../../app/feature-context';
/** Provider 404 may hide permissions change: retained derivatives cannot remain disclosable. */
export async function invalidateSource(ctx:FeatureContext,id:string){await ctx.db.batch(await prepareEraseSource(ctx,id));}

/** Every staging write participates in the same atomic authorization check as publication. */
export function refreshGuards(ctx:FeatureContext,id:string,refreshId:string,connection:ConnectionRow){return [
 mutationGuard(ctx.db,"SELECT refresh_id=? AND state='active' FROM federation_sources WHERE id=?",[refreshId,id]),
 mutationGuard(ctx.db,"SELECT state='connected' AND revision_id=? FROM federation_connections WHERE id=?",[connection.revision_id,connection.id]),
 mutationGuard(ctx.db,'SELECT epoch=? FROM core_acl_epoch WHERE id=1',[ctx.authorizationEpoch!]),
 ];}
/** Only the refresh holding the source claim may discard its unpublished staging.
 * Erasure clears the claim and payload atomically; a later refresh owns its own data. */
export function discardUnpublishedRefresh(ctx:FeatureContext,id:string,refreshId:string,revisionId?:string){
 if(!revisionId)return [];
 const selected="SELECT r.id FROM federation_revisions r JOIN federation_sources s ON s.id=r.source_id WHERE r.id=? AND s.id=? AND s.refresh_id=? AND r.published_at IS NULL AND r.deleted_at IS NULL";
 return [ctx.db.prepare(`DELETE FROM federation_passages WHERE revision_id IN (${selected})`).bind(revisionId,id,refreshId),ctx.db.prepare(`DELETE FROM federation_revisions WHERE id IN (${selected})`).bind(revisionId,id,refreshId)];
}
