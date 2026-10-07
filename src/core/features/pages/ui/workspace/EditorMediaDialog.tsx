import { ActionDialog } from "../../../../app/ui/ActionDialog";
import { request, operationKey } from "../../../../client/transport";
import type { EditorBlock } from "../../../editor/ui/types";
export function EditorMediaDialog({
  pageId,
  block,
  mode,
  onChange,
  onClose,
}: {
  pageId: string;
  block: EditorBlock;
  mode: "upload" | "link";
  onChange: (block: EditorBlock) => void;
  onClose: () => void;
}) {
  if (block.type !== "media") return null;
  return (
    <ActionDialog
      title={mode === "upload" ? "Add a file" : "Add a media link"}
      action={mode === "upload" ? "Upload file" : "Use link"}
      onClose={onClose}
      onSubmit={async (form) => {
        if (mode === "upload") {
          form.set("operationKey", operationKey());
          form.set("pageId", pageId);
          const result = await request<{
            value: {
              id: string;
              url: string;
              name: string;
              contentType: string;
              sizeBytes: number;
            };
          }>("/api/media", { method: "POST", body: form });
          onChange({
            ...block,
            source: {
              fileId: result.value.id,
              url: result.value.url,
              name: result.value.name,
              contentType: result.value.contentType,
              sizeLabel: `${Math.ceil(result.value.sizeBytes / 1024)} KB`,
            },
          });
        } else {
          const url = new URL(String(form.get("url")));
          if (!["http:", "https:"].includes(url.protocol))
            throw new Error("Use an http or https media link.");
          onChange({
            ...block,
            source: {
              url: url.href,
              name: String(
                form.get("name") ||
                  url.pathname.split("/").at(-1) ||
                  "Linked media",
              ),
            },
          });
        }
      }}
    >
      {mode === "upload" ? (
        <label>
          File
          <input
            type="file"
            name="file"
            required
            accept={block.kind === "file" ? undefined : `${block.kind}/*`}
          />
        </label>
      ) : (
        <>
          <label>
            Media link
            <input name="url" type="url" required />
          </label>
          <label>
            Display name
            <input name="name" />
          </label>
          <p>The media remains hosted at this address.</p>
        </>
      )}
    </ActionDialog>
  );
}
