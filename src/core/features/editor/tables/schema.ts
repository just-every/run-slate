import {tableLimits} from './model';
import {z} from 'zod';
export const tableSchema=z.object({
  caption:z.string().optional(),columns:z.array(z.string()).min(1).max(tableLimits.columns),
  rows:z.array(z.object({id:z.string().min(1),cells:z.array(z.string()).max(tableLimits.columns)})).max(tableLimits.rows),
  headerColumn:z.boolean().optional(),widths:z.array(z.number().int().min(40).max(1200)).max(tableLimits.columns).optional(),
  colours:z.record(z.string(),z.enum(['none','grey','blue','green','yellow','red','purple'])).optional(),
  merges:z.array(z.object({rowId:z.string(),column:z.number().int().nonnegative(),rowSpan:z.number().int().positive(),colSpan:z.number().int().positive()})).max(tableLimits.rows*tableLimits.columns).optional(),
}).superRefine((table,ctx)=>{
  const ids=new Set(table.rows.map(r=>r.id));
  if(ids.size!==table.rows.length||table.rows.some(r=>r.cells.length!==table.columns.length))ctx.addIssue({code:'custom',message:'Table rows must have unique IDs and one cell per column.'});
  if(table.widths&&table.widths.length!==table.columns.length)ctx.addIssue({code:'custom',message:'Column widths must match the columns.'});
  const occupied=new Set<string>();
  for(const merge of table.merges??[]){
    const row=table.rows.findIndex(r=>r.id===merge.rowId);
    if(row<0||row+merge.rowSpan>table.rows.length||merge.column+merge.colSpan>table.columns.length){ctx.addIssue({code:'custom',message:'Merged cells must fit inside the table.'});continue;}
    for(let r=row;r<row+merge.rowSpan;r++)for(let c=merge.column;c<merge.column+merge.colSpan;c++){const key=`${r}:${c}`;if(occupied.has(key)){ctx.addIssue({code:'custom',message:'Merged cells cannot overlap.'});return;}occupied.add(key);}
  }
  for(const key of Object.keys(table.colours??{})){
    const separator=key.lastIndexOf(':'),row=key.slice(0,separator),column=Number(key.slice(separator+1));
    if(!ids.has(row)||!Number.isInteger(column)||column<0||column>=table.columns.length)ctx.addIssue({code:'custom',message:'Cell colours must name a table cell.'});
  }
});
