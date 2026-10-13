import {sanitizeSvg} from './sanitize';
import {ApiProblem} from '../../app/problems';
export interface ImportedByteSource {sizeBytes:number;open:()=>ReadableStream<Uint8Array>}
export async function sanitizedImportBytes(source:ImportedByteSource){return new TextEncoder().encode(sanitizeSvg(await new Response(source.open()).text()));}
/** R2 receives a known-length stream, with actual length checked by both the
 * archive reader and FixedLengthStream. No full attachment copy is retained. */
export async function storeImportedSource(files:R2Bucket,key:string,type:string,source:ImportedByteSource,expectedSize=source.sizeBytes){
  if(type==='image/svg+xml'){
    const bytes=await sanitizedImportBytes(source);
    if(bytes.length!==expectedSize)throw new ApiProblem(409,'IMPORT_MEDIA_CHANGED','The reviewed attachment changed.');
    await files.put(key,bytes,{httpMetadata:{contentType:type}});return;
  }
  if(!expectedSize){const bytes=await new Response(source.open()).arrayBuffer();if(bytes.byteLength)throw new ApiProblem(409,'IMPORT_MEDIA_CHANGED','The reviewed attachment changed.');await files.put(key,new Uint8Array(),{httpMetadata:{contentType:type}});return;}
  const fixed=new FixedLengthStream(expectedSize);
  await Promise.all([source.open().pipeTo(fixed.writable),files.put(key,fixed.readable,{httpMetadata:{contentType:type}})]);
}
