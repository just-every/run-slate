import { useRef } from "react";
import { mutate, operationKey } from "../../client/transport";
import { ActionDialog } from "./ActionDialog";

/** Asked only when the member has no space that accepts pages: names a private space, then the page is made in it. */
export function NewSpacePrompt({
  onClose,
  onSpace,
  busy,
}: {
  onClose: () => void;
  onSpace: (containerId: string) => Promise<void>;
  busy: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const attempt = useRef<{ name: string; key: string } | null>(null);
  return (
    <ActionDialog
      title="Name a space for your page"
      action="Create page"
      onClose={onClose}
      initialFocus={input}
      busy={busy}
      onSubmit={async (data) => {
        const name = String(data.get("containerName") ?? "");
        if (attempt.current?.name !== name) attempt.current = { name, key: operationKey() };
        const result = await mutate<{ value: { id: string } }>("/api/containers", {
          operationKey: attempt.current.key,
          name,
          visibility: "private",
        });
        await onSpace(result.value.id);
        return false;
      }}
    >
      <label>
        Space name
        <input ref={input} name="containerName" required maxLength={200} />
      </label>
      <p>A private space will hold your page. You can invite others when you’re ready.</p>
    </ActionDialog>
  );
}
