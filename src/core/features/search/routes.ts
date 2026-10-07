import { personalJson } from '../navigation/request';
import { Hono } from 'hono';
import type { AppEnvironment } from '../../app/types';
import { featureContext } from '../../app/feature-context';
import { search } from './service';
import { savedSearches,saveSearch,deleteSearch } from './saved';
export function createSearchRoutes(){const app=new Hono<AppEnvironment>();app.use('*',personalJson);
 app.get('/',async c=>{const q=c.req.query();return c.json(await search(featureContext(c),{query:q.q??q.query??'',kind:q.kind,containerId:q.containerId,contributorId:q.contributorId,status:q.status,updatedFrom:q.updatedFrom,updatedTo:q.updatedTo,includeArchived:q.includeArchived==='true',includeTrashed:q.includeTrashed==='true',cursor:q.cursor,limit:q.limit?Number(q.limit):undefined}));});
 app.get('/saved',async c=>c.json({items:await savedSearches(featureContext(c))}));
 app.post('/saved',async c=>c.json(await saveSearch(featureContext(c),await c.req.json())));
 app.delete('/saved/:id',async c=>c.json(await deleteSearch(featureContext(c),{...await c.req.json(),id:c.req.param('id')})));
 return app;}
