import {Hono} from 'hono';
import type {AppEnvironment} from '../../app/types';
import {featureContext} from '../../app/feature-context';
import {personalJson} from '../navigation/request';
import {ownReading,sendReading,acknowledgeReading,readingReport,pageReadings,previewReading} from './service';
export function createRequiredReadingRoutes(){
 const r=new Hono<AppEnvironment>();r.use('*',personalJson);
 r.get('/page/:pageId',async c=>c.json(await pageReadings(featureContext(c),c.req.param('pageId'))));
 r.get('/preview',async c=>c.json(await previewReading(featureContext(c),c.req.query('pageId')??'',c.req.query('groupId')??'')));
 r.get('/:id/report',async c=>c.json(await readingReport(featureContext(c),c.req.param('id'))));
 r.get('/:id',async c=>c.json(await ownReading(featureContext(c),c.req.param('id'))));
 r.post('/',async c=>c.json(await sendReading(featureContext(c),await c.req.json())));
 r.post('/:id/acknowledge',async c=>c.json(await acknowledgeReading(featureContext(c),c.req.param('id'),await c.req.json())));
 return r;
}
