import {deflateRawSync} from 'node:zlib';
import {inflateNativeValue} from './native-inflate';
import {Buffer} from 'node:buffer';
import type {NativeValue} from './native-plan';

/** Retain large immutable parser fields and guard bindings in compressed form.
 * Enumerable getters preserve ordinary JSON/array reads without retaining a
 * decoded body, including fields transferred directly into table records. */
export function compactNativeValues(values:NativeValue[],detachSmallStrings=false):NativeValue[] {
 const compact:NativeValue[]=new Array(values.length);
 for(let index=0;index<values.length;index++){
  const value=values[index]!;
  if(typeof value==='string'&&value.length>=1024){
   const serialized=JSON.stringify(value),encoded=deflateRawSync(serialized),packed=new Uint8Array(encoded.byteLength),size=Buffer.byteLength(serialized);
   // zlib's small result is a view over its larger output slab. Retaining that
   // slab per field can cost tens of MiB beyond the actual compressed bytes.
   packed.set(encoded);
   Object.defineProperty(compact,index,{enumerable:true,configurable:true,get:()=>JSON.parse(Buffer.from(inflateNativeValue(packed,size)).toString('utf8')) as string});
  // A short CSV identifier can be a slice of a whole decoded text window.
  // Detach retained strings so that compacting its body also releases that
  // window instead of retaining it through an unrelated small field.
  }else compact[index]=detachSmallStrings&&typeof value==='string'?JSON.parse(JSON.stringify(value)) as string:value;
 }
 return compact;
}
export function transferNativeValue(values:NativeValue[],index:number,target:Record<string,NativeValue>,key:string){
 const property=Object.getOwnPropertyDescriptor(values,index);
 if(!property)throw new Error('Native import missing binding.');
 Object.defineProperty(target,key,property);
}
