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
