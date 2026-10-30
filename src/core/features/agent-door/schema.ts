import {z} from 'zod';
import type {JsonSchemaObject} from '../../../../modules/agent-door/index.ts';
/** Express native record key lengths using the door's supported patternProperties. */
export function doorSchema(schema:z.ZodType):JsonSchemaObject{
 const source=z.toJSONSchema(schema,{target:'draft-2020-12'});
 const visit=(value:unknown):unknown=>{
  if(Array.isArray(value))return value.map(visit);
  if(!value||typeof value!=='object')return value;
  const node=Object.fromEntries(Object.entries(value).map(([key,item])=>[key,visit(item)])) as Record<string,unknown>;
  if(node.propertyNames){
   const keys=node.propertyNames as {type?:string;minLength?:number;maxLength?:number;pattern?:string};
   if(keys.type!=='string'||Object.keys(keys).some(key=>!['type','minLength','maxLength','pattern'].includes(key)))throw new Error('Native record key schema needs an explicit door representation');
   const pattern=keys.pattern??`^[\\s\\S]{${keys.minLength??0},${keys.maxLength??''}}$`;
   node.patternProperties={[pattern]:node.additionalProperties??true};node.additionalProperties=false;delete node.propertyNames;
  }
  return node;
 };
 return visit(source) as JsonSchemaObject;
}
