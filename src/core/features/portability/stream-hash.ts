import {ApiProblem} from '../../app/problems';
export const hex=(bytes:ArrayBuffer)=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
/** Workers' incremental digest never retains an archive in memory. */
export async function hashStream(body:ReadableStream<Uint8Array>,maximum=256*1024*1024){
 const digest=new (crypto as Crypto & {DigestStream: typeof DigestStream}).DigestStream('SHA-256'),writer=digest.getWriter(),reader=body.getReader();let size=0;
 try{for(;;){const item=await reader.read();if(item.done)break;size+=item.value.length;if(size>maximum)throw new ApiProblem(413,'ARCHIVE_TOO_LARGE','Archive exceeds the bounded size.');await writer.write(item.value);}await writer.close();return {size,sha256:hex(await digest.digest)};}
 catch(error){await reader.cancel().catch(()=>{});await writer.abort().catch(()=>{});throw error;}finally{reader.releaseLock();}
}
