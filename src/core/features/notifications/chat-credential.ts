import type {FeatureContext} from '../../app/feature-context';
import {decryptSecret} from '../../platform/secrets/custody';
import {connection,adapterFor} from '../connectors/service';
import {accessToken} from '../connectors/credentials';
import {assertConnectionCurrent} from '../connectors/authority';
import {ApiProblem} from '../../app/problems';
import {chatScope} from './chat-config';
export interface ChatCredentialRow{id:string;credential_ciphertext:string|null;source_connection_id?:string|null;source_connection_revision_id?:string|null}
export async function chatCredential(ctx:FeatureContext,row:ChatCredentialRow,key:string){
 if(!row.source_connection_id){if(!row.credential_ciphertext)throw new ApiProblem(403,'CHAT_AUTH_REVOKED','Reconnect Slack.');return decryptSecret(key,row.credential_ciphertext,chatScope(ctx.actor.workspaceId,row.id));}
 const source=await connection(ctx,row.source_connection_id);if(source.revision_id!==row.source_connection_revision_id||source.provider!=='slack')throw new ApiProblem(403,'CHAT_AUTH_REVOKED','Reconnect the notifier to the current Slack consent.');const identity=await(await adapterFor(ctx,source,key)).identity();const saved=JSON.parse(source.config_json);if(identity.accountId!==source.account_id||identity.principalId!==saved.principalId)throw new ApiProblem(403,'CHAT_AUTH_REVOKED','The Slack identity changed.');await assertConnectionCurrent(ctx,source);return accessToken(ctx,source,key);
}
