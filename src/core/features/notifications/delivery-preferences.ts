import {z} from 'zod';
import type {FeatureContext} from '../../app/feature-context';
import {currentSubject,requireWorkspaceOwner} from '../sharing/current-access';
import {personalMutation} from '../navigation/mutations';
import {notificationEvents} from './events';
export const deliveryModes=['default','in-app','immediate','daily','weekly'] as const;
export const deliveryPreferenceInput=z.object({operationKey:z.string().min(8).max(160),event:z.enum(notificationEvents),mode:z.enum(deliveryModes)}).strict();
export async function deliveryPreferences(ctx:FeatureContext){
 await currentSubject(ctx);
 const rows=await ctx.db.prepare('SELECT event,mode FROM notification_delivery_preferences WHERE member_id=? AND workspace_id=?').bind(ctx.actor.id,ctx.actor.workspaceId).all<{event:string;mode:typeof deliveryModes[number]}>();
 const settings=await ctx.db.prepare('SELECT section_names FROM notification_email_settings WHERE workspace_id=?').bind(ctx.actor.workspaceId).first<{section_names:number}>();
 return {items:notificationEvents.map(event=>({event,mode:rows.results.find(r=>r.event===event)?.mode??'default'})),sectionNames:!!settings?.section_names,canManage:ctx.actor.role==='owner'};
}
export async function setDeliveryPreference(ctx:FeatureContext,input:z.infer<typeof deliveryPreferenceInput>){
 return personalMutation(ctx,{operationKey:input.operationKey,action:'notification-preference.update',request:input,build:async revisionId=>({statements:[
 ctx.db.prepare('INSERT INTO notification_delivery_preferences(member_id,workspace_id,event,mode,revision_id,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(member_id,event) DO UPDATE SET mode=excluded.mode,revision_id=excluded.revision_id,updated_at=excluded.updated_at').bind(ctx.actor.id,ctx.actor.workspaceId,input.event,input.mode,revisionId,ctx.now),
 // Preference changes cancel prior intent; they never resurrect old mail.
 ctx.db.prepare("UPDATE notification_email_items SET state='cancelled' WHERE member_id=? AND state='pending' AND notification_id IN (SELECT id FROM notifications WHERE event=?)").bind(ctx.actor.id,input.event)
 ],value:{event:input.event,mode:input.mode}})});
}
export async function setNotificationSectionNames(ctx:FeatureContext,input:{operationKey:string;sectionNames:boolean}){
 await requireWorkspaceOwner(ctx);
 return personalMutation(ctx,{operationKey:input.operationKey,action:'notification-settings.update',request:input,authorize:()=>requireWorkspaceOwner(ctx),build:async()=>({statements:[ctx.db.prepare('INSERT INTO notification_email_settings(workspace_id,section_names) VALUES(?,?) ON CONFLICT(workspace_id) DO UPDATE SET section_names=excluded.section_names').bind(ctx.actor.workspaceId,+input.sectionNames)],value:{sectionNames:input.sectionNames}})});
}
