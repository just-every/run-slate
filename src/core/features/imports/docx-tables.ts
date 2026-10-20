import { attributes, childEntries, orderedText, valueFor, type OrderedNode } from "./docx-xml";
import { ImportError } from "./errors";
import { importedMergedTableContent, type ImportedTableMerge } from "./table-content";

function invalid(detail: string): never {
  throw new ImportError("IMPORT_FORMAT_INVALID", `Word table ${detail}.`);
}

function integer(value: string | undefined, minimum: number, defaultValue: number): number {
  if (value === undefined) return defaultValue;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum) invalid("has an invalid grid coordinate");
  return parsed;
}

interface CellText {
  row: number;
  column: number;
  text: string;
}

/** gridSpan counts grid columns, while vMerge continues the preceding row's rectangle. */
export function docxTable(node: OrderedNode, blockId: string) {
  const sourceRows = childEntries(valueFor(node, "tbl"), "tr");
  const grid = childEntries(valueFor(node, "tbl"), "tblGrid")[0];
  let width = grid ? childEntries(valueFor(grid, "tblGrid"), "gridCol").length : 0;
  const rows: string[][] = [];
  const merges: ImportedTableMerge[] = [];
  const annotated: { owner: ImportedTableMerge; cells: CellText[] }[] = [];
  let active = new Map<number, ImportedTableMerge>();
  let header = false;

  sourceRows.forEach((sourceRow, rowIndex) => {
    const row: string[] = [];
    const properties = childEntries(valueFor(sourceRow, "tr"), "trPr")[0];
    const rowProperties = properties ? valueFor(properties, "trPr") : [];
    const headerProperty = childEntries(rowProperties, "tblHeader")[0];
    if (rowIndex === 0 && headerProperty) header = !["0", "false", "off"].includes(attributes(headerProperty).val ?? "true");
    let column = integer(attributes(childEntries(rowProperties, "gridBefore")[0] ?? {}).val, 0, 0);
    const nextActive = new Map<number, ImportedTableMerge>();

    for (const cell of childEntries(valueFor(sourceRow, "tr"), "tc")) {
      const properties = childEntries(valueFor(cell, "tc"), "tcPr")[0];
      const cellProperties = properties ? valueFor(properties, "tcPr") : [];
      const colSpan = integer(attributes(childEntries(cellProperties, "gridSpan")[0] ?? {}).val, 1, 1);
      const vertical = childEntries(cellProperties, "vMerge")[0];
      const state = vertical ? attributes(vertical).val ?? "continue" : undefined;
      if (state && state !== "restart" && state !== "continue") invalid("has an invalid vertical merge");
      let owner: ImportedTableMerge;
      if (state === "continue") {
        const prior = active.get(column);
        if (!prior || prior.colSpan !== colSpan) invalid("continues a vertical merge without a matching cell");
        prior.rowSpan++;
        owner = prior;
      } else {
        owner = { row: rowIndex, column, rowSpan: 1, colSpan };
        if (colSpan > 1 || state === "restart") merges.push(owner);
      }
      if (state) nextActive.set(column, owner);

      const paragraphs = childEntries(valueFor(cell, "tc"), "p");
      const ordinary: string[] = [];
      const tagged: CellText[] = [];
      for (const paragraph of paragraphs) {
        const attrs = attributes(paragraph);
        const text = orderedText(valueFor(paragraph, "p"));
        if (attrs["cell-row"] !== undefined || attrs["cell-column"] !== undefined) {
          if (attrs["cell-row"] === undefined || attrs["cell-column"] === undefined) invalid("has an incomplete source-cell annotation");
          tagged.push({ row: integer(attrs["cell-row"], 0, 0), column: integer(attrs["cell-column"], 0, 0), text });
        } else ordinary.push(text);
      }
      row[column] = ordinary.join("\n");
      if (tagged.length) annotated.push({ owner, cells: tagged });
      column += colSpan;
    }
    const after = integer(attributes(childEntries(rowProperties, "gridAfter")[0] ?? {}).val, 0, 0);
    width = Math.max(width, column + after);
    rows.push(row);
    active = nextActive;
  });

  const occupied = new Set<string>();
  for (const { owner, cells } of annotated) {
    for (const cell of cells) {
      if (cell.row < owner.row || cell.row >= owner.row + owner.rowSpan || cell.column < owner.column || cell.column >= owner.column + owner.colSpan) invalid("has a source-cell annotation outside its merged cell");
      const key = `${cell.row}:${cell.column}`;
      if (occupied.has(key)) invalid("has duplicate source-cell annotations");
      occupied.add(key);
      rows[cell.row]![cell.column] = cell.text;
    }
  }
  const rectangular = rows.map(row => Array.from({ length: Math.max(width, 1) }, (_, column) => row[column] ?? ""));
  const merged = merges.filter(merge => merge.colSpan > 1 || merge.rowSpan > 1);
  // Slate's column headings cannot themselves merge. Keep such a Word row in
  // the body so its complete rectangle remains expressible in the table model.
  const headerRows = header && !merged.some(merge => merge.row === 0) ? 1 : 0;
  return {
    rows: rectangular,
    content: merged.length ? importedMergedTableContent(rectangular, blockId, merged, headerRows) : undefined,
  };
}
