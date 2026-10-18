import {useState} from 'react';
import {Button} from '../../../../ui';
import {resizeTable,sortTable,tableColours} from '../../tables/model';
import type {TableBlockData} from '../types';
export function TableTools({block,row,column,onSelect,onChange,onConvert}:{block:TableBlockData;row:number;column:number;onSelect:(r:number,c:number)=>void;onChange:(b:TableBlockData)=>void;onConvert?:()=>void}) {
  const [rows,setRows]=useState(1),[cols,setCols]=useState(2);
  const rowId=block.rows[row]?.id;
  const resize=(axis:'row'|'column',remove=false)=>{onChange(resizeTable(block,axis,axis==='row'?row:column,remove));onSelect(Math.max(0,Math.min(row,block.rows.length-(remove?2:0))),Math.max(0,Math.min(column,block.columns.length-(remove?2:0))));};
  return <details className="border-t border-line p-2"><summary className="cursor-pointer text-small">Table tools</summary><div className="flex flex-wrap items-end gap-2 py-2">
    <label className="text-small">Row<select aria-label="Table row" value={row} onChange={e=>onSelect(Number(e.target.value),column)}>{block.rows.map((r,i)=><option key={r.id} value={i}>{i+1}</option>)}</select></label>
    <label className="text-small">Column<select aria-label="Table column" value={column} onChange={e=>onSelect(row,Number(e.target.value))}>{block.columns.map((c,i)=><option key={i} value={i}>{c||i+1}</option>)}</select></label>
    <Button size="sm" variant="secondary" onClick={()=>resize('row')}>Add row</Button><Button size="sm" variant="secondary" disabled={!rowId} onClick={()=>resize('row',true)}>Remove row</Button>
    <Button size="sm" variant="secondary" onClick={()=>resize('column')}>Add column</Button><Button size="sm" variant="secondary" disabled={block.columns.length<=1} onClick={()=>resize('column',true)}>Remove column</Button>
    <Button size="sm" variant="secondary" onClick={()=>onChange(sortTable(block,column))}>Sort ascending</Button><Button size="sm" variant="secondary" onClick={()=>onChange(sortTable(block,column,true))}>Sort descending</Button>
    <label className="text-small">Width<input aria-label="Column width" type="number" min={40} max={1200} value={block.widths?.[column]??180} onChange={e=>{const value=Number(e.target.value);if(value>=40&&value<=1200)onChange({...block,widths:block.columns.map((_,i)=>i===column?value:block.widths?.[i]??180)});}}/></label>
    <label className="text-small">Colour<select aria-label="Cell colour" disabled={!rowId} value={block.colours?.[`${rowId}:${column}`]??'none'} onChange={e=>onChange({...block,colours:{...block.colours,[`${rowId}:${column}`]:e.target.value as keyof typeof tableColours}})}>{Object.keys(tableColours).map(c=><option key={c} value={c}>{c}</option>)}</select></label>
    <label className="text-small"><input type="checkbox" checked={!!block.headerColumn} onChange={e=>onChange({...block,headerColumn:e.target.checked})}/> Header column</label>
    <label className="text-small">Merge rows<input aria-label="Merge rows" type="number" min={1} max={block.rows.length-row} value={rows} onChange={e=>setRows(Number(e.target.value))}/></label>
    <label className="text-small">Merge columns<input aria-label="Merge columns" type="number" min={1} max={block.columns.length-column} value={cols} onChange={e=>setCols(Number(e.target.value))}/></label>
    <Button size="sm" variant="secondary" disabled={!rowId||rows<1||cols<1||row+rows>block.rows.length||column+cols>block.columns.length} onClick={()=>onChange({...block,merges:[...(block.merges??[]).filter(m=>{const r=block.rows.findIndex(row=>row.id===m.rowId);return r+m.rowSpan<=row||r>=row+rows||m.column+m.colSpan<=column||m.column>=column+cols;}),{rowId:rowId!,column,rowSpan:rows,colSpan:cols}]})}>Merge cells</Button>
    <Button size="sm" variant="secondary" disabled={!block.merges?.length} onClick={()=>onChange({...block,merges:[]})}>Unmerge cells</Button>
    {onConvert?<Button size="sm" variant="secondary" onClick={onConvert}>Convert to database</Button>:null}
  </div><p className="text-tiny text-ink-muted">Paste a spreadsheet range into a cell. Alt Shift ↓/↑ adds/removes a row; →/← adds/removes a column. Merging keeps every underlying cell; unmerge to edit covered cells.</p></details>;
}
