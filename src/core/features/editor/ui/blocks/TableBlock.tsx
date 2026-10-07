import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "../../../../ui";
import type { BlockRenderProps, TableBlockData, TableRowData } from "../types";
import { EditableLine } from "./Editable";

function replaceCell(row: TableRowData, index: number, value: string): TableRowData {
  return { ...row, cells: row.cells.map((cell, position) => (position === index ? value : cell)) };
}

/** A table with a header row. It scrolls inside its own container, never the page. */
export function TableBlock({ block, canEdit, onChange }: BlockRenderProps<TableBlockData>) {
  return (
    <div className="my-2 overflow-x-auto rounded-card border border-line">
      <Table>
        {block.caption ? <TableCaption>{block.caption}</TableCaption> : null}
        <TableHeader>
          <TableRow>
            {block.columns.map((column, index) => (
              <TableHead key={index} scope="col">
                <EditableLine
                  canEdit={canEdit}
                  label={`Column ${index + 1} heading`}
                  onTextChange={(value) =>
                    onChange({
                      ...block,
                      columns: block.columns.map((current, position) => (position === index ? value : current)),
                    })
                  }
                  placeholder="Column"
                  value={column}
                />
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {block.rows.map((row, rowIndex) => (
            <TableRow key={row.id}>
              {row.cells.map((cell, cellIndex) => (
                <TableCell key={cellIndex}>
                  <EditableLine
                    canEdit={canEdit}
                    label={`Row ${rowIndex + 1}, ${block.columns[cellIndex] ?? `column ${cellIndex + 1}`}`}
                    onTextChange={(value) =>
                      onChange({
                        ...block,
                        rows: block.rows.map((current) =>
                          current.id === row.id ? replaceCell(current, cellIndex, value) : current,
                        ),
                      })
                    }
                    placeholder="Empty"
                    value={cell}
                  />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
