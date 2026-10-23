import {z} from 'zod';
import type {FeatureContext} from '../../app/feature-context';
import {ApiProblem} from '../../app/problems';
import {grantRecipients} from './recipients';
import {recipientContext} from '../notifications/outbox';
import {requirePageLevel} from './current-access';
import {permitted} from '../search/visibility';
export const shareRecipientsSchema=z.array(z.discriminatedUnion('kind',[
 z.object({kind:z.literal('member'),id:z.string().min(1).max(128)}).strict(),
 z.object({kind:z.literal('group'),id:z.string().min(1).max(128)}).strict(),
 z.object({kind:z.literal('email'),email:z.string().trim().toLowerCase().email().max(254)}).strict()
])).min(1).max(20);
export async function messageRecipients(ctx:FeatureContext,pageId:string,selections:z.infer<typeof shareRecipientsSchema>){
 const ids=new Set<string>(),emails=new Set<string>();
 for(const selection of selections){
  if(selection.kind==='email'){
   const member=await ctx.db.prepare("SELECT id FROM members WHERE workspace_id=? AND lower(email)=? AND status='active'").bind(ctx.actor.workspaceId,selection.email).first<{id:string}>();
   if(member)ids.add(member.id);else emails.add(selection.email);
  }else{
   if(selection.kind==='group'&&!await ctx.db.prepare('SELECT 1 FROM groups WHERE id=? AND workspace_id=?').bind(selection.id,ctx.actor.workspaceId).first())throw new ApiProblem(400,'INVALID_RECIPIENT','Choose an available person or group.');
   const members=await grantRecipients(ctx,selection.kind,selection.id);
   if(selection.kind==='member'&&!members.length)throw new ApiProblem(400,'INVALID_RECIPIENT','Choose an available person or group.');
   for(const id of members)ids.add(id);
  }
 }
 if(ids.size>100)throw new ApiProblem(400,'RECIPIENT_LIMIT','Share with at most 100 people at a time.');
 const readable:{id:string;displayName:string}[]=[],needsAccess:{id:string;displayName:string}[]=[];
 for(const id of ids){
  if(id===ctx.actor.id)continue;
  const recipient=await recipientContext(ctx,id);if(!recipient)continue;
  (await permitted(()=>requirePageLevel(recipient,pageId,'view'))?readable:needsAccess).push({id,displayName:recipient.actor.displayName});
 }
 return {readable,needsAccess,emails:[...emails]};
}
