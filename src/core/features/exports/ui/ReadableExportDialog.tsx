import { ActionDialog } from "../../../app/ui/ActionDialog";
export function ReadableExportDialog({
  id,
  container = false,
  onClose,
}: {
  id: string;
  container?: boolean;
  onClose: () => void;
}) {
  return (
    <ActionDialog
      title="Export readable content"
      action="Download export"
      onClose={onClose}
      onSubmit={async (data) => {
        const response = await fetch("/api/exports/readable", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scope: String(data.get("scope")),
            id,
            format: String(data.get("format")),
          }),
        });
        if (!response.ok) {
          const problem = (await response.json().catch(() => null)) as {
            error?: { message?: string };
            message?: string;
          } | null;
          throw new Error(
            problem?.error?.message ??
              problem?.message ??
              `Export failed (${response.status}).`,
          );
        }
        const url = URL.createObjectURL(await response.blob()),
          link = document.createElement("a");
        link.href = url;
        link.download = "slate-readable-export.zip";
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }}
    >
      <p>
        The archive includes only content you may currently read. Workspace
        backups and restoration are available in Settings.
      </p>
      <label>
        Content
        <select aria-label="Content" name="scope">
          {container ? (
            <option value="container">This space</option>
          ) : (
            <>
              <option value="page">This page</option>
              <option value="descendants">This page and child pages</option>
            </>
          )}
        </select>
      </label>
      <label>
        Format
        <select aria-label="Format" name="format">
          <option value="markdown">Markdown</option>
          <option value="html">HTML</option>
          <option value="pdf">PDF</option>
        </select>
      </label>
    </ActionDialog>
  );
}
