import type {FeatureContext} from '../../app/feature-context';
import {ApiProblem} from '../../app/problems';
import {contentQueryDefinitionSchema} from '../editor/query-definition';
import {requirePageLevel,requireContainerLevel,resolveCurrentAccessMany} from '../sharing/current-access';
import {readPage} from './service';
import {search} from '../search/service';
import {loadPageTrust} from '../search/trust';

/** A saved search contributes criteria, never the saving member's results or authority. */
export async function contentQuery(ctx:FeatureContext,pageId:string,raw:unknown) {
  await requirePageLevel(ctx,pageId,'view');
  const parsed=contentQueryDefinitionSchema.safeParse(raw);
  if(!parsed.success)throw new ApiProblem(400,'INVALID_QUERY','Choose a valid content query.');
  const definition=parsed.data;
  if(definition.container)await sourceAccess(()=>requireContainerLevel(ctx,definition.container!,'view'));
  if(definition.ancestor)await sourceAccess(()=>requirePageLevel(ctx,definition.ancestor!,'view'));
  const range=definition.dateRange?.split('/');
  if(range&&(range.length!==2||range.some(date=>!/^\d{4}-\d{2}-\d{2}$/.test(date))||range[0]!>range[1]!))
    throw new ApiProblem(400,'INVALID_DATE_RANGE','Use an inclusive start/end date range.');
  let searchIds:string[]|undefined;
  if(definition.search) {
    searchIds=[];let cursor:string|undefined;
    do {
      const found=await search(ctx,{...definition.search,limit:100,cursor});
      searchIds.push(...found.items.filter(item=>item.kind==='page'||item.kind==='record').map(item=>item.id));
      cursor=found.nextCursor;
    }while(cursor);
  }
  const rows=(await ctx.db.prepare(`SELECT p.id,p.parent_page_id,p.updated_at FROM pages p WHERE p.workspace_id=? AND p.lifecycle IN ('live','live-with-unpublished-changes') AND p.deleted_at IS NULL AND p.trashed_at IS NULL AND p.archived_at IS NULL AND (? IS NULL OR p.container_id=?) AND (? IS NULL OR p.page_kind=?) ORDER BY p.updated_at DESC,p.id`)
    .bind(ctx.actor.workspaceId,definition.container??null,definition.container??null,definition.pageType??null,definition.pageType??null).all<{id:string;parent_page_id:string|null;updated_at:string}>()).results;
  const rowById=new Map(rows.map(row=>[row.id,row]));
  const selected=searchIds?searchIds.flatMap(id=>{const row=rowById.get(id);return row?[row]:[];}):rows;
  const access=await resolveCurrentAccessMany(ctx,selected.map(row=>row.id));
  const parents=new Map(rows.map(row=>[row.id,row.parent_page_id]));
  const items=[];const revisions=new Map<string,string>();
  for(const row of selected) {
    if(!access.get(row.id)?.decision.allowed)continue;
    if(definition.contributor&&!await ctx.db.prepare('SELECT 1 FROM page_contributors WHERE page_id=? AND member_id=?').bind(row.id,definition.contributor).first())continue;
    if(definition.ancestor) {
      let parent=row.parent_page_id,found=false;const seen=new Set<string>();
      while(parent&&!seen.has(parent)) {
        if(parent===definition.ancestor){found=true;break;}
        seen.add(parent);
        if(!parents.has(parent))parents.set(parent,(await ctx.db.prepare('SELECT parent_page_id FROM pages WHERE id=? AND workspace_id=?').bind(parent,ctx.actor.workspaceId).first<{parent_page_id:string|null}>())?.parent_page_id??null);
        parent=parents.get(parent)??null;
      }
      if(!found)continue;
    }
    const doc=await readPage(ctx,row.id);
    const revision=(doc.permissions.level==='view'||doc.permissions.level==='comment')&&doc.publishedRevisionId?doc.publishedRevisionId:doc.workingRevisionId;
    revisions.set(row.id,revision);
    const delivered=await ctx.db.prepare('SELECT created_at FROM page_revisions WHERE id=? AND page_id=?').bind(revision,row.id).first<{created_at:string}>();
    if(!delivered)throw new ApiProblem(409,'QUERY_CHANGED','A query result changed. Run the query again.');
    const publishedOnly=(doc.permissions.level==='view'||doc.permissions.level==='comment')&&doc.publishedRevisionId&&doc.publishedRevisionId!==doc.workingRevisionId;
    const updated=publishedOnly?delivered.created_at:doc.updatedAt;
    if(range&&(updated.slice(0,10)<range[0]!||updated.slice(0,10)>range[1]!))continue;
    if(definition.label&&!doc.properties.labels.some(label=>label.toLocaleLowerCase()===definition.label!.toLocaleLowerCase()))continue;
    items.push({...doc.page,updatedAt:updated,statusKey:doc.properties.statusKey});
  }
  if(definition.orderBy==='title')items.sort((a,b)=>a.title.localeCompare(b.title)||a.id.localeCompare(b.id));
  else if(definition.orderBy==='updated')items.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)||a.id.localeCompare(b.id));
  const trust=await loadPageTrust(ctx,items.map(item=>item.id),revisions);
  const limited=items.filter(item=>!definition.status||(trust.get(item.id)?.state==='lapsed'?'lapsed':item.statusKey)===definition.status).slice(0,definition.limit??20);
  return {items:limited.map(({statusKey:_,...item})=>({...item,trust:trust.get(item.id)})),ranAt:ctx.now};
}
async function sourceAccess(read:()=>Promise<unknown>) {
  try{await read();}catch(error){if(error instanceof ApiProblem&&[403,404].includes(error.status))throw new ApiProblem(404,'QUERY_SOURCE_UNAVAILABLE','The query source is unavailable.');throw error;}
}
