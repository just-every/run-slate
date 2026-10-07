import {ApiProblem} from '../../app/problems';
/** Bound both success and error bodies before parsing any provider-controlled JSON. */
export async function nativeResponse(response:Response):Promise<unknown>{
 const reader=response.body?.getReader();if(!reader)throw new ApiProblem(502,'INVALID_SOURCE_RESPONSE','Source returned no data.');
 const chunks:Uint8Array[]=[];let size=0;
 try{for(;;){const item=await reader.read();if(item.done)break;size+=item.value.length;if(size>2_100_000)throw new ApiProblem(413,'SOURCE_TOO_LARGE','Selected evidence is too large.');chunks.push(item.value);}}
 catch(error){if(error instanceof DOMException&&['AbortError','TimeoutError'].includes(error.name))throw new ApiProblem(502,'SOURCE_UNAVAILABLE','Source response timed out.');throw error;}
 finally{await reader.cancel();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw new ApiProblem(502,'INVALID_SOURCE_RESPONSE','Source returned invalid data.');}
}
