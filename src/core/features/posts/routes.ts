import {Hono} from 'hono';
import type {AppEnvironment} from '../../app/types';
import {featureContext} from '../../app/feature-context';
import {ApiProblem} from '../../app/problems';
import {validatedJson} from '../pages/input';
import {createPost,createPostSchema} from './create';
import {queryPosts,postQuerySchema} from './query';

export function createPostsRoutes() {
 const routes=new Hono<AppEnvironment>();
 routes.get('/',async c=>{
  const input=postQuerySchema.safeParse(c.req.query());
  if(!input.success)throw new ApiProblem(400,'INVALID_REQUEST','Choose a valid post feed and page size.');
  return c.json(await queryPosts(featureContext(c),input.data));
 });
 routes.post('/',async c=>c.json(await createPost(featureContext(c),await validatedJson(c,createPostSchema))));
 return routes;
}
