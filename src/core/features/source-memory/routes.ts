import {ApiProblem} from '../../app/problems';
import {searchSources} from './search';
import {Hono} from 'hono';
import {z} from 'zod';
import type {AppEnvironment} from '../../app/types';
import {featureContext} from '../../app/feature-context';
import {currentSubject} from '../sharing/current-access';
import {addSource,refreshSource,resolveEvidence,forgetSource} from './service';
export function createSourceRoutes(){const r=new Hono<AppEnvironment>();r.get('/search',async c=>c.json(await searchSources(featureContext(c),c.req.query('q')??'',{secret:c.env.CONNECTOR_CREDENTIALS_KEY})));r.get('/',async c=>{const ctx=featureContext(c);await currentSubject(ctx);const rows=await ctx.db.prepare('SELECT s.id,s.state,s.published_revision_id AS sourceRevisionId,s.revision_id AS revisionId FROM federation_sources s JOIN federation_connections c ON c.id=s.connection_id WHERE s.workspace_id=? AND c.member_id=?').bind(ctx.actor.workspaceId,ctx.actor.id).all();return c.json({items:rows.results});});r.post('/',async c=>c.json(await addSource(featureContext(c),z.object({operationKey:z.string(),connectionId:z.string(),remoteId:z.string().max(500)}).parse(await c.req.json()))));r.post('/:id/refresh',async c=>c.json(await refreshSource(featureContext(c),c.req.param('id'),c.env.CONNECTOR_CREDENTIALS_KEY)));r.get('/:id/revisions/:revisionId',async c=>c.json(await resolveEvidence(featureContext(c),{sourceId:c.req.param('id'),sourceRevisionId:c.req.param('revisionId'),passageId:c.req.query('passageId')},{secret:c.env.CONNECTOR_CREDENTIALS_KEY})));r.delete('/:id',async c=>c.json(await forgetSource(featureContext(c),{id:c.req.param('id'),...z.object({operationKey:z.string(),expectedRevisionId:z.string()}).parse(await c.req.json())})));return r;}
