import type {CapturedSql,NativeValue} from './native-plan';
export interface NativeRowTemplate {base:Record<string,NativeValue>;bindings:Map<string,number>}
interface RowView {template:NativeRowTemplate;statement:CapturedSql;mutations:WeakMap<CapturedSql,Record<string,NativeValue>>}
const value=(row:RowView,key:string):NativeValue|undefined=>{
 const overrides=row.mutations.get(row.statement);
 if(overrides&&Object.hasOwn(overrides,key))return overrides[key];
 const index=row.template.bindings.get(key);
 const found=index===undefined?(Object.hasOwn(row.template.base,key)?row.template.base[key]:undefined):row.statement.params[index];
 // Long values are read only while serializing a bounded native unit. Small
 // identities escape into owner/scope maps and must not retain a decoded page.
 return typeof found==='string'&&found.length<1024?JSON.parse(JSON.stringify(found)) as string:found;
};
const handler:ProxyHandler<RowView>={
 get(row,key){return typeof key==='string'?value(row,key):undefined;},
 ownKeys(row){return Object.keys(row.template.base);},
 has(row,key){return typeof key==='string'&&Object.hasOwn(row.template.base,key);},
 getOwnPropertyDescriptor(row,key){if(typeof key!=='string'||!Object.hasOwn(row.template.base,key))return undefined;return {enumerable:true,configurable:true,writable:true,value:value(row,key)};},
 set(row,key,incoming){if(typeof key!=='string'||!Object.hasOwn(row.template.base,key))return false;let overrides=row.mutations.get(row.statement);if(!overrides){overrides={};row.mutations.set(row.statement,overrides);}overrides[key]=incoming as NativeValue;return true;},
};
/** Column/default vocabulary is shared per INSERT. Complete native row values
 * remain ordinary enumerable reads, backed by the exact captured bindings. */
export function nativeRowValues(template:NativeRowTemplate,statement:CapturedSql,mutations:WeakMap<CapturedSql,Record<string,NativeValue>>):Record<string,NativeValue>{
 return new Proxy({template,statement,mutations},handler) as unknown as Record<string,NativeValue>;
}
