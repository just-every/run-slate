import {Hono} from 'hono';
import {z} from 'zod';
import type {AppEnvironment} from '../../app/types';
import {featureContext} from '../../app/feature-context';
import {personalJson} from '../navigation/request';
import {parseBody} from '../workspace/routes';
import {ownReading,sendReading,acknowledgeReading,readingReport,pageReadings,previewReading} from './service';
const operationKey=z.string().min(8).max(160),id=z.string().min(1).max(160);
export function createRequiredReadingRoutes(){
 const r=new Hono<AppEnvironment>();r.use('*',personalJson);
 r.get('/page/:pageId',async c=>c.json(await pageReadings(featureContext(c),c.req.param('pageId'))));
 r.get('/preview',async c=>c.json(await previewReading(featureContext(c),c.req.query('pageId')??'',c.req.query('groupId')??'')));
 r.get('/:id/report',async c=>c.json(await readingReport(featureContext(c),c.req.param('id'))));
 r.get('/:id',async c=>c.json(await ownReading(featureContext(c),c.req.param('id'))));
 r.post('/',async c=>c.json(await sendReading(featureContext(c),await parseBody(c.req,z.object({operationKey,pageId:id,groupId:id,reminderDays:z.number().int().min(1).max(365)}).strict()))));
 r.post('/:id/acknowledge',async c=>c.json(await acknowledgeReading(featureContext(c),c.req.param('id'),await parseBody(c.req,z.object({operationKey}).strict()))));
 return r;
}
