import type {JsonSchema} from '../../../../modules/agent-door/index.ts';

/** Base accepts patternProperties; express native bounded map keys without
 * losing Zod's property-name constraint at the transport boundary. */
export function doorSchema(value:unknown):JsonSchema {
  if(Array.isArray(value))return value.map(item=>doorSchema(item)) as unknown as JsonSchema;
  if(value===null||typeof value!=='object')return value as JsonSchema;
  const node=Object.fromEntries(Object.entries(value).map(([key,item])=>[key,doorSchema(item)])) as Record<string,unknown>;
  if(node.propertyNames!==undefined) {
    const names=node.propertyNames as Record<string,unknown>;
    if(names.type!=='string'||Object.keys(names).some(key=>!['type','minLength','maxLength'].includes(key)))throw new TypeError('Unsupported native map key schema');
    const min=names.minLength??0,max=names.maxLength??'';
    const pattern=`^[\\s\\S]{${min},${max}}$`;
    node.patternProperties={[pattern]:node.additionalProperties??true};
    node.additionalProperties=false;
    delete node.propertyNames;
  }
  return node as JsonSchema;
}
