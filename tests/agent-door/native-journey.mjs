import {randomUUID} from 'node:crypto';
/** The final native proof checks the same activity a person sees. */
export default async function({request,origin,cookie}){
 const response=await request(new URL('/api/activity',origin).href,{headers:{Cookie:cookie}});
 if(!response.ok)throw new Error('Native activity unavailable');
 const body=await response.json();
 if(!body.items?.some(row=>row.actor?.displayName?.includes(' for ')))throw new Error('Native agent attribution missing');
}
export async function beforeStep({step,request,origin,cookie}){
 if(step.id!=='sensitive-workspace')return;
 const headers={Cookie:cookie,Origin:origin,'Content-Type':'application/json'};
 const current=await request(new URL('/api/workspace',origin).href,{headers});
 const value=await current.json();
 const r=await request(new URL('/api/workspace',origin).href,{method:'PUT',headers,body:JSON.stringify({name:value.name,mark:value.mark,guestAccess:value.guestAccess,publicLinkAccess:value.publicLinkAccess,anonymousAccess:value.anonymousAccess,policies:value.policies,operationKey:randomUUID(),expectedRevisionId:value.revisionId,description:'SSN 123-45-6789'})});
 if(!r.ok)throw new Error('Native workspace preparation refused');
}
