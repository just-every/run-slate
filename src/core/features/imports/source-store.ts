import {packNativeUnit,type PackedNativeUnit,type StoredNativeSource} from './native-source';
import type {NativeUnit} from './native-plan';
import {SourceJsonReader} from './source-json-reader';

/** Independent compressed units retain the same manifest and complete native
 * effects. Neither writing nor cold reading constructs a whole-source body. */
export async function storeNormalizedSource(files:R2Bucket,key:string,stored:StoredNativeSource){
 const start=`{"version":3,"source":${JSON.stringify(stored.source)},"units":[`,end=']}';
 const encoder=new TextEncoder();let size=encoder.encode(start).length+end.length;
 for(let index=0;index<stored.units.length;index++)size+=encoder.encode(JSON.stringify(stored.units[index])).length+(index?1:0);
 let cursor=-1;
 const body=new ReadableStream<Uint8Array>({pull(controller){if(cursor<0){controller.enqueue(encoder.encode(start));cursor=0;}else if(cursor<stored.units.length){controller.enqueue(encoder.encode((cursor?',':'')+JSON.stringify(stored.units[cursor])));cursor++;}else{controller.enqueue(encoder.encode(end));controller.close();}}});
 const fixed=new FixedLengthStream(size);
 await Promise.all([body.pipeTo(fixed.writable),files.put(key,fixed.readable,{httpMetadata:{contentType:'application/json'}})]);
}

/** The pre-v3 retained JSON is read one unit at a time and compacted immediately.
 * Its original manifest and reviewed fingerprint are unchanged. Existing jobs,
 * applied targets and archives are never rewritten or discarded by restoration. */
export async function readNormalizedSource(body:ReadableStream<Uint8Array>):Promise<StoredNativeSource> {
 const reader=new SourceJsonReader(body),units:PackedNativeUnit[]=[];
 let version:number|undefined,source:StoredNativeSource['source']|undefined;
 const seen=new Set<string>();
 try {
  await reader.expect('{');
  while(await reader.peek()!=='}'){
   if(seen.size)await reader.expect(',');
   const name=await reader.value();
   if(typeof name!=='string'||seen.has(name)||!['version','source','units'].includes(name))throw new Error('IMPORT_SOURCE_VERSION');
   seen.add(name);await reader.expect(':');
   if(name==='version'){version=await reader.value() as number;if(version!==2&&version!==3)throw new Error('IMPORT_SOURCE_VERSION');}
   else if(name==='source')source=await reader.value() as StoredNativeSource['source'];
   else {
    // Both writers put the format before units. Refuse ambiguous custody.
    if(version!==2&&version!==3)throw new Error('IMPORT_SOURCE_VERSION');
    await reader.expect('[');
    while(await reader.peek()!==']'){
     if(units.length)await reader.expect(',');
     const unit=await reader.value();
     units.push(version===2?packNativeUnit(unit as NativeUnit):unit as PackedNativeUnit);
    }
    await reader.expect(']');
   }
  }
  await reader.expect('}');await reader.end();
  if(!source||seen.size!==3||!Array.isArray(source.records)||source.records.length!==units.length)throw new Error('IMPORT_NATIVE_SOURCE_CHANGED');
  return {version:3,source,units};
 }finally{await reader.close();}
}
