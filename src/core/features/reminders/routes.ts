import {z} from 'zod';
import {reminderJobs,retryReminder} from './follow-through';
import {Hono} from 'hono';
import type {AppEnvironment} from '../../app/types';
import {featureContext} from '../../app/feature-context';
import {personalJson} from '../navigation/request';
import {reminders,setReminder,cancelReminder} from './service';
export function createReminderRoutes(){const r=new Hono<AppEnvironment>();r.use('*',personalJson);r.get('/jobs',async c=>c.json(await reminderJobs(featureContext(c))));r.post('/:id/retry',async c=>c.json(await retryReminder(featureContext(c),c.req.param('id'),z.object({operationKey:z.string().min(8),expectedRevisionId:z.string().min(1)}).strict().parse(await c.req.json()))));r.get('/',async c=>c.json(await reminders(featureContext(c))));r.post('/',async c=>c.json(await setReminder(featureContext(c),await c.req.json())));r.put('/:id',async c=>c.json(await setReminder(featureContext(c),await c.req.json(),c.req.param('id'))));r.delete('/:id',async c=>c.json(await cancelReminder(featureContext(c),c.req.param('id'),await c.req.json())));return r;}
