import {useRef} from "react";
import { useResource } from "../../../../client/useResource";
import { mutate, operationKey } from "../../../../client/transport";
import { ActionDialog } from "../../../../app/ui/ActionDialog";
import { RequestState } from "../../../../app/ui/RequestState";
export function CreateDatabaseDialog({ onClose }: { onClose: () => void }) {
  const attempt=useRef<{signature:string;key:string;viewKey:string;viewId:string;created?:{id:string;revisionId:string}}|null>(null);
  const containers = useResource<{ items: { id: string; name: string }[] }>(
    "/api/containers",
  );
  return (
    <ActionDialog
      title="Create a database"
      action="Create database"
      onClose={onClose}
      onSubmit={async (form) => {
        const input={title:String(form.get("title")),containerId:String(form.get("containerId"))};const signature=JSON.stringify(input);
        if(attempt.current?.signature!==signature)attempt.current={signature,key:operationKey(),viewKey:operationKey(),viewId:crypto.randomUUID()};
        const pending=attempt.current;
        const result = pending.created?{value:pending.created}:await mutate<{
          value: { id: string; revisionId: string };
        }>("/api/databases", {
          operationKey: pending.key,
          ...input,
        });
        pending.created=result.value;
        await mutate(`/api/databases/${result.value.id}/views`, {
          operationKey: pending.viewKey,
          expectedRevisionId: result.value.revisionId,
          view: {
            id: pending.viewId,
            name: "All records",
            layout: "table",
            filters: [],
            sorts: [],
            groups: [],
            calculations: {},
            display: {},
            position: 0,
          },
        });
        window.location.assign(`/app/databases/${result.value.id}`);
      }}
    >
      <label>
        Name
        <input
          name="title"
          required
          autoFocus
          placeholder="What are you keeping track of?"
        />
      </label>
      <RequestState
        loading={containers.loading}
        error={containers.error}
        retry={containers.reload}
      >
        <label>
          Space
          <select name="containerId" required defaultValue="">
            <option value="" disabled>
              Choose a space
            </option>
            {containers.data?.items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
      </RequestState>
      <p>
        Records can be organized into tables, boards, lists, galleries,
        calendars and timelines.
      </p>
    </ActionDialog>
  );
}
