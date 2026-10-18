import {z} from 'zod';
import {commitOperation,mutationGuard} from '../../app/operations';
import type {FeatureContext} from '../../app/feature-context';
import {ApiProblem} from '../../app/problems';
import {readPage} from '../pages/service';
import {requirePageLevel} from '../sharing/current-access';
import {prepareReplaceBlocks} from '../editor/service';
import {tableSchema} from '../editor/tables/schema';
import type {TableContent,TableMerge} from '../editor/tables/model';
import {database,fields} from './repository';
import type {TableOrigin} from './table-conversion';
const rowLayout=z.object({rowId:z.string(),position:z.number().int().nonnegative(),colours:z.record(z.string(),z.enum(['none','grey','blue','green','yellow','red','purple'])),merges:z.array(z.object({rowId:z.string(),column:z.number().int().nonnegative(),rowSpan:z.number().int().positive(),colSpan:z.number().int().positive()}))});
/** Current record values, never a hidden copy of the table's original cell strings. */
export async function restoreTable(ctx:FeatureContext,id:string,input:{operationKey:string;expectedRevisionId:string;viewId:string;expectedViewRevisionId:string}) {
  return commitOperation(ctx,{operationKey:input.operationKey,action:'databases.table.restore',request:{id,...input},authorize:async()=>{await database(ctx,id,'edit');},prepare:async({revisionId})=>{
    const db=await database(ctx,id,'edit');
    const view=await ctx.db.prepare('SELECT display_json,revision_id FROM database_views WHERE id=? AND database_id=?').bind(input.viewId,id).first<{display_json:string;revision_id:string}>();
    const origin:TableOrigin|undefined=view?JSON.parse(view.display_json).tableOrigin:undefined;
    if(!origin||!Array.isArray(origin.fieldIds)||!Array.isArray(origin.headings)||origin.fieldIds.length!==origin.headings.length||!origin.layoutFieldId)throw new ApiProblem(409,'NO_TABLE_ORIGIN','This view was not converted from a table.');
    await requirePageLevel(ctx,origin.pageId,'edit');
    const source=await readPage(ctx,origin.pageId),block=source.blocks.find(b=>b.id===origin.blockId);
    if(block?.blockType!=='link-card'||(block.content as Record<string,unknown>).url!==`/app/databases/${id}`)throw new ApiProblem(409,'TABLE_TARGET_CHANGED','The original database link changed. Nothing was replaced.');
    const definitions=await fields(ctx,id);
    if(definitions.length!==origin.fieldIds.length+1||definitions.some(f=>f.type!=='text')||origin.fieldIds.some(field=>!definitions.some(f=>f.id===field))||!definitions.some(f=>f.id===origin.layoutFieldId))throw new ApiProblem(409,'TABLE_STRUCTURE_CHANGED','Keep the original text columns and layout field before converting back. No cells were changed.');
    const records=await ctx.db.prepare('SELECT r.page_id,r.field_values_json,r.revision_id FROM database_records r JOIN pages p ON p.id=r.page_id WHERE r.database_id=? AND p.deleted_at IS NULL AND p.trashed_at IS NULL AND p.archived_at IS NULL ORDER BY p.tree_position,p.id').bind(id).all<{page_id:string;field_values_json:string;revision_id:string}>();
    const guards=[mutationGuard(ctx.db,'SELECT revision_id=? FROM databases WHERE id=?',[input.expectedRevisionId,id]),mutationGuard(ctx.db,'SELECT revision_id=? FROM database_views WHERE id=? AND database_id=?',[input.expectedViewRevisionId,input.viewId,id]),mutationGuard(ctx.db,'SELECT COUNT(*)=? FROM database_records r JOIN pages p ON p.id=r.page_id WHERE r.database_id=? AND p.deleted_at IS NULL AND p.trashed_at IS NULL AND p.archived_at IS NULL',[records.results.length,id])];
    const rows:{id:string;cells:string[];position:number}[]=[],colours:NonNullable<TableContent['colours']>={},merges:TableMerge[]=[];
    for(const [index,record]of records.results.entries()){
      // A filtered view or a restricted record cannot silently turn into an incomplete table.
      await requirePageLevel(ctx,record.page_id,'view');
      const document=await readPage(ctx,record.page_id);
      if(!document.permissions.canEdit)throw new ApiProblem(403,'TABLE_RECORD_RESTRICTED','Edit access to every record is required to convert this database.');
      const values=JSON.parse(record.field_values_json),raw=values[origin.layoutFieldId];
      let layout;
      try{layout=raw?rowLayout.parse(JSON.parse(raw)):null;}catch{throw new ApiProblem(409,'TABLE_LAYOUT_CHANGED','A record has invalid table formatting. Nothing was replaced.');}
      const cells=origin.fieldIds.map(field=>{const value=values[field];if(value!==null&&value!==undefined&&typeof value!=='string')throw new ApiProblem(409,'TABLE_VALUE_CHANGED','Every table cell must be text.');return value??'';});
      rows.push({id:layout?.rowId??record.page_id,cells,position:layout?.position??Number.MAX_SAFE_INTEGER-index});
      Object.assign(colours,layout?.colours??{});merges.push(...(layout?.merges??[]));
      guards.push(mutationGuard(ctx.db,'SELECT r.revision_id=? AND p.revision_id=? FROM database_records r JOIN pages p ON p.id=r.page_id WHERE r.page_id=?',[record.revision_id,document.page.revisionId,record.page_id]));
    }
    rows.sort((a,b)=>a.position-b.position);
    const parsed=tableSchema.safeParse({caption:origin.caption,columns:origin.headings,rows:rows.map(({position,...row})=>row),headerColumn:origin.headerColumn,widths:origin.widths,colours,merges});
    if(!parsed.success)throw new ApiProblem(409,'TABLE_LAYOUT_CHANGED','Table formatting no longer fits these records. Nothing was replaced.');
    const change=await prepareReplaceBlocks(ctx,origin.pageId,{expectedRevisionId:source.page.revisionId,blocks:source.blocks.map(b=>b.id===origin.blockId?{...b,blockType:'table',content:parsed.data}:b)},revisionId);
    return {...change,statements:[...guards,...change.statements],value:{...change.value,pageId:origin.pageId}};
  }});
}
