import {Inflate} from 'fflate';
import {ImportError} from './errors';

export interface ArchiveMediaSource {prefix?:Uint8Array;retained?:import('./archive-r2').RetainedZipEntry;sizeBytes:number;open:()=>ReadableStream<Uint8Array>}
const sources=new WeakMap<Map<string,Uint8Array>,Map<string,ArchiveMediaSource>>();
export const archiveMediaSource=(files:Map<string,Uint8Array>,path:string)=>sources.get(files)?.get(path);
export function registerArchiveSources(files:Map<string,Uint8Array>,entries:Map<string,ArchiveMediaSource>){sources.set(files,entries);}

/** Pull-driven bounded inflate. The advertised size is checked against every
 * actual output chunk and again at EOF, including zero-byte entries. */
export function inflateArchiveEntry(compressed:Uint8Array,method:number,size:number):ReadableStream<Uint8Array> {
  let position=0,written=0,finished=false;
  const pending:Uint8Array[]=[];
  const inflater=method===8?new Inflate(chunk=>{if(written+chunk.length>size)throw new ImportError('IMPORT_ARCHIVE_LIMIT_EXCEEDED','The archive expands beyond the import safety limits.');written+=chunk.length;if(chunk.length)pending.push(chunk);}):undefined;
  return new ReadableStream<Uint8Array>({pull(controller){
    try {
      if(method===0){const end=Math.min(position+64*1024,compressed.length);if(end>position){controller.enqueue(compressed.slice(position,end));written+=end-position;position=end;}if(position===compressed.length){if(written!==size)throw new ImportError('IMPORT_ARCHIVE_INVALID','The archive entry length does not match its directory.');controller.close();}return;}
      while(!pending.length&&!finished){const end=Math.min(position+64,compressed.length);finished=end===compressed.length;inflater!.push(compressed.subarray(position,end),finished);position=end;}
      if(pending.length)controller.enqueue(pending.shift()!);
      if(finished&&!pending.length){if(written!==size)throw new ImportError('IMPORT_ARCHIVE_INVALID','The archive entry length does not match its directory.');controller.close();}
    }catch(error){controller.error(error instanceof ImportError?error:new ImportError('IMPORT_ARCHIVE_INVALID','The archive entry could not be decompressed.'));}
  }});
}

/** Only type sniffing needs a prefix; the complete stream is independently
 * length-checked when the reviewed media is staged. */
export async function archivePrefix(body:ReadableStream<Uint8Array>,length=12) {
 const reader=body.getReader(),prefix=new Uint8Array(length);let size=0;
 try{while(size<length){const part=await reader.read();if(part.done)break;const take=Math.min(length-size,part.value.length);prefix.set(part.value.subarray(0,take),size);size+=take;}}finally{await reader.cancel();}
 return prefix.subarray(0,size);
}
