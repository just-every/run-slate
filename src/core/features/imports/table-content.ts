/** Preserve every source cell while making imported tables rectangular. */
export function importedTableContent(sourceRows: string[][], blockId: string) {
  // Even an empty source table needs one column in the editor's table model.
  const width = sourceRows.reduce((maximum, row) => Math.max(maximum, row.length), 1);
  const padded = (cells: string[]) => Array.from({length: width}, (_, column) => cells[column] ?? '');
  return {
    columns: padded(sourceRows[0] ?? []),
    rows: sourceRows.slice(1).map((cells, index) => ({id: `${blockId}:row:${index}`, cells: padded(cells)})),
  };
}

export interface ImportedTableMerge {row:number;column:number;rowSpan:number;colSpan:number}

/** Word's source grid includes its optional heading row; Slate merges name body rows. */
export function importedMergedTableContent(sourceRows:string[][], blockId:string, merges:ImportedTableMerge[], headerRows:0|1) {
  const width = sourceRows.reduce((maximum, row) => Math.max(maximum, row.length), 1);
  const padded = (cells:string[]) => Array.from({length:width}, (_, column) => cells[column] ?? '');
  const rows = sourceRows.slice(headerRows).map((cells,index) => ({id:`${blockId}:row:${index}`,cells:padded(cells)}));
  return {
    columns:headerRows ? padded(sourceRows[0] ?? []) : padded([]),
    rows,
    merges:merges.map(merge => ({rowId:rows[merge.row-headerRows]!.id,column:merge.column,rowSpan:merge.rowSpan,colSpan:merge.colSpan})),
  };
}
