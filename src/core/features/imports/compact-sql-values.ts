import {deflateRawSync} from 'node:zlib';
import {inflateNativeValue} from './native-inflate';
import {Buffer} from 'node:buffer';
import type {NativeValue} from './native-plan';
interface ValuesPage {pending?:string[];bytes?:Uint8Array;size:number}
export interface StoredSqlValues {page:ValuesPage;index:number}

/** Native planners return real statement handles. Store their exact bindings
 * in bounded compressed pages, with only one decoded page cached for reads. */
export function compactSqlValues(){
 let pending:ValuesPage={pending:[],size:2};
 let decoded:{page:ValuesPage;values:NativeValue[][]}|undefined;
 const flush=()=>{
  if(!pending.pending?.length)return;
  const json=`[${pending.pending.join(',')}]`,encoded=deflateRawSync(json),bytes=new Uint8Array(encoded.length);bytes.set(encoded);
  pending.bytes=bytes;pending.size=Buffer.byteLength(json);delete pending.pending;
  pending={pending:[],size:2};
 };
 return {
  add(values:NativeValue[]):StoredSqlValues {
   if(values.some(value=>value!==null&&typeof value!=='string'&&(typeof value!=='number'||!Number.isFinite(value))))throw new Error('Unsupported native import binding.');
   const json=JSON.stringify(values),size=Buffer.byteLength(json);
   if(pending.pending!.length&&pending.size+size>256*1024)flush();
   const handle={page:pending,index:pending.pending!.length};pending.pending!.push(json);pending.size+=size+1;return handle;
  },
  read(handle:StoredSqlValues):NativeValue[]{
   const {page,index}=handle;
   if(page.pending)return JSON.parse(page.pending[index]!) as NativeValue[];
   if(decoded?.page!==page)decoded={page,values:JSON.parse(Buffer.from(inflateNativeValue(page.bytes!,page.size)).toString('utf8')) as NativeValue[][]};
   return decoded.values[index]!;
  },
  flush,
 };
}
