import { ApiProblem } from '../../app/problems';
/** Fixed provider URLs only. No redirects or caller-controlled origins; secrets never enter errors. */
export async function providerJson<T>(url:string,token:string,maximum=2_000_000):Promise<T> {
 const response=await fetch(url,{headers:{Authorization:`Bearer ${token}`,Accept:'application/json','User-Agent':'Slate'},redirect:'manual',signal:AbortSignal.timeout(15000)});
 if(response.status===401||response.status===403) throw new ApiProblem(403,'SOURCE_ACCESS_REVOKED','The connected identity cannot read this source. Reconnect or request source access.');
 if(response.status===404) throw new ApiProblem(404,'SOURCE_DELETED','The source is unavailable or deleted.');
 if(!response.ok) throw new ApiProblem(502,'SOURCE_PROVIDER_FAILED',`The source provider returned HTTP ${response.status}.`);
 const reader=response.body!.getReader();const chunks:Uint8Array[]=[];let size=0;
 try{while(true){const result=await reader.read();if(result.done)break;size+=result.value.length;if(size>maximum)throw new ApiProblem(413,'SOURCE_TOO_LARGE','The selected source exceeds the bounded document size.');chunks.push(result.value);}}finally{await reader.cancel();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return JSON.parse(new TextDecoder().decode(bytes)) as T;
}
