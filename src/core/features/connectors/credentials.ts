import type {FeatureContext} from '../../app/feature-context';
import type {ConnectionRow} from './types';
import {decryptSecret,encryptSecret} from '../../platform/secrets/custody';
import {ApiProblem} from '../../app/problems';
import {mutationGuard} from '../../app/operations';
import {exchangeToken,type OAuthCredential} from './oauth-provider';
import {createUlid} from '../../shared/ulid';
export async function accessToken(ctx:FeatureContext,snapshot:ConnectionRow,secret:string){
 // A captured connection is an authority generation, not a credential cache.
 const row=await ctx.db.prepare("SELECT * FROM federation_connections WHERE id=? AND revision_id=? AND state='connected'").bind(snapshot.id,snapshot.revision_id).first<ConnectionRow>();
 if(!row?.credential_ciphertext)throw new ApiProblem(403,'SOURCE_ACCESS_REVOKED','Reconnect the source identity.');
 const raw=await decryptSecret(secret,row.credential_ciphertext,`connector:${row.id}`);if(!raw.startsWith('{'))return raw;
 const value=JSON.parse(raw) as OAuthCredential;if(!value.expiresAt||value.expiresAt>Date.now()+60000)return value.accessToken;
 if(!value.refreshToken)throw new ApiProblem(403,'OAUTH_CONSENT_REQUIRED','The source authorization expired. Reconnect.');
 const claim=createUlid();
 try{
 await ctx.db.batch([mutationGuard(ctx.db,"SELECT refresh_claim IS NULL AND state='connected' AND revision_id=? AND credential_ciphertext=? FROM federation_connections WHERE id=?",[row.revision_id,row.credential_ciphertext,row.id]),ctx.db.prepare('UPDATE federation_connections SET refresh_claim=? WHERE id=?').bind(claim,row.id)]);
 const refreshed=await exchangeToken(value.provider,{grant_type:'refresh_token',refresh_token:value.refreshToken,client_id:value.clientId,client_secret:value.clientSecret});
 const encrypted=await encryptSecret(secret,JSON.stringify({...value,...refreshed,refreshToken:refreshed.refreshToken??value.refreshToken}),`connector:${row.id}`);
 await ctx.db.batch([mutationGuard(ctx.db,"SELECT refresh_claim=? AND state='connected' AND revision_id=? AND credential_ciphertext=? FROM federation_connections WHERE id=?",[claim,row.revision_id,row.credential_ciphertext,row.id]),ctx.db.prepare('UPDATE federation_connections SET credential_ciphertext=?,refresh_claim=NULL,updated_at=? WHERE id=?').bind(encrypted,ctx.now,row.id)]);
 return refreshed.accessToken;
 }catch(error){
 // Never invalidate a successful newer rotation or a concurrent reconnect.
 await ctx.db.prepare("UPDATE federation_connections SET state='needs-attention',refresh_claim=NULL WHERE id=? AND refresh_claim=? AND revision_id=? AND credential_ciphertext=?").bind(row.id,claim,row.revision_id,row.credential_ciphertext).run();throw error;
 }
}
