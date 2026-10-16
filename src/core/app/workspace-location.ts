export interface WorkspaceLocation { path?:string; visit?:boolean }
/** Accept only operator paths. The server function authenticates every call. */
export function workspaceLocation(value:unknown):WorkspaceLocation {
  if(value===undefined)return {};
  if(!value||typeof value!=='object')throw new Error('Invalid workspace location.');
  const {path,visit}=value as WorkspaceLocation;
  if(typeof path!=='string'||!/^\/app(?:\/|\?|$)/.test(path)||path.length>4096||path.includes('\\')||typeof visit!=='boolean')throw new Error('Invalid workspace location.');
  const url=new URL(path,'https://slate.invalid');
  if(!/^\/app(?:\/|$)/.test(url.pathname))throw new Error('Invalid workspace location.');
  return {path:url.pathname+url.search,visit};
}
