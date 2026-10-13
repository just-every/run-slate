import { retainedText } from './documents';

// Positive classification: an unfamiliar or computed type remains subject-specific.
// These root values are retained literally by graphRecordValues, including native
// identifier/timestamp fields; only relation/file/computed values consult a viewer.
const scalarTypes=['text','number','checkbox','date','select','multi-select','status','person','url','email','phone','place','created-at','updated-at','identifier'];
export const scalarRecordTypesSql=scalarTypes.map(type=>`'${type}'`).join(',');
export interface RecordField { id:string; type:string; position:number }
export interface RecordFields { values:string; fields:RecordField[] }
export function isSharedRecord(record?:RecordFields):boolean {
 return !record||record.fields.every(field=>scalarTypes.includes(field.type));
}
/** Match the root record's field order, nulls and retained-text formatting exactly. */
export function sharedRecordText(record:RecordFields|undefined,published?:Record<string,unknown>):string {
 // Published records retain the body/fields separator even without field data.
 if(!record||published&&!published.databaseFields)return published?'\n':'';
 const values={...(published?published.databaseFields:JSON.parse(record.values)) as Record<string,unknown>};
 const fields:Record<string,unknown>={};
 for(const field of record.fields)fields[field.id]=values[field.id]??null;
 return '\n'+retainedText(JSON.stringify({fields}));
}
