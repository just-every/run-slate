import {html} from '../../publishing/html';
import {cellLayout,tableColours,type TableContent} from './model';
export function renderTable(table:TableContent,id?:string) {
  const columns=table.columns??[],rows=table.rows??[],width=columns.reduce((sum,_,i)=>sum+(table.widths?.[i]??180),0);
  return `<div class="table-scroll"><table style="table-layout:fixed;width:${width}px;min-width:${width}px"${id?` id="${html(id)}"`:''}><caption style="text-align:left">${html(table.caption)}</caption><colgroup>${columns.map((_,i)=>`<col style="width:${table.widths?.[i]??180}px">`).join('')}</colgroup><thead><tr>${columns.map(c=>`<th scope="col">${html(c)}</th>`).join('')}</tr></thead><tbody>${rows.map((row,r)=>`<tr>${row.cells.map((cell,c)=>{
    const layout=cellLayout(table,r,c);if(layout.hidden)return '';
    const tag=table.headerColumn&&c===0?'th':'td',colour=tableColours[table.colours?.[`${row.id}:${c}`]??'none'];
    const content=rows.slice(r,r+layout.rowSpan).flatMap(row=>row.cells.slice(c,c+layout.colSpan)).map(html).join('<br>');
    return `<${tag}${tag==='th'?' scope="row"':''} rowspan="${layout.rowSpan}" colspan="${layout.colSpan}" style="background-color:${colour};${colour!=='transparent'?'color:#17251f;':''}white-space:pre-wrap">${content}</${tag}>`;
  }).join('')}</tr>`).join('')}</tbody></table></div>`;
}
