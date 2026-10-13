import type { FeatureContext } from '../../app/feature-context';
import { retainedText,type SearchDocument } from './documents';
import { recordGraph } from './record-graph';
import { graphRecordValues } from './record-values';

export async function visibleRecordDocuments(ctx:FeatureContext,rows:SearchDocument[],includeTrashed:boolean):Promise<SearchDocument[]> {
 const graph=await recordGraph(ctx,rows.map(r=>r.id),includeTrashed),result:SearchDocument[]=[];
 for(const row of rows){
  const permission=graph.access.get(row.id),node=graph.nodes.get(row.id);if(!permission?.decision.allowed||!node)continue;
  const published=!['edit','full'].includes(permission.decision.level!)&&node.published_revision_id&&node.published_revision_id!==node.working_revision_id;
  if(published&&(!node.body_json||!node.properties_json))continue;
  const properties=published?JSON.parse(node.properties_json!):{},hasFields=!published||properties.databaseFields;
  const fields=node.database_id&&hasFields?'\n'+retainedText(JSON.stringify({fields:graphRecordValues(graph,row.id)})):published?'\n':'';
  result.push(published?{...row,title:properties.title??row.title,text:retainedText(node.body_json!)+fields,status:row.status==='lapsed'?'lapsed':Object.hasOwn(properties,'statusKey')?properties.statusKey??null:row.status,revisionId:node.published_revision_id!}:{...row,text:row.text+fields});
 }
 return result;
}
