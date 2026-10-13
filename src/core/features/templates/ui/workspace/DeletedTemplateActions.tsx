import { useRef, useState } from "react";
import { ActionDialog } from "../../../../app/ui/ActionDialog";
import { mutate, operationKey } from "../../../../client/transport";
export interface DeletedTemplate {
  id: string;
  title: string;
  revisionId: string;
  deletedAt?: string | null;
  erasurePending?: boolean | number;
  permissions: { canManage: boolean; canErase?: boolean };
}
export function DeletedTemplateActions({
  template,
  onChanged,
}: {
  template: DeletedTemplate;
  onChanged: () => void;
}) {
  const [action, setAction] = useState<"restore" | "erase" | null>(null),
    key = useRef("");
  const open = (next: "restore" | "erase") => {
    key.current = operationKey();
    setAction(next);
  };
  return (
    <section className="deleted-template-actions">
      <p>
        {template.erasurePending
          ? "File cleanup is pending. The template contents have been erased."
          : "Deleted"}
        {template.deletedAt
          ? ` on ${new Date(template.deletedAt).toLocaleString()}`
          : ""}
        . Existing page copies remain independent.
      </p>
      {template.permissions.canManage && !template.erasurePending ? (
        <button className="secondary-button" onClick={() => open("restore")}>
          Restore deleted template
        </button>
      ) : null}
      {template.permissions.canErase ? (
        <button className="secondary-button" onClick={() => open("erase")}>
          {template.erasurePending
            ? "Confirm pending cleanup"
            : "Permanently erase template"}
        </button>
      ) : null}
      {action ? (
        <ActionDialog
          title={
            action === "erase"
              ? template.erasurePending
                ? "Finish pending template cleanup?"
                : "Permanently erase this template?"
              : "Restore deleted template?"
          }
          action={
            action === "erase"
              ? template.erasurePending
                ? "Confirm cleanup"
                : "Permanently erase"
              : "Restore template"
          }
          onClose={() => setAction(null)}
          onSubmit={async (data) => {
            if (
              action === "erase" &&
              !template.erasurePending &&
              data.get("confirm") !== template.title
            )
              throw new Error("Type the exact template title to confirm.");
            await mutate(
              `/api/templates/${template.id}/${action === "erase" ? "permanent-delete" : "change"}`,
              {
                operationKey: key.current,
                expectedRevisionId: template.revisionId,
                ...(action === "erase"
                  ? { confirmed: true }
                  : { action: "restore" }),
              },
            );
            await onChanged();
          }}
        >
          {action === "erase" ? (
            <>
              <p>
                This permanently removes the template’s saved contents,
                revisions and stored files. It cannot be restored. Pages already
                created from it are unchanged. Erasure is complete only after
                file cleanup succeeds; a pending cleanup remains incomplete and
                can be retried here.
              </p>
              {!template.erasurePending ? (
                <label>
                  Type the template title
                  <input name="confirm" required autoComplete="off" />
                </label>
              ) : null}
            </>
          ) : (
            <p>
              Return this template to its active collection with its saved
              contents.
            </p>
          )}
        </ActionDialog>
      ) : null}
    </section>
  );
}
