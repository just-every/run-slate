import {ApiProblem} from '../../../app/problems';
export const maximumFileBytes=64*1024*1024;
export async function request(url:string,token?:string):Promise<Response>{
 let response:Response;
 try{response=await fetch(url,{headers:token?{Authorization:`Bearer ${token}`}:{},redirect:'manual',signal:AbortSignal.timeout(30000)});}catch{throw new ApiProblem(502,'FOLDER_PROVIDER_UNAVAILABLE','The provider could not be reached.');}
 if(response.status===401)throw new ApiProblem(403,'FOLDER_CREDENTIAL_REVOKED','Reconnect your provider account.');
 if(response.status===403||response.status===404)throw new ApiProblem(403,'FOLDER_SOURCE_UNREADABLE','The provider did not grant access to this item.');
 if(!response.ok&&response.status!==302)throw new ApiProblem(502,'FOLDER_PROVIDER_FAILED','The provider could not complete this request.');
 return response;
}
export async function json<T>(url:string,token:string):Promise<T>{const response=await request(url,token);if(response.status===302)throw new ApiProblem(502,'FOLDER_PROVIDER_REDIRECT','Unexpected provider redirect.');return response.json<T>();}
export async function boundedBytes(response:Response):Promise<Uint8Array>{
 if(Number(response.headers.get('content-length')??0)>maximumFileBytes){await response.body?.cancel();throw new ApiProblem(413,'FOLDER_FILE_TOO_LARGE','The file exceeds the 64 MiB import limit.');}
 const reader=response.body?.getReader();if(!reader)return new Uint8Array();const chunks:Uint8Array[]=[];let size=0;
 for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>maximumFileBytes){await reader.cancel();throw new ApiProblem(413,'FOLDER_FILE_TOO_LARGE','The file exceeds the 64 MiB import limit.');}chunks.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
}
export function sourceId(value:string){if(!/^[A-Za-z0-9_!.-]{1,200}$/.test(value))throw new ApiProblem(400,'INVALID_FOLDER_ID','Supply a provider folder or drive ID.');return encodeURIComponent(value);}
export const wordType='application/vnd.openxmlformats-officedocument.wordprocessingml.document';
