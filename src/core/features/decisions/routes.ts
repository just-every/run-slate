import {proposeDecisionSuccessor} from './successor';
import {prepareDecision} from './preparation';
import {Hono} from 'hono';
import {z} from 'zod';
import type {AppEnvironment} from '../../app/types';
import {intelligenceContext,body} from '../ai/http';
import {decisionSchema,decisionFilterSchema,saveDecision,getDecision,listDecisions,acceptDecision,reviewDecision,removeDecision,decisionHistory,decisionReviews} from './service';
const transition={operationKey:z.string(),expectedRevisionId:z.string()};
export function createDecisionsRoutes(){
 const r=new Hono<AppEnvironment>();
 r.post('/:id/propose-successor',async c=>c.json(await proposeDecisionSuccessor(intelligenceContext(c),c.req.param('id'),await body(c,z.object({operationKey:z.string()}).strict()))));
 r.post('/from-run/:id',async c=>c.json(await prepareDecision(intelligenceContext(c),c.req.param('id'),await body(c,z.object({operationKey:z.string()}).strict()))));
 r.get('/',async c=>c.json(await listDecisions(intelligenceContext(c),decisionFilterSchema.parse(c.req.query()))));
 r.post('/',async c=>c.json(await saveDecision(intelligenceContext(c),await body(c,decisionSchema))));
 r.get('/:id',async c=>c.json(await getDecision(intelligenceContext(c),c.req.param('id'),c.req.query('revision'))));
 r.get('/:id/history',async c=>c.json(await decisionHistory(intelligenceContext(c),c.req.param('id'))));
 r.get('/:id/reviews',async c=>c.json(await decisionReviews(intelligenceContext(c),c.req.param('id'))));
 r.post('/:id/remove',async c=>c.json(await removeDecision(intelligenceContext(c),{...await body(c,z.object(transition).strict()),id:c.req.param('id')})));
 r.post('/:id/accept',async c=>c.json(await acceptDecision(intelligenceContext(c),{...await body(c,z.object({...transition,supersedesId:z.string().optional()}).strict()),id:c.req.param('id')})));
 r.post('/:id/review',async c=>c.json(await reviewDecision(intelligenceContext(c),{...await body(c,z.object({...transition,note:z.string().trim().min(1),nextReviewAt:z.iso.datetime().nullable()}).strict()),id:c.req.param('id')})));
 return r;
}
