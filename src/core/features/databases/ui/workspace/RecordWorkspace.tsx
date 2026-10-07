import {PageComments} from "../../../pages/ui/workspace/PageComments";
import {PageHistory} from "../../../pages/ui/workspace/PageHistory";
import { useState } from "react";
import { useRecordReferences } from "../../../../client/useRecordReferences";
import { useResource } from "../../../../client/useResource";
import { mutate, operationKey } from "../../../../client/transport";
import {
  fieldView,
  fieldValue,
  type FieldDto,
} from "../../../../client/records";
import type { DocumentView } from "../../../../client/content";
import { RequestState } from "../../../../app/ui/RequestState";
import { FieldDisplay } from "../fields/FieldDisplay";
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
  return (
    <>
      <header className="topbar">
        <a href={`/app/databases/${databaseId}`}>← Back to records</a>
        <button onClick={() => window.print()}>Print record</button>
      </header>
      <RequestState
        loading={resource.loading}
        error={resource.error}
        retry={resource.reload}
      >
        {data ? (
          <>
            <section className="main record-fields">
              <p className="eyebrow">RECORD</p>
              <h1 className="title">{data.page.page.title}</h1>
              <dl>
                {data.fields.map((field) => (
                  <div key={field.id} className="record-field">
                    <dt>{field.name}</dt>
                    <dd>
                      <FieldDisplay
                        density="detail"
                        field={fieldView(field)}
                        value={fieldValue(
                          field,
                          data.values[field.id],
                          references,
                        )}
                      />
                      {data.page.permissions.canEdit && !field.readOnly ? (
                        <button onClick={() => setEdit(field)}>Edit</button>
                      ) : null}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
            {data.parity === "record-is-page" ? (
              <PageWorkspace pageId={id} />
            ) : (
              <section className="main"><details><summary>Record comments</summary><PageComments document={data.page}/></details><details><summary>Record history</summary><PageHistory document={data.page} revision={data.page.page.revisionId} reload={resource.reload}/></details></section>
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
