import type { MiddlewareHandler } from 'hono';
import type { AppEnvironment } from '../../app/types';
import { ApiProblem } from '../../app/problems';
export const personalJson:MiddlewareHandler<AppEnvironment>=async(c,next)=>{
 if(['POST','PUT','PATCH','DELETE'].includes(c.req.method)){let body:unknown;try{body=await c.req.json();}catch{throw new ApiProblem(400,'INVALID_JSON','Supply a JSON object.');}if(!body||typeof body!=='object'||Array.isArray(body))throw new ApiProblem(400,'INVALID_JSON','Supply a JSON object.');}
 await next();
};
export function requiredId(value:unknown):asserts value is string {if(typeof value!=='string'||!value||value.length>160)throw new ApiProblem(400,'INVALID_ID','Supply a record identifier.');}
