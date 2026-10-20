import type { TableContent } from '../editor/tables/model';
import { paragraph, run } from './docx-xml';

/** Covered cells retain their authored text in the merged owner; the tagged paragraphs
 * also let our importer recover the original grid without changing Word's layout. */
export function wordTable(table: TableContent): string {
  const columns = table.columns.length;
  const cell = (text: string, properties = '', attrs = '') => `<w:tc><w:tcPr>${properties}</w:tcPr>${paragraph(run(text), '', attrs)}</w:tc>`;
  const header = `<w:tr><w:trPr><w:tblHeader/></w:trPr>${table.columns.map(text => cell(text)).join('')}</w:tr>`;
  const rows = table.rows.map((row, index) => {
    const cells: string[] = [];
    for (let column = 0; column < columns;) {
      const merge = table.merges?.find(m => {
        const start = table.rows.findIndex(r => r.id === m.rowId);
        return index >= start && index < start + m.rowSpan && column >= m.column && column < m.column + m.colSpan;
      });
      if (!merge) { cells.push(cell(row.cells[column] ?? '')); column++; continue; }
      const start = table.rows.findIndex(r => r.id === merge.rowId);
      if (column !== merge.column) { column++; continue; }
      const properties = `${merge.colSpan > 1 ? `<w:gridSpan w:val="${merge.colSpan}"/>` : ''}${merge.rowSpan > 1 ? `<w:vMerge${index === start ? ' w:val="restart"' : ''}/>` : ''}`;
      const content = index === start ? table.rows.slice(start, start + merge.rowSpan).flatMap((source, offset) => source.cells.slice(column, column + merge.colSpan).map((text, c) => paragraph(run(text), '', ` slate:cell-row="${start + offset + 1}" slate:cell-column="${column + c}"`))).join('') : paragraph('');
      cells.push(`<w:tc><w:tcPr>${properties}</w:tcPr>${content}</w:tc>`);
      column += merge.colSpan;
    }
    return `<w:tr>${cells.join('')}</w:tr>`;
  }).join('');
  return `${table.caption ? paragraph(run(table.caption)) : ''}<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders>${['top','left','bottom','right','insideH','insideV'].map(edge => `<w:${edge} w:val="single" w:sz="4" w:color="808080"/>`).join('')}</w:tblBorders></w:tblPr><w:tblGrid>${table.columns.map((_, i) => `<w:gridCol w:w="${Math.round((table.widths?.[i] ?? 180) * 15)}"/>`).join('')}</w:tblGrid>${header}${rows}</w:tbl>${paragraph('')}`;
}
