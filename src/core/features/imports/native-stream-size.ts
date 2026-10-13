import {planContentBytes,type ImportPlan,type ImportStreamPlan} from '../../../../modules/import-kit/src/d1/index.ts';
import {expandCompressedPlan} from '../../../../modules/import-kit/src/d1/compressed-plan.ts';

/** Measure the same full canonical plan from Kit's independently verified pages.
 * Only one bounded page is expanded; the native mapper is never called twice. */
export function nativeStreamPlanBytes(stream:ImportStreamPlan):number {
 let bytes=planContentBytes({...stream.header,source:{...stream.header.source,records:[]},entries:[],fingerprint:''} as ImportPlan),count=0;
 for(const encoded of stream.pages){
  const part=expandCompressedPlan(encoded);
  bytes+=planContentBytes(part)-planContentBytes({...part,entries:[],source:{...part.source,records:[]}});
  if(count&&part.entries.length)bytes+=2;
  count+=part.entries.length;
 }
 return bytes;
}
