import {commitOperation} from '../../app/operations';
import type {FeatureContext} from '../../app/feature-context';
import {ApiProblem} from '../../app/problems';
import {createUlid} from '../../shared/ulid';
import {readPage,prepareCreatePage,destination} from '../pages/service';
import {requirePageLevel} from '../sharing/current-access';
import {prepareReplaceBlocks} from '../editor/service';
import {tableSchema} from '../editor/tables/schema';
import {prepareImportedDatabase} from './import-plan';
import type {Field} from './values';
import {restoreTable} from './table-restore';
export {restoreTable};
export interface TableOrigin {pageId:string;blockId:string;fieldIds:string[];headings:string[];layoutFieldId:string;caption?:string;headerColumn?:boolean;widths?:number[]}
export async function convertTable(ctx:FeatureContext,input:{operationKey:string;pageId:string;blockId:string;expectedRevisionId:string}) {
  return commitOperation(ctx,{operationKey:input.operationKey,action:'databases.table.convert',request:input,
    authorize:async()=>{await requirePageLevel(ctx,input.pageId,'edit');},
    prepare:async({revisionId})=>{
      const source=await readPage(ctx,input.pageId),block=source.blocks.find(b=>b.id===input.blockId);
      if(block?.blockType!=='table')throw new ApiProblem(409,'TABLE_CHANGED','This block is no longer a table.');
      const table=tableSchema.parse(block.content);
      await destination(ctx,source.page.containerId,input.pageId);
      const id=createUlid(),dbPageId=createUlid(),dbRevision=createUlid(),viewId=createUlid(),layoutFieldId=createUlid();
      const fields:Field[]=table.columns.map((name,position)=>({id:createUlid(),name:name||`Column ${position+1}`,type:'text',config:{},position}));
      fields.push({id:layoutFieldId,name:'Table layout',type:'text',config:{},position:fields.length});
      const origin:TableOrigin={pageId:input.pageId,blockId:input.blockId,fieldIds:fields.slice(0,-1).map(f=>f.id),headings:table.columns,layoutFieldId,caption:table.caption,headerColumn:table.headerColumn,widths:table.widths};
      const dbPage=await prepareCreatePage(ctx,{operationKey:input.operationKey,id:dbPageId,containerId:source.page.containerId,parentPageId:input.pageId,pageKind:'database',title:table.caption||`${source.page.title} table`},dbRevision);
      const statements=[...dbPage.statements],records=[];
      for(const [position,row]of table.rows.entries()){
        const pageId=createUlid(),recordRevision=createUlid();
        const layout={rowId:row.id,position,colours:Object.fromEntries(Object.entries(table.colours??{}).filter(([key])=>key.startsWith(row.id+':'))),merges:(table.merges??[]).filter(m=>m.rowId===row.id)};
        const values=Object.fromEntries([...row.cells.map((cell,i)=>[fields[i]!.id,cell]),[layoutFieldId,JSON.stringify(layout)]]);
        const page=await prepareCreatePage(ctx,{operationKey:input.operationKey,id:pageId,containerId:source.page.containerId,parentPageId:dbPageId,pageKind:'record',databaseId:id,title:`Row ${position+1}`,properties:{databaseFields:values}},recordRevision,{containers:new Set(),pages:new Set([dbPageId])});
        statements.push(...page.statements);records.push({pageId,revisionId:recordRevision,values});
      }
      statements.push(...prepareImportedDatabase(ctx,{id,pageId:dbPageId,revisionId:dbRevision,fields,records}),ctx.db.prepare('INSERT INTO database_views (id,database_id,name,layout,filters_json,sorts_json,groups_json,calculations_json,display_json,position,created_at,updated_at,revision_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(viewId,id,'Table','table','[]','[]','[]','{}',JSON.stringify({visibleFieldIds:origin.fieldIds,tableOrigin:origin}),0,ctx.now,ctx.now,createUlid()));
      const replacement={...block,blockType:'link-card',content:{url:`/app/databases/${id}`,display:'card',previewState:'ready',preview:{title:table.caption||`${source.page.title} table`}}};
      const change=await prepareReplaceBlocks(ctx,input.pageId,{expectedRevisionId:input.expectedRevisionId,blocks:source.blocks.map(b=>b.id===input.blockId?replacement:b)},revisionId);
      return {...change,statements:[...statements,...change.statements],value:{...change.value,databaseId:id}};
    }});
}
