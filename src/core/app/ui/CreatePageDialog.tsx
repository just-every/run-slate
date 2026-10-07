import {useRef} from "react";
import { useResource } from "../../client/useResource";
import { contentApi } from "../../client/content";
import type { PageResult } from "../../shared/api/common";
import { ActionDialog } from "./ActionDialog";
import { RequestState } from "./RequestState";
import { mutate, operationKey } from "../../client/transport";

interface ContainerChoice {
  id: string;
  name: string;
}
export function CreatePageDialog({
  onClose,
  onCreated,
  parentPageId,
  defaultContainerId,
  defaultTitle = "",
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
  parentPageId?: string;
  defaultContainerId?: string;
  defaultTitle?: string;
}) {
  const attempt=useRef<{signature:string;key:string}|null>(null);
  const containers =
    useResource<PageResult<ContainerChoice>>("/api/containers");
  return (
    <ActionDialog
      title="Create a page"
      action="Create page"
      onClose={onClose}
      onSubmit={async (data) => {
        let containerId = String(data.get("containerId") ?? "");
        if (containers.data?.items.length === 0) {
          const result = await mutate<{ value: { id: string } }>(
            "/api/containers",
            {
              operationKey: operationKey(),
              name: String(data.get("containerName") ?? ""),
              visibility: "private",
            },
          );
          containerId = result.value.id;
        }
        if (!containerId)
          throw new Error("Choose a container before creating this page.");
        const payload={containerId,title:String(data.get("title")??""),parentPageId};const signature=JSON.stringify(payload);
        if(attempt.current?.signature!==signature)attempt.current={signature,key:operationKey()};
        const result=await mutate<{value:{pageId:string}}>("/api/pages",{...payload,operationKey:attempt.current.key});
        onCreated(result.value.pageId);
      }}
    >
      <label>
        Page title
        <input
          name="title"
          autoFocus
          required
          maxLength={500}
          defaultValue={defaultTitle}
          placeholder="What are you working on?"
        />
      </label>
      <RequestState
        loading={containers.loading}
        error={containers.error}
        retry={containers.reload}
      >
        {containers.data?.items.length === 0 ? (
          <>
            <label>
              Keep it in
              <input name="containerName" required defaultValue="My pages" />
            </label>
            <p>
              A private container will hold your first page. You can invite
              others when you’re ready.
            </p>
          </>
        ) : (
          <label>
            Container
            <select aria-label="Container" name="containerId" required defaultValue={defaultContainerId ?? ""}>
              <option value="" disabled>
                Choose a container
              </option>
              {containers.data?.items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </RequestState>
    </ActionDialog>
  );
}
