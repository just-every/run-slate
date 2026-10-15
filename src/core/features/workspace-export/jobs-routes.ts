import {z} from 'zod';
import type {Hono} from 'hono';
import type {AppEnvironment} from '../../app/types';
import {featureContext} from '../../app/feature-context';
import {ApiProblem} from '../../app/problems';
import {requireWorkspaceOwner} from '../sharing/current-access';
import {stagePortabilityJob,getPortabilityJob,runPortabilityJob} from '../portability/jobs';
import {requireStepUp} from '../session/step-up';
import {requireWorkspaceExportAuthority} from './authorization';
/** Register before the legacy /:id routes. Status never contains storage keys or identity data. */
export function registerPortabilityJobRoutes(routes:Hono<AppEnvironment>){
 routes.post('/jobs/workspace',async c=>{
  const {operationKey}=z.object({operationKey:z.string()}).parse(await c.req.json());
  await requireWorkspaceExportAuthority(c);
  return c.json(await stagePortabilityJob(featureContext(c),'export',operationKey),202);
 });
 routes.post('/jobs/restore',async c=>{
  await requireWorkspaceOwner(featureContext(c));await requireStepUp(c,'delete');
  const ctx=featureContext(c);
  const body=await c.req.parseBody();
  if(!(body.file instanceof File))throw new ApiProblem(400,'FILE_REQUIRED','Attach a Slate workspace archive.');
  if(body.file.size>256*1024*1024)throw new ApiProblem(413,'ARCHIVE_TOO_LARGE','Archive exceeds 256 MiB.');
  const operationKey=z.string().parse(body.operationKey);
  return c.json(await stagePortabilityJob(ctx,'restore',operationKey,new Uint8Array(await body.file.arrayBuffer())),202);
 });
 routes.get('/jobs/:id',async c=>c.json(await getPortabilityJob(featureContext(c),c.req.param('id'))));
 routes.post('/jobs/:id/run',async c=>{
  const result=await runPortabilityJob(featureContext(c),c.req.param('id'));
  return c.json(result,result.state==='running'?409:200);
 });
}
