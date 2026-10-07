import {Hono} from 'hono';
import {z} from 'zod';
import type {AppEnvironment} from '../../app/types';
import {intelligenceContext,body} from '../ai/http';
import {claimScopeSchema,claimAuthoritySchema} from './contracts';
import {readClaim,retainStatementClaim,reviseClaim,runClaims} from './service';
export function createClaimRoutes(){const r=new Hono<AppEnvironment>();r.post('/from-statement',async c=>c.json(await retainStatementClaim(intelligenceContext(c),await body(c,z.object({operationKey:z.string(),runId:z.string(),statementIndex:z.number().int().nonnegative()}).strict()))));r.get('/runs/:id',async c=>c.json(await runClaims(intelligenceContext(c),c.req.param('id'))));r.get('/:id',async c=>c.json(await readClaim(intelligenceContext(c),c.req.param('id'))));r.post('/:id/revise',async c=>c.json(await reviseClaim(intelligenceContext(c),{...await body(c,z.object({operationKey:z.string(),scope:claimScopeSchema,authority:claimAuthoritySchema,conflicts:z.array(z.string().max(4000)),unknowns:z.array(z.string().max(4000))}).strict()),revisionId:c.req.param('id')})));return r;}
