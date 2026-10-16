import { Download } from "lucide-react";
import { useState } from "react";
import type { FieldDto, QueryDto, ViewDto } from "../../../../client/records";
import { request } from "../../../../client/transport";

function cell(value: unknown): string {
  const text = value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

/** Re-read through the authorized view endpoint before downloading its visible records and fields. */
export function ExportViewCsv({ databaseId, viewId, title, search, onError }: {
  databaseId: string;
  viewId: string;
  title: string;
  search: string;
  onError: (error: unknown) => void;
}) {
  const [pending, setPending] = useState(false);
  async function download() {
    setPending(true);
    try {
      const data = await request<QueryDto & { fields: FieldDto[]; view: ViewDto }>(
        `/api/databases/${databaseId}/views/${viewId}`,
      );
      const visible = data.view.display.visibleFieldIds;
      const fields = data.fields.filter(field => !Array.isArray(visible) || visible.includes(field.id));
      const records = data.records.filter(record => record.title.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
      const rows = [
        ["Name", ...fields.map(field => field.name)],
        ...records.map(record => [record.title, ...fields.map(field => record.values[field.id])]),
      ];
      const csv = rows.map(row => row.map(cell).join(",")).join("\r\n") + "\r\n";
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const link = window.document.createElement("a");
      link.href = url;
      link.download = `${title} - ${data.view.name}`.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_") + ".csv";
      window.document.body.appendChild(link);
      link.click();
      link.remove();
      // Keep the URL alive while the browser starts the download.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      onError(error);
    } finally {
      setPending(false);
    }
  }
  return (
    <button className="tool" type="button" disabled={pending} onClick={() => void download()}
      title="Download the visible fields and records matching this view and search">
      <Download aria-hidden="true" />
      {pending ? "Exporting…" : "Export view CSV"}
    </button>
  );
}
