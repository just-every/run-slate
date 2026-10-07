import type {FeatureContext} from '../../app/feature-context';
import {prepareEraseIntelligence} from './erasure-intelligence';
import {prepareEraseLegacy} from './erasure-legacy';
import {prepareInvalidateExports} from '../portability/invalidation';
/** Opaque local source/revision tombstones continue resolving as unavailable, without provider identity. */
export async function prepareEraseSource(ctx:FeatureContext,id:string){return [
 ...prepareInvalidateExports(ctx),...prepareEraseLegacy(ctx,[id]),...await prepareEraseIntelligence(ctx,[id]),
 ctx.db.prepare("UPDATE federation_sources SET remote_id='erased:'||id,state='deleted',published_revision_id=NULL,refresh_id=NULL,updated_at=? WHERE id=? AND workspace_id=?").bind(ctx.now,id,ctx.actor.workspaceId),
 ctx.db.prepare('DELETE FROM federation_passages WHERE revision_id IN (SELECT id FROM federation_revisions WHERE source_id=?)').bind(id),
 ctx.db.prepare("UPDATE federation_revisions SET title='',acl_json='{}',remote_revision='erased:'||id,content_hash='',deleted_at=? WHERE source_id=?").bind(ctx.now,id),
 ctx.db.prepare("UPDATE core_entity_revisions SET content_json='{}',content_hash='',author_member_id=NULL WHERE workspace_id=? AND entity_kind='source' AND entity_id=?").bind(ctx.actor.workspaceId,id),
 ];}
