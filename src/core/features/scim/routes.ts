import { Hono } from 'hono';
import type { AppEnvironment } from '../../app/types';
import { authenticateScim, auditScimRead } from './context';
import { scimBody, scimJson, scimError, ScimError } from './protocol';
import { providerConfig, resourceTypes, schemaDefinitions, discoveryList } from './discovery';
import { getUser, listUsers } from './user-view';
import { createUser, replaceUser, deleteUser } from './user-mutations';
import { applyUserPatch } from './user-input';
import { getGroup, listGroups, writeGroup, deleteGroup } from './groups';
import { applyGroupPatch } from './group-input';
export { createScimAdminRoutes } from './credentials';

/** Mount at /scim/v2 before native session middleware. Every endpoint requires a dedicated credential. */
export function createScimRoutes() {
  const app=new Hono<AppEnvironment>();
  for(const [path,get] of [
    ['/ServiceProviderConfig',()=>providerConfig()],
    ['/ResourceTypes',()=>discoveryList(resourceTypes)],
    ['/Schemas',()=>discoveryList(schemaDefinitions)],
  ] as const)app.get(path,async c=>{const ctx=await authenticateScim(c);await auditScimRead(ctx,'discover');return scimJson(c,get());});
  app.get('/ResourceTypes/:id',async c=>{const ctx=await authenticateScim(c),value=resourceTypes.find(item=>item.id===c.req.param('id'));if(!value)throw new ScimError(404,'Resource type not found.');await auditScimRead(ctx,'discover');return scimJson(c,value);});
  app.get('/Schemas/:id',async c=>{const ctx=await authenticateScim(c),value=schemaDefinitions.find(item=>item.id===c.req.param('id'));if(!value)throw new ScimError(404,'Schema not found.');await auditScimRead(ctx,'discover');return scimJson(c,value);});
  app.get('/Users',async c=>{const ctx=await authenticateScim(c),result=await listUsers(ctx,c.req.query());await auditScimRead(ctx,'users.list');return scimJson(c,result);});
  app.get('/Users/:id',async c=>{const ctx=await authenticateScim(c),result=await getUser(ctx,c.req.param('id'));await auditScimRead(ctx,'users.get');return scimJson(c,result);});
  app.post('/Users',async c=>{const ctx=await authenticateScim(c),result=await createUser(ctx,c.get('runtimeConfig'),await scimBody(c));c.header('Location',result.meta.location);return scimJson(c,result,201);});
  app.put('/Users/:id',async c=>{const ctx=await authenticateScim(c);return scimJson(c,await replaceUser(ctx,c.get('runtimeConfig'),c.req.param('id'),await scimBody(c)));});
  app.patch('/Users/:id',async c=>{const ctx=await authenticateScim(c),body=await scimBody(c),current=await getUser(ctx,c.req.param('id'));return scimJson(c,await replaceUser(ctx,c.get('runtimeConfig'),c.req.param('id'),applyUserPatch(current,body)));});
  app.delete('/Users/:id',async c=>{const ctx=await authenticateScim(c);await deleteUser(ctx,c.req.param('id'));return c.body(null,204);});
  app.get('/Groups',async c=>{const ctx=await authenticateScim(c),result=await listGroups(ctx,c.req.query());await auditScimRead(ctx,'groups.list');return scimJson(c,result);});
  app.get('/Groups/:id',async c=>{const ctx=await authenticateScim(c),result=await getGroup(ctx,c.req.param('id'));await auditScimRead(ctx,'groups.get');return scimJson(c,result);});
  app.post('/Groups',async c=>{const ctx=await authenticateScim(c),result=await writeGroup(ctx,await scimBody(c));c.header('Location',result.meta.location);return scimJson(c,result,201);});
  app.put('/Groups/:id',async c=>{const ctx=await authenticateScim(c);return scimJson(c,await writeGroup(ctx,await scimBody(c),c.req.param('id')));});
  app.patch('/Groups/:id',async c=>{const ctx=await authenticateScim(c),current=await getGroup(ctx,c.req.param('id'));return scimJson(c,await writeGroup(ctx,applyGroupPatch(current,await scimBody(c)),c.req.param('id')));});
  app.delete('/Groups/:id',async c=>{const ctx=await authenticateScim(c);await deleteGroup(ctx,c.req.param('id'));return c.body(null,204);});
  app.all('*',async c=>{await authenticateScim(c);throw new ScimError(404,'SCIM endpoint not found.');});
  app.onError((cause,c)=>scimError(c,cause));
  return app;
}
