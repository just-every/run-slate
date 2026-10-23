import {Hono} from 'hono';
import {z} from 'zod';
import type {AppEnvironment} from '../../app/types';
import {featureContext} from '../../app/feature-context';
import {body} from '../ai/http';
import {featureKeys} from './catalog';
import {readSwitches, setSwitch} from './service';

export function createFeatureSwitchRoutes() {
  const routes = new Hono<AppEnvironment>();
  routes.get('/', async c => c.json(await readSwitches(featureContext(c), c.env)));
  routes.put('/', async c => c.json(await setSwitch(featureContext(c), await body(c, z.object({operationKey: z.string(), key: z.enum(['ai', ...featureKeys]), enabled: z.boolean()}).strict()), c.env)));
  return routes;
}
