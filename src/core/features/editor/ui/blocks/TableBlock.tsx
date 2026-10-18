import {useState} from 'react';
import {Table,TableBody,TableCaption,TableCell,TableHead,TableHeader,TableRow} from '../../../../ui';
import type {BlockRenderProps,TableBlockData} from '../types';
import {EditableLine} from './Editable';
import {TableTools} from './TableTools';
import {cellLayout,pasteCells,resizeTable,spreadsheetCells,tableColours,tableLimits} from '../../tables/model';

/** Cell strings remain authoritative even when a merge conceals their individual inputs. */
export function TableBlock({block,canEdit,onChange,actions}:BlockRenderProps<TableBlockData>) {
  const [selected,setSelected]=useState<[number,number]>([0,0]);
  const [error,setError]=useState('');
  const [row,column]=selected;
  const change=(next:TableBlockData)=>{if(next.columns.length>tableLimits.columns||next.rows.length>tableLimits.rows){setError('A table can have up to 50 columns and 500 rows. The pasted range was not applied.');return;}setError('');onChange(next);};
  return <div className="my-2 rounded-card border border-line" onFocusCapture={e=>{const cell=(e.target as HTMLElement).closest<HTMLElement>('[data-table-row]');if(cell)setSelected([Math.max(0,Number(cell.dataset.tableRow)),Number(cell.dataset.tableColumn)]);}}
    onPasteCapture={e=>{if(!canEdit)return;const cell=(e.target as HTMLElement).closest<HTMLElement>('[data-table-row]');const text=e.clipboardData.getData('text/plain');if(!cell||(!text.includes('\t')&&!text.includes('\n')))return;e.preventDefault();e.stopPropagation();const cells=spreadsheetCells(text);if(cells.length+Number(cell.dataset.tableRow)>tableLimits.rows||cells[0]!.length+Number(cell.dataset.tableColumn)>tableLimits.columns){setError('The pasted range exceeds this table’s row or column limit. Nothing was changed.');return;}change(pasteCells(block,Number(cell.dataset.tableRow),Number(cell.dataset.tableColumn),cells));}}
    onKeyDownCapture={e=>{if(!canEdit||!e.altKey||!e.shiftKey||!['ArrowDown','ArrowUp','ArrowRight','ArrowLeft'].includes(e.key))return;e.preventDefault();e.stopPropagation();const axis=['ArrowDown','ArrowUp'].includes(e.key)?'row':'column',remove=['ArrowUp','ArrowLeft'].includes(e.key);if(remove&&axis==='column'&&block.columns.length===1)return;change(resizeTable(block,axis,axis==='row'?row:column,remove));}}>
    <div className="overflow-x-auto"><Table style={{tableLayout:'fixed',width:'100%',minWidth:block.columns.reduce((n,_,i)=>n+(block.widths?.[i]??180),0)}}>
      {block.caption?<TableCaption>{block.caption}</TableCaption>:null}
      <colgroup>{block.columns.map((_,i)=><col key={i} style={{width:block.widths?.[i]??180}}/>)}</colgroup>
      <TableHeader><TableRow>{block.columns.map((value,index)=><TableHead key={index} scope="col" data-table-row={-1} data-table-column={index}><EditableLine canEdit={canEdit} label={`Column ${index+1} heading`} placeholder="Column" value={value} onTextChange={value=>change({...block,columns:block.columns.map((c,i)=>i===index?value:c)})}/></TableHead>)}</TableRow></TableHeader>
      <TableBody>{block.rows.map((row,r)=><TableRow key={row.id}>{row.cells.map((value,c)=>{
        const layout=cellLayout(block,r,c);if(layout.hidden)return null;
        const Cell=block.headerColumn&&c===0?TableHead:TableCell;
        const covered=block.rows.slice(r,r+layout.rowSpan).flatMap((row,i)=>row.cells.slice(c,c+layout.colSpan).filter((_,j)=>i!==0||j!==0)).filter(Boolean);
        return <Cell key={c} scope={block.headerColumn&&c===0?'row':undefined} rowSpan={layout.rowSpan} colSpan={layout.colSpan} data-table-row={r} data-table-column={c} style={{backgroundColor:tableColours[block.colours?.[`${row.id}:${c}`]??'none'],color:block.colours?.[`${row.id}:${c}`]&&block.colours[`${row.id}:${c}`]!=='none'?'#17251f':undefined}}>
          <EditableLine canEdit={canEdit} label={`Row ${r+1}, ${block.columns[c]||`column ${c+1}`}`} placeholder="Empty" value={value} onTextChange={value=>change({...block,rows:block.rows.map((row,i)=>i===r?{...row,cells:row.cells.map((cell,j)=>j===c?value:cell)}:row)})}/>
          {covered.length?<div className="whitespace-pre-wrap text-small">{covered.join('\n')}</div>:null}
        </Cell>;
      })}</TableRow>)}</TableBody>
    </Table></div>
    {canEdit?<TableTools block={block} row={Math.min(row,Math.max(0,block.rows.length-1))} column={Math.min(column,block.columns.length-1)} onSelect={(r,c)=>setSelected([r,c])} onChange={change} onConvert={actions?.onConvertTable?()=>actions.onConvertTable!(block.id):undefined}/>:null}
    {error?<p role="alert">{error}</p>:null}
  </div>;
}
