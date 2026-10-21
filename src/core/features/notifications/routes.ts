import {z} from 'zod';
import {parseBody} from '../workspace/routes';
import {notificationEvents} from './events';
import {requireStepUp} from '../session/step-up';
import {requireChatOwner} from './chat-authority';
import {chatIdentities,chatChannels,connectAuthorizedChat} from './chat-consent';
import { personalJson } from '../navigation/request';
import { Hono,type Context } from 'hono';
import type { AppEnvironment } from '../../app/types';
import { featureContext } from '../../app/feature-context';
import type { NotificationContext } from './visibility';
const notificationContext=(c:Context<AppEnvironment>):NotificationContext=>({...featureContext(c),sourceSecret:c.env.CONNECTOR_CREDENTIALS_KEY});
import { requireWorkspaceOwner } from '../sharing/current-access';
import { notificationList,notificationAction,today } from './service';
import { chatConnection,chatDestinations,connectChat,disconnectChat } from './chat-config';
import { chatDeliveryHistory } from './chat-delivery';
const destinationInput=z.object({operationKey:z.string().min(8).max(160),expectedRevisionId:z.string().min(1).optional(),provider:z.enum(['slack','teams']).optional(),containerId:z.string().min(1).max(160).nullable().optional(),channel:z.string().min(1).max(401),token:z.string().min(1).max(10000).optional(),events:z.array(z.enum(notificationEvents)).max(notificationEvents.length),connectionId:z.string().min(1).optional(),connectionRevisionId:z.string().min(1).optional()}).strict().refine(input=>!!input.token||((input.provider??'slack')==='slack'&&!!input.connectionId&&!!input.connectionRevisionId),'Supply a provider credential or connected Slack identity.');
export function createNotificationsRoutes(){const app=new Hono<AppEnvironment>();app.use('*',personalJson);
app.get('/chat/destinations',async c=>c.json(await chatDestinations(notificationContext(c))));
const saveDestination=async(c:Context<AppEnvironment>,id?:string)=>{const input={...await parseBody(c.req,destinationInput),...(id?{id}:{})};await requireChatOwner(notificationContext(c),input.containerId??null);await requireStepUp(c,'credentials:mint');const config={credentialKey:c.env.CONNECTOR_CREDENTIALS_KEY,appUrl:c.env.APP_URL,multiple:true};return c.json(await (typeof input.token==='string'?connectChat(notificationContext(c),config,{...input,token:input.token}):connectAuthorizedChat(notificationContext(c),config,{...input,connectionId:input.connectionId??'',connectionRevisionId:input.connectionRevisionId??''})));};
app.post('/chat/destinations',c=>saveDestination(c));
app.put('/chat/destinations/:id',c=>saveDestination(c,c.req.param('id')));
app.get('/chat/destinations/:id/deliveries',async c=>c.json({items:(await chatDeliveryHistory(notificationContext(c),c.req.param('id'))).results}));
app.get('/',async c=>{const q=c.req.query();return c.json(await notificationList(notificationContext(c),{cursor:q.cursor,limit:q.limit?Number(q.limit):undefined,audience:q.audience==='direct'?'direct':q.audience==='watched'?'watched':undefined,archived:q.archived==='true'}));});app.get('/today',async c=>c.json(await today(notificationContext(c))));app.post('/actions',async c=>c.json(await notificationAction(notificationContext(c),await c.req.json())));app.get('/chat',async c=>c.json({connection:await chatConnection(notificationContext(c))}));app.post('/chat',async c=>{
 const input=await c.req.json();
 const config={credentialKey:c.env.CONNECTOR_CREDENTIALS_KEY,appUrl:c.env.APP_URL};
 // NOTIF-003: an owner can install one bot destination in the default wiki.
 // OAuth source identities remain the separate flagship CONNECT-001 path.
 return c.json(await (typeof input?.token==='string'
  ? connectChat(notificationContext(c),config,input)
  : connectAuthorizedChat(notificationContext(c),config,input)));
});app.delete('/chat/:id',async c=>c.json(await disconnectChat(notificationContext(c),{...await c.req.json(),id:c.req.param('id')})));app.get('/chat/identities',async c=>c.json(await chatIdentities(notificationContext(c))));app.get('/chat/channels',async c=>c.json(await chatChannels(notificationContext(c),{credentialKey:c.env.CONNECTOR_CREDENTIALS_KEY},c.req.query('connectionId')??'')));app.get('/chat/deliveries',async c=>{const ctx=notificationContext(c);await requireWorkspaceOwner(ctx);return c.json({items:(await chatDeliveryHistory(ctx)).results});});return app;}
