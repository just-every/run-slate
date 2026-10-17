import {Hono} from 'hono';
import type {AppEnvironment} from '../../app/types';
import {featureContext} from '../../app/feature-context';
import {personalJson} from '../navigation/request';
import {taskList,completeTask,taskAssignees} from './service';
export function createWorkItemsRoutes(){const r=new Hono<AppEnvironment>();r.use('*',personalJson);r.get('/',async c=>{const q=c.req.query();return c.json(await taskList(featureContext(c),{...q,limit:q.limit===undefined?undefined:Number(q.limit)}));});r.get('/:pageId/assignees',async c=>c.json(await taskAssignees(featureContext(c),c.req.param('pageId'))));r.patch('/:pageId/:blockId',async c=>c.json(await completeTask(featureContext(c),c.req.param('pageId'),c.req.param('blockId'),await c.req.json())));return r;}
