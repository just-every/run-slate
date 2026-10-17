import {dispatchDueReminders} from '../reminders/delivery';
import type { AppBindings,AuthenticatedMember } from '../../app/types';
import type { NotificationContext } from './visibility';
import { processNotificationOutbox } from './outbox';
import { deliverChat,reconcileChat } from './chat-delivery';
import { readRuntimeConfig } from '../../platform/config/runtime';
export async function scheduledDiscovery(env:AppBindings):Promise<void>{
 const localDevelopment=env.LOCAL_DEVELOPMENT==='true'&&readRuntimeConfig(env,true).localDevelopment;
 const members=await env.DB.prepare("SELECT m.id,m.workspace_id AS workspaceId,m.email,m.display_name AS displayName,m.role,w.name AS workspaceName FROM members m JOIN workspaces w ON w.id=m.workspace_id WHERE m.status='active' AND m.id=(SELECT id FROM members m2 WHERE m2.workspace_id=m.workspace_id AND m2.status='active' ORDER BY CASE WHEN role='owner' THEN 0 ELSE 1 END,id LIMIT 1)").all<Omit<AuthenticatedMember,'initials'>>();
 for(const member of members.results){const ctx:NotificationContext={db:env.DB,files:env.FILES,jobs:env.JOBS,actor:{...member,initials:member.displayName.slice(0,2)},now:new Date().toISOString(),localDevelopment,sourceSecret:env.CONNECTOR_CREDENTIALS_KEY};await dispatchDueReminders(ctx);let drained;do{drained=await processNotificationOutbox(ctx);}while(drained.processed===100);await deliverChat(ctx,{credentialKey:env.CONNECTOR_CREDENTIALS_KEY,appUrl:env.APP_URL});await reconcileChat(ctx,{credentialKey:env.CONNECTOR_CREDENTIALS_KEY});}
 await env.DB.prepare('DELETE FROM discovery_snapshots WHERE expires_at<=?').bind(new Date().toISOString()).run();
}
export async function handleDiscoveryJob(env:AppBindings,job:unknown):Promise<boolean>{if(!job||typeof job!=='object'||(job as {type?:string}).type!=='discovery.deliver')return false;await scheduledDiscovery(env);return true;}
