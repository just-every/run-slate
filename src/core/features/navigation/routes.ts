import { navigationConfiguration, setNavigationConfiguration, navigationConfigurationSchema } from './configuration';
import { parseBody } from '../workspace/routes';
import { personalJson } from '../navigation/request';
import { Hono } from 'hono';
import type { AppEnvironment } from '../../app/types';
import { featureContext } from '../../app/feature-context';
import { navigation,preferences,updatePreferences,openRecent,setFavourite,setWatch } from './service';
export function createNavigationRoutes(){const app=new Hono<AppEnvironment>();app.use('*',personalJson);app.get('/configuration',async c=>c.json(await navigationConfiguration(featureContext(c))));app.put('/configuration',async c=>c.json(await setNavigationConfiguration(featureContext(c),await parseBody(c.req,navigationConfigurationSchema))));app.get('/',async c=>c.json(await navigation(featureContext(c))));app.get('/preferences',async c=>c.json(await preferences(featureContext(c))));app.put('/preferences',async c=>c.json(await updatePreferences(featureContext(c),await c.req.json())));app.post('/recents',async c=>c.json(await openRecent(featureContext(c),await c.req.json())));app.put('/favourites',async c=>c.json(await setFavourite(featureContext(c),await c.req.json())));app.put('/watches',async c=>c.json(await setWatch(featureContext(c),await c.req.json())));return app;}
