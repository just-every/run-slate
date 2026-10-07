import {retainedText,type SearchDocument} from './documents';
export interface PublishedText {id:string;body_json:string;properties_json:string}
/** One normalization for normal writes, prior-data rebuild and atomic archive restore. */
export function searchTextRows(row:SearchDocument,workspace:string,revision?:PublishedText) {
 const variants=[{variant:'working',document:row}];
 if(revision){const properties=JSON.parse(revision.properties_json);variants.push({variant:'published',document:{...row,title:properties.title??row.title,text:row.kind==='comment-thread'?row.text:retainedText(revision.body_json),status:Object.hasOwn(properties,'statusKey')?properties.statusKey??null:row.status,revisionId:revision.id}});}
 return variants.map(({variant,document})=>({key:row.kind+':'+row.id,variant,workspace_id:workspace,kind:row.kind,id:row.id,page_id:row.pageId,title:document.title,text:document.text,title_fold:document.title.toLocaleLowerCase(),text_fold:document.text.toLocaleLowerCase(),document_json:JSON.stringify(document),container_id:document.containerId,status:document.status,lifecycle:document.lifecycle,archived_at:document.archivedAt,trashed_at:document.trashedAt,author_id:document.authorId,updated_at:document.updatedAt,contributors_json:JSON.stringify(document.contributors)}));
}
