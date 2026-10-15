import type {Context} from 'hono';
import type {z} from 'zod';
import type {AppEnvironment} from '../../app/types';
import {featureContext} from '../../app/feature-context';
import {ApiProblem} from '../../app/problems';
export function intelligenceContext(c:Context<AppEnvironment>){return {...featureContext(c),sourceSecret:c.env.CONNECTOR_CREDENTIALS_KEY};}
export async function body<T extends z.ZodType>(c:Context<AppEnvironment>,schema:T):Promise<z.infer<T>>{let raw;try{raw=await c.req.json();}catch{throw new ApiProblem(400,'INVALID_JSON','Supply a JSON request.');}const parsed=schema.safeParse(raw);if(!parsed.success)throw new ApiProblem(400,'INVALID_INPUT','The request does not match the required fields.');return parsed.data;}
export const providerConfig=(c:Context<AppEnvironment>)=>{return {demo:c.env.RER_DEMO==='1',apiKey:c.env.AI_API_KEY,localUrl:c.env.AI_LOCAL_URL,localToken:c.env.AI_LOCAL_TOKEN};};
