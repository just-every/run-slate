import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../../../../ui";
import { useRef, useState } from "react";
import { useResource } from "../../../../client/useResource";
import { mutate, operationKey } from "../../../../client/transport";
import { ActionDialog } from "../../../../app/ui/ActionDialog";
type Template = {
  id: string;
  title: string;
  description: string;
  category: string;
  revisionId: string;
  permissions:{canManage:boolean;canApply:boolean;canDuplicate:boolean};
};
export function TemplateActions({
  template,
  archived,
  onChanged,
}: {
  template: Template;
  archived: boolean;
  onChanged: () => void;
}) {
  const [action, setAction] = useState<string | null>(null);
  const key = useRef("");
  const spaces = useResource<{ items: { id: string; name: string }[] }>(
    action ? "/api/containers" : null,
  );
  const pages = useResource<{ items: { id: string; title: string }[] }>(
    action === "edit" ? "/api/pages" : null,
  );
  const start = (next: string) => {
    key.current = operationKey();
    setAction(next);
  };
  return (
    <>
      {template.permissions.canManage || template.permissions.canDuplicate ? <DropdownMenu>
        <DropdownMenuTrigger asChild><button type="button" className="secondary-button">Template actions</button></DropdownMenuTrigger>
        <DropdownMenuContent>
          {template.permissions.canManage ? <DropdownMenuItem onSelect={() => start("edit")}>Update from a page</DropdownMenuItem> : null}
          {template.permissions.canDuplicate ? <DropdownMenuItem onSelect={() => start("duplicate")}>Duplicate</DropdownMenuItem> : null}
          {template.permissions.canManage ? <>
            <DropdownMenuItem onSelect={() => start("move")}>Move collection</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => start(archived ? "restore" : "archive")}>{archived ? "Restore" : "Archive"}</DropdownMenuItem>
            {archived ? <DropdownMenuItem onSelect={() => start("delete")}>Delete template</DropdownMenuItem> : null}
          </> : null}
        </DropdownMenuContent>
      </DropdownMenu> : null}
      {action ? (
        <ActionDialog
          title={
            action === "edit"
              ? "Update this template"
              : `${action[0].toUpperCase() + action.slice(1)} template`
          }
          action={
            action === "edit"
              ? "Save updated template"
              : action[0].toUpperCase() + action.slice(1)
          }
          onClose={() => setAction(null)}
          onSubmit={async (data) => {
            await mutate(
              action === "edit"
                ? "/api/templates"
                : `/api/templates/${template.id}/change`,
              {
                operationKey: key.current,
                expectedRevisionId: template.revisionId,
                ...(action === "edit"
                  ? {
                      id: template.id,
                      sourcePageId: String(data.get("sourcePageId")),
                      includeChildren: data.get("children") === "on",
                      title: String(data.get("title")),
                      description: String(data.get("description")),
                      category: String(data.get("category")),
                      containerId: String(data.get("containerId")) || null,
                    }
                  : {
                      action,
                      ...(["move", "duplicate"].includes(action)
                        ? {
                            containerId:
                              String(data.get("containerId")) || null,
                          }
                        : {}),
                    }),
              },
            );
            await onChanged();
          }}
        >
          {action === "edit" ? (
            <>
              <p>
                Choose an edited page to capture as the new template revision.
                Existing copies remain unchanged.
              </p>
              <label>
                Source page
                <select name="sourcePageId" required defaultValue="">
                  <option value="" disabled>
                    Choose a page
                  </option>
                  {pages.data?.items.map((page) => (
                    <option key={page.id} value={page.id}>
                      {page.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Name
                <input name="title" required defaultValue={template.title} />
              </label>
              <label>
                Description
                <textarea
                  name="description"
                  defaultValue={template.description}
                />
              </label>
              <label>
                Category
                <input name="category" defaultValue={template.category} />
              </label>
              <label>
                <input type="checkbox" name="children" />
                Include accessible child pages
              </label>
            </>
          ) : null}
          {["edit", "move", "duplicate"].includes(action) ? (
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
          ) : (
            <p>
              {action === "delete"
                ? "Delete this archived template? Its existing page copies remain."
                : action === "archive"
                  ? "Hide this template from the active collection. You can restore it from archived templates."
                  : "Return this template to its active collection."}
            </p>
          )}
        </ActionDialog>
      ) : null}
    </>
  );
}
