import {PageComments} from "../../../pages/ui/workspace/PageComments";
import {PageHistory} from "../../../pages/ui/workspace/PageHistory";
import { useState } from "react";
import { useRecordReferences } from "../../../../client/useRecordReferences";
import { useResource } from "../../../../client/useResource";
import { mutate, operationKey } from "../../../../client/transport";
import type { FieldDto } from "../../../../client/records";
import type { DocumentView } from "../../../../client/content";
import { RequestState } from "../../../../app/ui/RequestState";
import { RecordFields } from "./RecordFields";
import { RecordMoreMenu, RecordPrintItem } from "./RecordPrint";
import { TopBar } from "../../../../app/ui/header/TopBar";
import { PageTitle } from "../../../../app/ui/header/PageTitle";
import { RecordValueDialog } from "./RecordValueDialog";
import { ReferenceValueDialog } from "./ReferenceValueDialog";
import { PageWorkspace } from "../../../pages/ui/workspace/PageWorkspace";
interface RecordDocument {
  page: DocumentView;
  fields: FieldDto[];
  values: Record<string, unknown>;
  revisionId: string;
  parity: string;
}
export function RecordWorkspace({
  databaseId,
  id,
}: {
  databaseId: string;
  id: string;
}) {
  const resource = useResource<RecordDocument>(
    `/api/databases/${databaseId}/records/${id}`,
  );
  const [edit, setEdit] = useState<FieldDto>();
  const data = resource.data;
  const references = useRecordReferences(
    data?.fields ?? [],
    data
      ? [
          {
            pageId: id,
            revisionId: data.revisionId,
            title: data.page.page.title,
            values: data.values,
          },
        ]
      : [],
  );
  async function save(value: unknown) {
    if (!data || !edit) return;
    await mutate(
      `/api/databases/${databaseId}/records/${id}`,
      {
        operationKey: operationKey(),
        expectedRevisionId: data.revisionId,
        values: { [edit.id]: value },
      },
      "PATCH",
    );
    await resource.reload();
  }
  const databases = useResource<{ items: { id: string; title: string }[] }>("/api/databases");
  const trail = [
    { label: "Databases" },
    { label: databases.data?.items.find((item) => item.id === databaseId)?.title ?? "Database", href: `/app/databases/${databaseId}` },
  ];
  const fields = data ? (
    <RecordFields fields={data.fields} values={data.values} references={references} canEdit={data.page.permissions.canEdit} onEdit={setEdit} />
  ) : null;
  return (
    <>
      <RequestState
        loading={resource.loading}
        error={resource.error}
        retry={resource.reload}
      >
        {data ? (
          <>
            {data.parity === "record-is-page" ? (
              <PageWorkspace pageId={id} host={{ trail, moreItems: <RecordPrintItem />, properties: fields }} />
            ) : (
              <>
                <TopBar trail={[...trail, { label: data.page.page.title }]}><RecordMoreMenu /></TopBar>
                <section className="main record-fields">
                  <PageTitle>{data.page.page.title}</PageTitle>
                  {fields}
                </section>
                <section className="main"><details><summary>Record comments</summary><PageComments document={data.page}/></details><details><summary>Record history</summary><PageHistory document={data.page} revision={data.page.page.revisionId} reload={resource.reload}/></details></section>
              </>
            )}
            {edit ? (
              ["relation", "person", "file"].includes(edit.type) ? (
                <ReferenceValueDialog
                  databaseId={databaseId}
                  field={edit}
                  value={data.values[edit.id]}
                  onSave={save}
                  onClose={() => setEdit(undefined)}
                />
              ) : (
                <RecordValueDialog
                  field={edit}
                  value={data.values[edit.id]}
                  onSave={save}
                  onClose={() => setEdit(undefined)}
                />
              )
            ) : null}
          </>
        ) : null}
      </RequestState>
    </>
  );
}
