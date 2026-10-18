import {contentLimits} from '../limits';
export const tableLimits={columns:contentLimits.tableColumns,rows:contentLimits.tableRows};
export const tableColours = {none:'transparent',grey:'#e5e7eb',blue:'#dbeafe',green:'#dcfce7',yellow:'#fef9c3',red:'#fee2e2',purple:'#f3e8ff'} as const;
export interface TableMerge {rowId:string;column:number;rowSpan:number;colSpan:number}
export interface TableContent {caption?:string;columns:string[];rows:{id:string;cells:string[]}[];headerColumn?:boolean;widths?:number[];colours?:Record<string,keyof typeof tableColours>;merges?:TableMerge[]}
export function cellLayout(table:TableContent,row:number,column:number) {
  for(const merge of table.merges??[]) {
    const start=table.rows.findIndex(r=>r.id===merge.rowId);
    if(row>=start&&row<start+merge.rowSpan&&column>=merge.column&&column<merge.column+merge.colSpan)
      return {hidden:row!==start||column!==merge.column,rowSpan:merge.rowSpan,colSpan:merge.colSpan};
  }
  return {hidden:false,rowSpan:1,colSpan:1};
}
/** Quoted tabs, embedded newlines and escaped quotes from Excel/Sheets remain cell text. */
export function spreadsheetCells(source:string):string[][] {
  const rows:string[][]=[];let row:string[]=[],cell='',quoted=false;
  for(let i=0;i<source.length;i++) {
    const ch=source[i];
    if(ch==='"' && (quoted||cell==='')) {if(quoted&&source[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
    else if(!quoted&&(ch==='\t'||ch==='\n'||ch==='\r')) {row.push(cell);cell='';if(ch!=='\t'){rows.push(row);row=[];if(ch==='\r'&&source[i+1]==='\n')i++;}}
    else cell+=ch;
  }
  if(cell!==''||row.length||!rows.length){row.push(cell);rows.push(row);}
  const width=Math.max(...rows.map(r=>r.length));return rows.map(r=>Array.from({length:width},(_,i)=>r[i]??''));
}
export function pasteCells<T extends TableContent>(table:T,row:number,column:number,cells:string[][]):T {
  const width=Math.max(table.columns.length,column+cells[0]!.length);
  const columns=Array.from({length:width},(_,i)=>table.columns[i]??'');
  const count=Math.max(table.rows.length,row+cells.length);
  const rows=Array.from({length:count},(_,i)=>({id:table.rows[i]?.id??crypto.randomUUID(),cells:Array.from({length:width},(_,j)=>table.rows[i]?.cells[j]??'')}));
  cells.forEach((values,i)=>values.forEach((value,j)=>{if(row+i===-1)columns[column+j]=value;else rows[row+i]!.cells[column+j]=value;}));
  return {...table,columns,rows,widths:columns.map((_,i)=>table.widths?.[i]??180),merges:[]};
}
export function resizeTable<T extends TableContent>(table:T,axis:'row'|'column',index:number,remove=false):T {
  if(axis==='row') {
    const rows=[...table.rows];if(remove)rows.splice(index,1);else rows.splice(index+1,0,{id:crypto.randomUUID(),cells:table.columns.map(()=>'')});
    return {...table,rows,colours:Object.fromEntries(Object.entries(table.colours??{}).filter(([key])=>rows.some(row=>key.startsWith(row.id+':')))),merges:[]};
  }
  const columns=[...table.columns],widths=table.columns.map((_,i)=>table.widths?.[i]??180);
  if(remove){columns.splice(index,1);widths.splice(index,1);}else{columns.splice(index+1,0,'');widths.splice(index+1,0,180);}
  const rows=table.rows.map(row=>{const cells=[...row.cells];if(remove)cells.splice(index,1);else cells.splice(index+1,0,'');return {...row,cells};});
  const colours:TableContent['colours']={};
  for(const [key,value]of Object.entries(table.colours??{})){const colon=key.lastIndexOf(':'),rowId=key.slice(0,colon),col=Number(key.slice(colon+1));if(remove&&col===index)continue;colours[`${rowId}:${col>index?col+(remove?-1:1):col}`]=value;}
  return {...table,columns,rows,widths,colours,merges:[]};
}
/** Vertically merged rows travel as one group when sorting. */
export function sortTable<T extends TableContent>(table:T,column:number,descending=false):T {
  const groups:typeof table.rows[]=[];
  for(let i=0;i<table.rows.length;) {
    let end=i+1;
    for(let row=i;row<end;row++)for(const merge of table.merges??[])if(merge.rowId===table.rows[row]?.id)end=Math.max(end,row+merge.rowSpan);
    groups.push(table.rows.slice(i,end));i=end;
  }
  groups.sort((a,b)=>(a[0]!.cells[column]??'').localeCompare(b[0]!.cells[column]??'',undefined,{numeric:true,sensitivity:'base'})*(descending?-1:1));
  return {...table,rows:groups.flat()};
}
