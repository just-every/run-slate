import { indexTokens } from './tokens';
import {retainedText,type SearchDocument} from './documents';
import { isSharedRecord,sharedRecordText,type RecordFields } from './shared-records';
import { minHashShingles } from './minhash';
export interface PublishedText {id:string;body_json:string;properties_json:string}
/** One normalization for normal writes, prior-data rebuild and atomic archive restore. */
export function searchTextRows(row:SearchDocument,workspace:string,revision?:PublishedText,record?:RecordFields) {
 const shared=row.kind==='record'&&isSharedRecord(record);
 const variants=[{variant:'working',document:shared?{...row,text:row.text+sharedRecordText(record)}:row}];
 if(revision){const properties=JSON.parse(revision.properties_json);variants.push({variant:'published',document:{...row,title:properties.title??row.title,text:row.kind==='comment-thread'?row.text:retainedText(revision.body_json)+(shared?sharedRecordText(record,properties):''),status:shared&&row.status==='lapsed'?'lapsed':Object.hasOwn(properties,'statusKey')?properties.statusKey??null:row.status,revisionId:revision.id}});}
 return variants.map(({variant,document})=>{
  const title=document.title.toLocaleLowerCase(),text=document.text.toLocaleLowerCase();
  const indexed=document.kind==='page'?{...document,_minHash:minHashShingles(document.text)}:shared?{...document,title_fold:title,text_fold:text}:document;
  return {key:row.kind+':'+row.id,variant,workspace_id:workspace,kind:row.kind,id:row.id,page_id:row.pageId,title:document.title,text:document.text,title_fold:title,text_fold:text,tokens:indexTokens(title,text),record_shared:Number(shared),document_json:JSON.stringify(indexed),container_id:document.containerId,status:document.status,lifecycle:document.lifecycle,archived_at:document.archivedAt,trashed_at:document.trashedAt,author_id:document.authorId,updated_at:document.updatedAt,contributors_json:JSON.stringify(document.contributors)};
 });
}
