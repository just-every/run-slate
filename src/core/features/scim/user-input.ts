import { z } from 'zod';
import { PATCH, USER, ScimError, ignoredAttributes } from './protocol';
export interface UserInput {userName:string;displayName:string;givenName:string|null;familyName:string|null;externalId:string|null;active:boolean;ignored:string[]}
const email=z.string().trim().toLowerCase().max(254).email();
const text=z.string().trim().min(1).max(200);
export function parseUser(body:Record<string,unknown>):UserInput {
  if(body.schemas!==undefined&&(!Array.isArray(body.schemas)||!body.schemas.includes(USER)))throw new ScimError(400,'The User schema is required.','invalidValue');
  const name=body.name===undefined||body.name===null?{}:z.object({formatted:text.optional(),givenName:text.nullable().optional(),familyName:text.nullable().optional()}).passthrough().parse(body.name);
  const emails=body.emails===undefined?[]:z.array(z.object({value:email,primary:z.boolean().optional()}).passthrough()).max(50).parse(body.emails);
  const userName=email.parse(body.userName??emails.find(e=>e.primary)?.value??emails[0]?.value);
  const primary=emails.find(e=>e.primary)?.value??emails[0]?.value;
  if(primary&&primary!==userName)throw new ScimError(400,'userName and the primary email must identify the same native mailbox.','invalidValue');
  const displayName=text.parse(body.displayName??name.formatted??([name.givenName,name.familyName].filter(Boolean).join(' ')||userName.split('@')[0]));
  const ignored=ignoredAttributes(body,['userName','displayName','name','emails','externalId','active']);
  for(const key of Object.keys(name))if(!['formatted','givenName','familyName'].includes(key))ignored.push(`name.${key}`);
  return {userName,displayName,givenName:name.givenName??null,familyName:name.familyName??null,externalId:body.externalId==null?null:z.string().min(1).max(512).parse(body.externalId),active:body.active===undefined?true:z.boolean().parse(body.active),ignored};
}
export function applyUserPatch(current:Record<string,unknown>,body:Record<string,unknown>):Record<string,unknown> {
  if(!Array.isArray(body.schemas)||!body.schemas.includes(PATCH))throw new ScimError(400,'The PatchOp schema is required.','invalidSyntax');
  const operations=z.array(z.object({op:z.string(),path:z.string().optional(),value:z.unknown().optional()})).min(1).max(100).parse(body.Operations);
  const result=structuredClone(current);
  for(const operation of operations){
    const op=operation.op.toLowerCase(),path=operation.path;
    if(!['add','replace','remove'].includes(op))throw new ScimError(400,'Unsupported PATCH operation.','invalidSyntax');
    if(!path){if(op==='remove'||!operation.value||typeof operation.value!=='object'||Array.isArray(operation.value))throw new ScimError(400,'A PATCH value object is required.','invalidValue');Object.assign(result,operation.value);continue;}
    const lower=path.toLowerCase();
    if(['id','meta','schemas'].includes(lower))throw new ScimError(400,'This attribute is read only.','mutability');
    if(lower==='username'&&op==='remove')throw new ScimError(400,'userName is required.','mutability');
    if(lower.startsWith('name.')){const sub=lower.slice(5),canonical=({givenname:'givenName',familyname:'familyName',formatted:'formatted'} as Record<string,string>)[sub];if(!canonical){result[path]=operation.value;continue;}const name={...(result.name as Record<string,unknown>??{})};if(canonical!=='formatted')delete name.formatted;if(op==='remove')delete name[canonical];else name[canonical]=operation.value;result.name=name;delete result.displayName;continue;}
    if(lower==='emails'||/^emails\[(?:type\s+eq\s+"[^"]+"|primary\s+eq\s+true)\](?:\.value)?$/i.test(path)){if(op==='remove'){delete result.emails;continue;}if(lower.endsWith('.value'))result.emails=[{value:operation.value,primary:true}];else result.emails=Array.isArray(operation.value)?operation.value:[operation.value];if(Array.isArray(result.emails)){const values=result.emails as {value?:unknown;primary?:boolean}[];result.userName=values.find(v=>v.primary)?.value??values[0]?.value??result.userName;}continue;}
    const canonical=({username:'userName',displayname:'displayName',externalid:'externalId',active:'active',name:'name'} as Record<string,string>)[lower]??path;
    if(op==='remove')delete result[canonical];else result[canonical]=operation.value;
    if(canonical==='userName')delete result.emails;
    if(canonical==='name')delete result.displayName;
  }
  return result;
}
