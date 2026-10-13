import {createHash} from 'node:crypto';
import {Buffer} from 'node:buffer';
import {brotliCompressSync,brotliDecompressSync,constants} from 'node:zlib';
import {canonicalJson,sha256,type SourceBundle,type ImportMapping,type Json} from '../../../../modules/import-kit/src/d1/index.ts';
import type {NativeUnit} from './native-plan';

export interface PackedNativeUnit {kind:string;id:string;compression:'brotli';size:number;hash:string;data:string}
export interface StoredNativeSource {version:3;source:SourceBundle;units:PackedNativeUnit[]}
export interface LegacyNativeSource {version:2;source:SourceBundle;units:NativeUnit[]}

/** Compression is custody only. The unchanged Kit mapper receives the complete
 * native rows, and the reviewed manifest continues to hash those exact rows. */
export function packNativeUnit(unit:NativeUnit):PackedNativeUnit {
 const body=canonicalJson(unit as unknown as Json);
 // JSON.parse may return an id backed by the entire expanded unit string.
 // Copy the small identity before releasing that string during v2 restoration.
 const compressed=brotliCompressSync(body,{params:{[constants.BROTLI_PARAM_QUALITY]:4,[constants.BROTLI_PARAM_LGWIN]:18}});
 return {kind:JSON.parse(JSON.stringify(unit.kind)) as string,id:JSON.parse(JSON.stringify(unit.id)) as string,compression:'brotli',size:Buffer.byteLength(body),hash:sha256(body),data:Buffer.from(compressed).toString('base64')};
}
function unpackNativeUnit(packed:PackedNativeUnit):NativeUnit {
 if(packed.compression!=='brotli'||!Number.isSafeInteger(packed.size)||packed.size<0||!/^[a-f0-9]{64}$/.test(packed.hash)||typeof packed.data!=='string')throw new Error('IMPORT_NATIVE_SOURCE_CHANGED');
 const input=Buffer.from(packed.data,'base64');
 // workerd counts Brotli's decoder workspace in this allowance; the decoded
 // bytes must still exactly equal the authenticated, declared unit size.
 const result=brotliDecompressSync(input,{info:true,maxOutputLength:packed.size+2*1024*1024}) as unknown as {buffer:Buffer;engine:{bytesWritten:number}};
 if(input.toString('base64')!==packed.data||result.engine.bytesWritten!==input.length||result.buffer.length!==packed.size||sha256(result.buffer)!==packed.hash)throw new Error('IMPORT_NATIVE_SOURCE_CHANGED');
 const unit=JSON.parse(Buffer.from(result.buffer).toString('utf8')) as NativeUnit;
 if(unit.kind!==packed.kind||unit.id!==packed.id||sha256(canonicalJson(unit as unknown as Json))!==packed.hash)throw new Error('IMPORT_NATIVE_SOURCE_CHANGED');
 // Kit retains target identities across pages; those identities must not keep
 // JSON.parse's expanded unit backing string alive through a sliced string.
 unit.kind=packed.kind;unit.id=packed.id;
 return unit;
}
/** Keep only independently compressed units, never the complete expanded native
 * source. A mapper invocation expands one unit; Kit owns its bounded page copy. */
export function normalizedNativeSource(units:NativeUnit[],consume=false):StoredNativeSource {
 const packed=units.map((unit,index)=>{const retained=packNativeUnit(unit);if(consume)delete units[index];return retained;});
 const records=packed.map(unit=>{
  const payload={nativeKind:unit.kind,nativeId:unit.id,nativeUnitHash:unit.hash};
  return {namespace:'slate-native-import',kind:unit.kind,sourceId:unit.id,payload,payloadHash:sha256(canonicalJson(payload)),artifactHash:'',location:{artifact:'slate-native-manifest.json'}};
 });
 const hash=createHash('sha256');hash.update('[');let size=2;
 records.forEach((record,index)=>{const encoded=canonicalJson(record.payload);if(index){hash.update(',');size++;}hash.update(encoded);size+=Buffer.byteLength(encoded);});hash.update(']');const digest=hash.digest('hex');
 for(const record of records)record.artifactHash=digest;
 return {version:3,source:{artifacts:[{name:'slate-native-manifest.json',sha256:digest,size}],records,diagnostics:[]},units:packed};
}
export function nativeSourceMapping(stored:StoredNativeSource,consume=false):ImportMapping {
 const units=new Map(stored.units.map((unit,index)=>[`${unit.kind}:${unit.id}`,index]));
 if(units.size!==stored.units.length||units.size!==stored.source.records.length)throw new Error('DUPLICATE_NATIVE_SOURCE');
 return {version:'slate-native-v1',map(record){
  const metadata=record.payload as {nativeKind:string;nativeId:string;nativeUnitHash:string};
  const key=`${record.kind}:${record.sourceId}`,index=units.get(key),packed=index===undefined?undefined:stored.units[index];
  if(!packed||metadata.nativeKind!==packed.kind||metadata.nativeId!==packed.id||metadata.nativeUnitHash!==packed.hash)throw new Error('IMPORT_NATIVE_SOURCE_CHANGED');
  const unit=unpackNativeUnit(packed);
  // collectStreamPages maps each record once. After verified decoding, release
  // its compressed input as Kit takes custody of the bounded normalized page.
  // A retry always opens a new retained source, never this consumed invocation.
  if(consume){units.delete(key);delete stored.units[index!];}
  return {effects:[{targetKind:unit.kind,targetId:unit.id,value:{unit:unit as unknown as Json}}]};
 }};
}
export function restoredNativeSource(value:StoredNativeSource|LegacyNativeSource,consume=false):{source:SourceBundle;mapping:ImportMapping} {
 if(value.version!==2&&value.version!==3)throw new Error('IMPORT_SOURCE_VERSION');
 const stored:StoredNativeSource=value.version===3?value:{version:3,source:value.source,units:value.units.map(packNativeUnit)};
 return {source:stored.source,mapping:nativeSourceMapping(stored,consume)};
}
