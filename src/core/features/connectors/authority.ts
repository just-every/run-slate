import type {FeatureContext} from '../../app/feature-context';
import type {ConnectionRow} from './types';
import {currentSubject} from '../sharing/current-access';
import {ApiProblem} from '../../app/problems';
/** Revalidate the captured grant generation at every post-I/O disclosure/dispatch boundary. */
export async function assertConnectionCurrent(ctx:FeatureContext,row:ConnectionRow){
 await currentSubject(ctx);
 const current=await ctx.db.prepare("SELECT revision_id FROM federation_connections WHERE id=? AND workspace_id=? AND member_id=? AND account_id=? AND state='connected' AND credential_ciphertext IS NOT NULL").bind(row.id,ctx.actor.workspaceId,ctx.actor.id,row.account_id).first<{revision_id:string}>();
 const epoch=await ctx.db.prepare('SELECT epoch FROM core_acl_epoch WHERE id=1').first<{epoch:number}>();
 if(!current||current.revision_id!==row.revision_id||epoch?.epoch!==ctx.authorizationEpoch)throw new ApiProblem(403,'SOURCE_ACCESS_REVOKED','Source authority changed. Refresh the connection and retry.');
}
