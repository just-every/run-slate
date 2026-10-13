import {deflateRawSync} from 'node:zlib';
import {inflateNativeValue} from './native-inflate';
import {Buffer} from 'node:buffer';
import type {ImportedBlock} from './types';

interface Body {bytes:Uint8Array;size:number}
type Tree=Record<string,unknown>|unknown[];

/** Parse-scoped body custody. A view never retains a decoded child: reads and
 * nested writes resolve its path against the single active body. Switching
 * bodies flushes all edits before releasing that body. Stable root views keep
 * the page/current-revision alias; consumers use nested values, not identity. */
export function compactBlockStore(){
 let active:{body:Body;value:ImportedBlock[];dirty:boolean}|undefined;
 const views=new WeakMap<object,()=>unknown>();
 const encode=(value:unknown):Body=>{
  const json=JSON.stringify(value),compressed=deflateRawSync(json),bytes=new Uint8Array(compressed.length);bytes.set(compressed);
  return {bytes,size:Buffer.byteLength(json)};
 };
 const open=(body:Body):ImportedBlock[]=>{
  if(active?.body!==body){
   if(active?.dirty)Object.assign(active.body,encode(active.value));
   active={body,value:JSON.parse(Buffer.from(inflateNativeValue(body.bytes,body.size)).toString('utf8')) as ImportedBlock[],dirty:false};
  }
  return active.value;
 };
 const at=(body:Body,path:PropertyKey[]):Tree=>{
  let value:unknown=open(body);for(const key of path)value=(value as Record<PropertyKey,unknown>)[key];return value as Tree;
 };
 const view=(body:Body,path:PropertyKey[],array:boolean):Tree=>{
  const target:Tree=array?[]:{};
  // Planner identity maps retain sourceId strings. JSON.parse can back even a
  // short id with the entire decoded body; detach scalars before they escape.
  const child=(key:PropertyKey,value:unknown)=>value!==null&&typeof value==='object'?view(body,[...path,key],Array.isArray(value)):typeof value==='string'?JSON.parse(JSON.stringify(value)) as string:value;
  const proxy=new Proxy(target,{
   get(_target,key){return child(key,Reflect.get(at(body,path),key));},
   has(_target,key){return Reflect.has(at(body,path),key);},
   ownKeys(){return Reflect.ownKeys(at(body,path));},
   getOwnPropertyDescriptor(_target,key){
    const descriptor=Reflect.getOwnPropertyDescriptor(at(body,path),key);if(!descriptor)return undefined;
    return {...descriptor,value:child(key,descriptor.value)};
   },
   set(_target,key,value){
    // Snapshot an assigned view before resolving this body: the other view
    // may itself switch the decoded cache. Ordinary scalar writes stay cheap.
    const read=value!==null&&typeof value==='object'?views.get(value):undefined;
    const incoming=read?JSON.parse(JSON.stringify(read())):value;
    const object=at(body,path),ok=Reflect.set(object,key,incoming);if(ok)active!.dirty=true;return ok;
   },
   deleteProperty(_target,key){const ok=Reflect.deleteProperty(at(body,path),key);if(ok)active!.dirty=true;return ok;},
   defineProperty(_target,key,descriptor){
    // JSON bodies have ordinary mutable data properties. Never silently
    // accept accessors or freezing whose semantics a path view cannot keep.
    if('get' in descriptor||'set' in descriptor||descriptor.configurable===false&&key!=='length')return false;
    const ok=Reflect.defineProperty(at(body,path),key,descriptor);if(ok)active!.dirty=true;return ok;
   },
  });
  views.set(proxy,()=>at(body,path));return proxy;
 };
 return {retain(blocks:ImportedBlock[]):ImportedBlock[]{return view(encode(blocks),[],true) as ImportedBlock[];}};
}
