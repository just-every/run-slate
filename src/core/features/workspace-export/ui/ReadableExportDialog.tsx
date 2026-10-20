import { ActionDialog } from "../../../app/ui/ActionDialog";
export function ReadableExportDialog({
  id,
  container = false,
  workspace = false,
  onClose,
}: {
  id: string;
  container?: boolean;
  workspace?: boolean;
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
            includeComments: data.has("includeComments"),
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
        const filename = response.headers
          .get("Content-Disposition")
          ?.match(/filename="([^"]+)"/)?.[1];
        if (!filename) throw new Error("The export has no download filename.");
        const url = URL.createObjectURL(await response.blob()),
          link = document.createElement("a");
        link.href = url;
        link.download = filename;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }}
    >
      <p>
        The export includes only content you may currently read. Included comments
        retain comment authors, times, replies and resolved states. Markdown includes
        comment JSON sidecars; HTML shows threads beside their block links.
        {!container && !workspace ? " Word downloads one .docx file, with included discussions as Word comments." : null}
        {" "}Workspace backups and restoration are available in Settings.
      </p>
      <label>
        Content
        <select aria-label="Content" name="scope">
          {workspace ? <option value="workspace">Readable workspace pages</option> : container ? (
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
          {!container && !workspace ? <option value="docx">Word (.docx)</option> : null}
        </select>
      </label>
      <label>
        <input type="checkbox" name="includeComments" defaultChecked /> Include comments
      </label>
    </ActionDialog>
  );
}
