import {useCallback,useContext,useEffect,useRef,useState} from 'react';
import {request,TransportError} from './transport';
import {InitialResourcesContext} from './InitialResources';

type Read<T> = (signal: AbortSignal) => Promise<T>;
export type Resource<T> = {
 data?:T;
 error?:unknown;
 loading:boolean;
 /** Resolves after the current response is installed; false means failed or superseded. */
 reload:()=>Promise<boolean>;
 /** Alternate authoritative read, sharing the same cancellation and ordering boundary. */
 read:(read:Read<T>)=>Promise<boolean>;
};
export type ResourcePolicy<T> = {
 retainOnTransportFailure?: boolean;
 validate?:(data:T)=>void;
};

/** Strict by default. Only explicitly authorized same-resource reads may retain data. */
export function useResource<T>(path:string|null,policy:ResourcePolicy<T>={}):Resource<T>&{invalidate:()=>void}{
 const initial=useContext(InitialResourcesContext);
 const seeded=useRef(Boolean(path && Object.hasOwn(initial,path)));
 const [state,setState]=useState<{path:string|null;data?:T;error?:unknown;loading:boolean}>(()=>{
  if(seeded.current){const data=initial[path!] as T;policy.validate?.(data);return {path,data,loading:false};}
  return {path,loading:Boolean(path)};
 });
 const currentPath=useRef(path),sequence=useRef(0),active=useRef(true),controller=useRef<AbortController|null>(null);
 const currentPolicy=useRef(policy);currentPolicy.current=policy;
 currentPath.current=path;
 const invalidate=useCallback(()=>{
  ++sequence.current;
  controller.current?.abort();
  controller.current=null;
 },[]);
 const read=useCallback(async(load:Read<T>)=>{
  const requestedPath=currentPath.current,current=++sequence.current;
  controller.current?.abort();
  const pending=new AbortController();controller.current=pending;
  if(!active.current)return false;
  if(!requestedPath){setState({path:null,loading:false});return true;}
  setState(previous=>previous.path===requestedPath&&previous.data!==undefined?{...previous,loading:false}:{path:requestedPath,loading:true});
  try{
   const data=await load(pending.signal);
   if(!active.current||pending.signal.aborted||sequence.current!==current||currentPath.current!==requestedPath)return false;
   currentPolicy.current.validate?.(data);
   setState({path:requestedPath,data,loading:false});return true;
  }catch(error){
   if(active.current&&!pending.signal.aborted&&sequence.current===current&&currentPath.current===requestedPath)setState(previous=>({path:requestedPath,error,loading:false,...(currentPolicy.current.retainOnTransportFailure&&error instanceof TransportError&&previous.path===requestedPath?{data:previous.data}:{})}));
   return false;
  }
 },[]);
 // Retire the response through read's fences without aborting a healthy GET
 // when a write or route change supersedes it.
 const reload=useCallback(()=>read(()=>request<T>(currentPath.current!)),[read]);
 useEffect(()=>{
  active.current=true;
  if(seeded.current)seeded.current=false;else void reload();
  return()=>{active.current=false;++sequence.current;controller.current?.abort();};
 },[path,reload]);
 return {...(state.path===path?state:{loading:Boolean(path)}),reload,read,invalidate};
}
