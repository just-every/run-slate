import { z } from 'zod';
import { GROUP, PATCH, ScimError, ignoredAttributes } from './protocol';
export function parseGroup(body:Record<string,unknown>) {
  if(body.schemas!==undefined&&(!Array.isArray(body.schemas)||!body.schemas.includes(GROUP)))throw new ScimError(400,'The Group schema is required.','invalidValue');
  return {displayName:z.string().trim().min(1).max(200).parse(body.displayName),externalId:body.externalId==null?null:z.string().min(1).max(512).parse(body.externalId),members:z.array(z.object({value:z.string().min(1).max(160)}).passthrough()).max(250).parse(body.members??[]).map(member=>member.value),ignored:ignoredAttributes(body,['displayName','externalId','members'])};
}
export function applyGroupPatch(current:Record<string,unknown>,body:Record<string,unknown>):Record<string,unknown> {
  if(!Array.isArray(body.schemas)||!body.schemas.includes(PATCH))throw new ScimError(400,'The PatchOp schema is required.','invalidSyntax');
  const operations=z.array(z.object({op:z.string(),path:z.string().optional(),value:z.unknown().optional()})).min(1).max(100).parse(body.Operations),result=structuredClone(current);
  for(const operation of operations){
    const op=operation.op.toLowerCase(),path=operation.path;
    if(!['add','replace','remove'].includes(op))throw new ScimError(400,'Unsupported PATCH operation.','invalidSyntax');
    if(!path){if(op==='remove'||!operation.value||typeof operation.value!=='object'||Array.isArray(operation.value))throw new ScimError(400,'A PATCH value object is required.','invalidValue');Object.assign(result,operation.value);continue;}
    const lower=path.toLowerCase();
    if(['id','meta','schemas'].includes(lower))throw new ScimError(400,'This attribute is read only.','mutability');
    const memberFilter=/^members\[value\s+eq\s+("(?:[^"\\]|\\.)*")\]$/i.exec(path);
    if(memberFilter){if(op!=='remove')throw new ScimError(400,'Filtered members support remove only.','invalidPath');const id=JSON.parse(memberFilter[1]!) as string;result.members=(result.members as {value:string}[]).filter(member=>member.value!==id);continue;}
    if(lower==='members'){
      const currentMembers=result.members as {value:string}[];
      if(op==='remove')result.members=[];
      else{const values=Array.isArray(operation.value)?operation.value:[operation.value];result.members=op==='add'?[...currentMembers,...values]:values;}
      continue;
    }
    if(lower.startsWith('members['))throw new ScimError(400,'Invalid members filter.','invalidPath');
    const canonical=({displayname:'displayName',externalid:'externalId'} as Record<string,string>)[lower]??path;
    if(canonical==='displayName'&&op==='remove')throw new ScimError(400,'displayName is required.','mutability');
    if(op==='remove')delete result[canonical];else result[canonical]=operation.value;
  }
  return result;
}
