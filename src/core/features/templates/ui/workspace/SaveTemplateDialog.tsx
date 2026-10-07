import { useRef } from "react";
import { useResource } from "../../../../client/useResource";
import { mutate, operationKey } from "../../../../client/transport";
import { ActionDialog } from "../../../../app/ui/ActionDialog";
export function SaveTemplateDialog({
  sourcePageId,
  title,
  onClose,
  onSaved,
}: {
  sourcePageId: string;
  title: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const key = useRef(operationKey());
  const spaces = useResource<{ items: { id: string; name: string }[] }>(
    "/api/containers",
  );
  return (
    <ActionDialog
      title="Save as a template"
      action="Save template"
      onClose={onClose}
      onSubmit={async (data) => {
        await mutate("/api/templates", {
          operationKey: key.current,
          sourcePageId,
          title: String(data.get("title")),
          description: String(data.get("description")),
          category: String(data.get("category")),
          containerId: String(data.get("containerId")) || null,
          includeChildren: data.get("includeChildren") === "on",
        });
        onSaved();
      }}
    >
      <label>
        Template name
        <input name="title" required defaultValue={title} />
      </label>
      <label>
        Description
        <textarea name="description" />
      </label>
      <label>
        Category
        <input name="category" />
      </label>
      <label>
        Collection
        <select name="containerId">
          <option value="">Workspace</option>
          {spaces.data?.items.map((space) => (
            <option key={space.id} value={space.id}>
              {space.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        <input name="includeChildren" type="checkbox" />
        Include child pages you can access
      </label>
      <p>
        The template captures this page's stored content and attachments. Save
        outstanding edits first.
      </p>
    </ActionDialog>
  );
}
