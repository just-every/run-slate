import {chatIdentities,chatChannels,connectAuthorizedChat} from './chat-consent';
import { personalJson } from '../navigation/request';
import { Hono,type Context } from 'hono';
import type { AppEnvironment } from '../../app/types';
import { featureContext } from '../../app/feature-context';
import type { NotificationContext } from './visibility';
const notificationContext=(c:Context<AppEnvironment>):NotificationContext=>({...featureContext(c),sourceSecret:c.env.CONNECTOR_CREDENTIALS_KEY});
import { requireWorkspaceOwner } from '../sharing/current-access';
import { notificationList,notificationAction,today } from './service';
import { chatConnection,connectChat,disconnectChat } from './chat-config';
import { chatDeliveryHistory } from './chat-delivery';
export function createNotificationsRoutes(){const app=new Hono<AppEnvironment>();app.use('*',personalJson);app.get('/',async c=>{const q=c.req.query();return c.json(await notificationList(notificationContext(c),{cursor:q.cursor,limit:q.limit?Number(q.limit):undefined,audience:q.audience==='direct'?'direct':q.audience==='watched'?'watched':undefined,archived:q.archived==='true'}));});app.get('/today',async c=>c.json(await today(notificationContext(c))));app.post('/actions',async c=>c.json(await notificationAction(notificationContext(c),await c.req.json())));app.get('/chat',async c=>c.json({connection:await chatConnection(notificationContext(c))}));app.post('/chat',async c=>{
 const input=await c.req.json();
 const config={credentialKey:c.env.CONNECTOR_CREDENTIALS_KEY,appUrl:c.env.APP_URL};
 // NOTIF-003: an owner can install one bot destination in the default wiki.
 // OAuth source identities remain the separate flagship CONNECT-001 path.
 return c.json(await (typeof input?.token==='string'
  ? connectChat(notificationContext(c),config,input)
  : connectAuthorizedChat(notificationContext(c),config,input)));
});app.delete('/chat/:id',async c=>c.json(await disconnectChat(notificationContext(c),{...await c.req.json(),id:c.req.param('id')})));app.get('/chat/identities',async c=>c.json(await chatIdentities(notificationContext(c))));app.get('/chat/channels',async c=>c.json(await chatChannels(notificationContext(c),{credentialKey:c.env.CONNECTOR_CREDENTIALS_KEY},c.req.query('connectionId')??'')));app.get('/chat/deliveries',async c=>{const ctx=notificationContext(c);await requireWorkspaceOwner(ctx);return c.json({items:(await chatDeliveryHistory(ctx)).results});});return app;}
