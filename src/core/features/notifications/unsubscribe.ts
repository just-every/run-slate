import type {AppBindings} from '../../app/types';
import {ApiProblem} from '../../app/problems';
export async function unsubscribeDigest(token:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))),n=>n.toString(16).padStart(2,'0')).join('');}
export async function unsubscribeNotifications(env:AppBindings,token:string){
 if(!/^[a-f0-9]{64}$/.test(token))throw new ApiProblem(404,'NOT_FOUND','This unsubscribe link is unavailable.');
 const hash=await unsubscribeDigest(token),row=await env.DB.prepare("SELECT t.* FROM notification_unsubscribe_tokens t JOIN members m ON m.id=t.member_id AND m.workspace_id=t.workspace_id AND m.status='active' WHERE token_hash=?").bind(hash).first<{member_id:string;workspace_id:string;events_json:string}>();
 if(!row)throw new ApiProblem(404,'NOT_FOUND','This unsubscribe link is unavailable.');
 const now=new Date().toISOString(),events=JSON.parse(row.events_json) as string[];
 await env.DB.batch([...events.map(event=>env.DB.prepare("INSERT INTO notification_delivery_preferences(member_id,workspace_id,event,mode,revision_id,updated_at) VALUES(?,?,?,'in-app',?,?) ON CONFLICT(member_id,event) DO UPDATE SET mode='in-app',revision_id=excluded.revision_id,updated_at=excluded.updated_at").bind(row.member_id,row.workspace_id,event,crypto.randomUUID(),now)),env.DB.prepare("UPDATE notification_email_items SET state='cancelled' WHERE member_id=? AND state='pending' AND notification_id IN (SELECT id FROM notifications WHERE event IN (SELECT value FROM json_each(?)))").bind(row.member_id,row.events_json)]);
 return {unsubscribed:true,message:'Email stopped for these events. Your in-app inbox remains available.'};
}
