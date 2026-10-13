import {createHash} from 'node:crypto';
import {Inflate} from 'fflate';
import {archiveMediaType,listZipDirectory,validateZipLocalHeader,zipDirectoryInfo} from './archive';
import {archivePrefix,registerArchiveSources,inflateArchiveEntry,type ArchiveMediaSource} from './archive-stream';
import {importSafetyLimits} from './safety';
import {ImportError} from './errors';

export interface RetainedZipEntry {start:number;compressedBytes:number;expandedBytes:number;method:number}
/** Range reads stay bound to the exact retained object's ETag. */
export function retainedZipBody(bucket:R2Bucket,key:string,etag:string,entry:RetainedZipEntry):ReadableStream<Uint8Array> {
  let reader:ReadableStreamDefaultReader<Uint8Array>|undefined,input:Uint8Array=new Uint8Array(),position=0,received=0,written=0,ended=entry.compressedBytes===0,finished=false;
  const pending:Uint8Array[]=[];
  const output=(chunk:Uint8Array)=>{written+=chunk.length;if(written>entry.expandedBytes)throw new ImportError('IMPORT_ARCHIVE_LIMIT_EXCEEDED','The archive expands beyond the import safety limits.');if(chunk.length)pending.push(chunk);};
  const inflater=entry.method===8?new Inflate(output):undefined;
  return new ReadableStream<Uint8Array>({
    async pull(controller){try{
      if(!reader&&!ended){const object=await bucket.get(key,{range:{offset:entry.start,length:entry.compressedBytes},onlyIf:{etagMatches:etag}});if(!object||!('body' in object))throw new ImportError('IMPORT_ARCHIVE_INVALID','The retained archive changed.');reader=object.body.getReader();}
      while(!pending.length&&!finished){
        if(position===input.length&&!ended){const next=await reader!.read();if(next.done)ended=true;else{input=next.value;position=0;received+=input.length;if(received>entry.compressedBytes)throw new ImportError('IMPORT_ARCHIVE_INVALID','The retained archive range has an invalid length.');}}
        if(ended){if(received!==entry.compressedBytes)throw new ImportError('IMPORT_ARCHIVE_INVALID','The retained archive range is incomplete.');if(inflater)inflater.push(new Uint8Array(),true);finished=true;}
        else {const end=Math.min(position+(inflater?64:64*1024),input.length),chunk=input.subarray(position,end);if(inflater)inflater.push(chunk,false);else output(chunk.slice());position=end;}
      }
      if(pending.length)controller.enqueue(pending.shift()!);
      if(finished&&!pending.length){if(written!==entry.expandedBytes)throw new ImportError('IMPORT_ARCHIVE_INVALID','The archive entry length does not match its directory.');controller.close();}
    }catch(error){await reader?.cancel();controller.error(error instanceof ImportError?error:new ImportError('IMPORT_ARCHIVE_INVALID','The archive entry could not be decompressed.'));}},
    async cancel(){await reader?.cancel();},
  });
}

/** Metadata and parser text use a two-MiB range window. Media remains a real
 * lazy R2 stream, so a 512-MiB export never becomes a 512-MiB byte map. */
export async function readRetainedZip(bucket:R2Bucket,key:string,textEntry:(path:string)=>boolean) {
  const object=await bucket.head(key),limits=importSafetyLimits();
  if(!object)throw new ImportError('IMPORT_ARCHIVE_INVALID','The retained archive is missing.');
  if(object.size>limits.maximumArchiveBytes)throw new ImportError('IMPORT_FILE_TOO_LARGE','The archive exceeds the maximum import size.');
  const etag=object.etag;
  const range=async(offset:number,length:number)=>{
    if(!length)return new Uint8Array();
    const result=await bucket.get(key,{range:{offset,length},onlyIf:{etagMatches:etag}});
    if(!result||!('body' in result))throw new ImportError('IMPORT_ARCHIVE_INVALID','The retained archive changed.');
    const bytes=new Uint8Array(await result.arrayBuffer());if(bytes.length!==length)throw new ImportError('IMPORT_ARCHIVE_INVALID','The retained archive range is incomplete.');return bytes;
  };
  const tail=await range(Math.max(0,object.size-65557),Math.min(65557,object.size)),info=zipDirectoryInfo(tail);
  if(info.directoryOffset+info.directorySize>object.size)throw new ImportError('IMPORT_ARCHIVE_INVALID','The archive directory is outside the retained file.');
  const directory=listZipDirectory(await range(info.directoryOffset,info.directorySize),limits,{info,archiveSize:object.size});
  let windowStart=-1,window=new Uint8Array();
  const windowAt=async(offset:number)=>{if(offset<windowStart||offset+131102>windowStart+window.length&&windowStart+window.length<object.size){windowStart=offset;window=await range(offset,Math.min(2*1024*1024,object.size-offset));}return window.subarray(offset-windowStart);};
  const descriptors=new Map<string,RetainedZipEntry>(),media=new Map<string,ArchiveMediaSource>(),text=new Map<string,Uint8Array>();
  for(const entry of [...directory].sort((a,b)=>a.localHeaderOffset-b.localHeaderOffset)){
    const header=await windowAt(entry.localHeaderOffset),start=validateZipLocalHeader(header,entry,0,object.size);
    if(entry.directory)continue;
    const descriptor={start,compressedBytes:entry.compressedBytes,expandedBytes:entry.expandedBytes,method:entry.method};descriptors.set(entry.path,descriptor);
    const source:ArchiveMediaSource={sizeBytes:entry.expandedBytes,retained:descriptor,open:()=>retainedZipBody(bucket,key,etag,descriptor)};
    media.set(entry.path,source);
    if(textEntry(entry.path)){
      const local=start-windowStart;
      const body=local>=0&&local+entry.compressedBytes<=window.length?inflateArchiveEntry(window.subarray(local,local+entry.compressedBytes),entry.method,entry.expandedBytes):retainedZipBody(bucket,key,etag,descriptor);
      text.set(entry.path,new Uint8Array(await new Response(body).arrayBuffer()));
    }else if(archiveMediaType(entry.path)==='application/octet-stream'){
      const local=start-windowStart,body=local>=0&&local+entry.compressedBytes<=window.length?inflateArchiveEntry(window.subarray(local,local+entry.compressedBytes),entry.method,entry.expandedBytes):source.open();
      source.prefix=await archivePrefix(body);
    }
  }
  // Only genuine parser text is materialized; each media getter fails rather
  // than pretending an unextracted attachment has an empty byte payload.
  class Files extends Map<string,Uint8Array>{
    constructor(){super();for(const path of descriptors.keys())super.set(path,new Uint8Array());}
    override get(path:string){if(!super.has(path))return undefined;const bytes=text.get(path);if(!bytes)throw new Error('Archive media requires its asynchronous retained source.');return bytes;}
  }
  const files=new Files();registerArchiveSources(files,media);
  // Normalization has consumed the text once. Media remains bound to its
  // independent original range source, including entries also parsed as text.
  const releaseParserText=()=>{text.clear();window=new Uint8Array();};
  return {files,etag,descriptors,releaseParserText};
}

export async function retainedArchiveHash(bucket:R2Bucket,key:string,etag?:string):Promise<string>{
  const object=await bucket.get(key,etag?{onlyIf:{etagMatches:etag}}:undefined);
  if(!object||!('body' in object))throw new ImportError('IMPORT_ARCHIVE_INVALID','The retained archive changed.');
  const hash=createHash('sha256'),reader=object.body.getReader();let size=0;
  for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;hash.update(part.value);}
  if(size!==object.size)throw new ImportError('IMPORT_ARCHIVE_INVALID','The retained archive is incomplete.');return hash.digest('hex');
}
