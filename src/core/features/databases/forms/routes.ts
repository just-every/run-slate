import {Hono} from 'hono';
import type {AppEnvironment} from '../../../app/types';
import {ApiProblem} from '../../../app/problems';
import {renderUnavailablePublicDocument} from '../../publishing/document-shell';
import {availableForm} from './access';
import {submitForm} from './submissions';
import {formClient} from './client';
import {formHeaders,renderForm} from './render';
export function createPublicFormRoutes(){return new Hono<AppEnvironment>()
 .get('/client.js',c=>c.body(formClient,200,{'Content-Type':'application/javascript; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}))
 .get('/:slug',async c=>{try{const form=await availableForm(c,c.req.param('slug'));return c.html(renderForm({title:form.row.title,revisionId:form.row.revision_id,definition:form.definition,fields:form.fields}),200,formHeaders);}catch(cause){if(cause instanceof ApiProblem&&cause.status===404)return c.html(renderUnavailablePublicDocument(),404,formHeaders);throw cause;}})
 .post('/:slug',async c=>c.json(await submitForm(c,c.req.param('slug'))));}
