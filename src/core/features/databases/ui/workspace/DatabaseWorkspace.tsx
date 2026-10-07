import {ViewCriteria} from "./ViewCriteria";
import {FavouriteControl} from "../../../navigation/ui/workspace/FavouriteControl";
import {RecordPeek} from "./RecordPeek";
import {AutomationWorkspace} from "../../../automation/ui/workspace/AutomationWorkspace";
import { useState } from "react";
import { useRecordReferences } from "../../../../client/useRecordReferences";
import { useResource } from "../../../../client/useResource";
import {
  mutate,
  operationKey,
  errorMessage,
} from "../../../../client/transport";
import {
  fieldView,
  recordView,
  storedValue,
  type DatabaseDto,
  type QueryDto,
  type ViewDto,
  type RecordDto,
  type FieldDto,
} from "../../../../client/records";
import type { DocumentView } from "../../../../client/content";
import { RequestState } from "../../../../app/ui/RequestState";
import { ActionDialog } from "../../../../app/ui/ActionDialog";
import { DatabaseChart } from "./DatabaseChart";
import { FieldDialog } from "./FieldDialog";
import { RecordLayouts } from "./RecordLayouts";
import { ViewDialog } from "./ViewDialog";
import { ReferenceValueDialog } from "./ReferenceValueDialog";
import { RecordValueDialog } from "./RecordValueDialog";
import type { FieldValue } from "../types";
export function DatabaseWorkspace({ id }: { id: string }) {
  const [automations,setAutomations]=useState(false);
  const [peek,setPeek]=useState<string>();
  const [peekMode,setPeekMode]=useState<"side"|"center">("side");
  const resource = useResource<DatabaseDto>(`/api/databases/${id}`);
  const page = useResource<DocumentView>(
    resource.data ? `/api/pages/${resource.data.database.page_id}` : null,
  );
  const [active, setActive] = useState<string>();
  const view =
    resource.data?.views.find((item) => item.id === active) ??
    resource.data?.views[0];
  const query = useResource<QueryDto>(
    view ? `/api/databases/${id}/views/${view.id}` : null,
  );
  const [fieldEdit, setFieldEdit] = useState<FieldDto>();
  const [chart, setChart] = useState(false);
  const [dialog, setDialog] = useState<"new" | "view" | "delete-view" | null>(null);
  const [edit, setEdit] = useState<{ record: RecordDto; field: FieldDto }>();
  const [error, setError] = useState<unknown>();
  const [search, setSearch] = useState("");
  const canEdit = page.data?.permissions.canEdit ?? false;
  async function reload() {
    if(!await resource.reload())throw new Error('The change was saved, but the database could not be refreshed. Reload it before editing again.');
    await query.reload();
  }
  async function saveView(next: ViewDto) {
    if (!resource.data) return;
    const { revisionId: _revisionId, ...input } = next;
    await mutate(`/api/databases/${id}/views`, {
      operationKey: operationKey(),
      expectedRevisionId: resource.data.database.revision_id,
      view: input,
    });
    setActive(next.id);
    await reload();
  }
  async function saveValue(record: RecordDto, field: FieldDto, value: unknown) {
    await mutate(
      `/api/databases/${id}/records/${record.pageId}`,
      {
        operationKey: operationKey(),
        expectedRevisionId: record.revisionId,
        values: { [field.id]: value },
      },
      "PATCH",
    );
    await query.reload();
  }
  function update(recordId: string, fieldId: string, value: FieldValue | null) {
    const record = query.data?.records.find((item) => item.pageId === recordId),
      field = resource.data?.fields.find((item) => item.id === fieldId);
    if (!record || !field) return;
    let stored = storedValue(value);
    if (["select", "status"].includes(field.type) && Array.isArray(stored))
      stored = stored[0] ?? null;
    void saveValue(record, field, stored).catch(setError);
  }
  const fields = resource.data?.fields ?? [];
  const references = useRecordReferences(fields, query.data?.records ?? []);
  const shown = fields.filter(
    (field) =>
      !Array.isArray(view?.display.visibleFieldIds) ||
      view.display.visibleFieldIds.includes(field.id),
  );
  const records = (query.data?.records ?? []).filter((record) =>
    record.title.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
  );
  return (
    <>
      {peek?<RecordPeek databaseId={id} id={peek} mode={peekMode} onMode={setPeekMode} onClose={()=>setPeek(undefined)}/>:null}
      <header className="topbar">
        <a href="/app">Records</a>
        <button onClick={()=>setAutomations(!automations)}>Automations</button><FavouriteControl kind="database" id={id}/>
        {page.data ? (
          <a href={`/app/pages/${page.data.page.id}`}>About this database</a>
        ) : null}
      </header>
      {automations ? <AutomationWorkspace sourceId={id}/>:null}
      <section className="main database-workspace">
        <p className="eyebrow">STRUCTURED KNOWLEDGE</p>
        <h1 className="title">{page.data?.page.title ?? "Records"}</h1>
        <RequestState
          loading={resource.loading || page.loading}
          error={resource.error ?? page.error}
          retry={reload}
        >
          {resource.data ? (
            <>
              <div className="action-row">
                <nav aria-label="Saved views">
                  {resource.data.views.map((item) => (
                    <button
                      key={item.id}
                      aria-pressed={view?.id === item.id}
                      onClick={() => setActive(item.id)}
                    >
                      {item.name}
                    </button>
                  ))}
                </nav>
                {canEdit ? (
                  <>
                    <button
                      disabled={!!resource.data.database.structure_locked_at}
                      onClick={() =>
                        setFieldEdit({
                          id: crypto.randomUUID(),
                          name: "",
                          type: "text",
                          config: {},
                          position: fields.length,
                        })
                      }
                    >
                      Add field
                    </button>
                    <button disabled={!!resource.data.database.structure_locked_at} onClick={() => setDialog("view")}>
                      View settings
                    </button>
                    <button
                      disabled={!!resource.data.database.structure_locked_at}
                      onClick={() =>
                        void saveView({
                          id: crypto.randomUUID(),
                          name: "New view",
                          layout: "table",
                          filters: [],
                          sorts: [],
                          groups: [],
                          calculations: {},
                          display: {},
                          position: resource.data!.views.length,
                          revisionId: "",
                        }).catch(setError)
                      }
                    >
                      Add view
                    </button>
                    {view?<><button disabled={!!resource.data.database.structure_locked_at} onClick={()=>void saveView({...view,id:crypto.randomUUID(),name:`${view.name} copy`,position:resource.data!.views.length,revisionId:''}).catch(setError)}>Duplicate view</button><button disabled={!!resource.data.database.structure_locked_at} onClick={()=>setDialog('delete-view')}>Delete view</button></>:null}
                    <button
                      className="primary-button"
                      onClick={() => setDialog("new")}
                    >
                      New record
                    </button>
                  </>
                ) : null}
                <button onClick={() => setChart(!chart)} aria-expanded={chart}>
                  Chart
                </button>
                <label>
                  Find in this view
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
              </div>
              {view?<ViewCriteria view={view} fields={fields} canClear={canEdit&&!resource.data.database.structure_locked_at} onClear={()=>void saveView({...view,filters:[]}).catch(setError)}/>:null}
              {resource.data.database.structure_locked_at ? (
                <p>
                  Structure locked by{" "}
                  {resource.data.database.structure_locked_by_name ??
                    "a workspace member"}
                  . Record values remain editable.
                </p>
              ) : null}
              {page.data?.permissions.canShare ? (
                <button
                  onClick={() =>
                    void mutate(`/api/databases/${id}/lock`, {
                      operationKey: operationKey(),
                      expectedRevisionId: resource.data!.database.revision_id,
                      locked: !resource.data!.database.structure_locked_at,
                    })
                      .then(reload)
                      .catch(setError)
                  }
                >
                  {resource.data.database.structure_locked_at
                    ? "Unlock structure"
                    : "Lock structure"}
                </button>
              ) : null}
              {canEdit && !resource.data.database.structure_locked_at ? (
                <details>
                  <summary>Fields</summary>
                  {fields.map((field) => (
                    <button key={field.id} onClick={() => setFieldEdit(field)}>
                      {field.name}
                    </button>
                  ))}
                </details>
              ) : null}
              {chart && view ? (
                <DatabaseChart
                  databaseId={id}
                  viewId={view.id}
                  fields={fields}
                />
              ) : null}
              {error ? <p role="alert">{errorMessage(error)}</p> : null}
              <RequestState
                loading={query.loading}
                error={query.error}
                retry={query.reload}
              >
                {view && query.data ? (
                  <RecordLayouts
                    canEditStructure={canEdit && !resource.data.database.structure_locked_at}
                    view={view}
                    onCreateRequiredField={type=>setFieldEdit({id:crypto.randomUUID(),name:type==='date'?'Date':'Group',type,config:{},position:fields.length})}
                    query={query.data}
                    rawFields={fields}
                    rawRecords={records}
                    props={{
                      fields: shown.map(fieldView),
                      records: records.map((record) =>
                        recordView(record, fields, references),
                      ),
                      showRecordIcon:
                        page.data?.policyProfile["record.page-parity.v1"] ===
                        "record-is-page",
                      canEditRecords: canEdit,
                      onOpenRecord: (recordId) => page.data?.policyProfile["record.page-parity.v1"] === "record-is-page" ? setPeek(recordId) : window.location.assign(`/app/databases/${id}/records/${recordId}`),
                      onValueChange: update,
                      onEditValue: (recordId, fieldId) => {
                        const record = query.data!.records.find(
                            (item) => item.pageId === recordId,
                          ),
                          field = fields.find((item) => item.id === fieldId);
                        if (record && field) setEdit({ record, field });
                      },
                      onOpenLink: (link) =>
                        window.location.assign(`/app/pages/${link}`),
                      onNewRecord: () => setDialog("new"),
                    }}
                    onGroupMove={(recordId, value) => {
                      const record = records.find(
                          (item) => item.pageId === recordId,
                        ),
                        field = fields.find(
                          (item) => item.id === view.groups[0]?.field,
                        );
                      if (record && field)
                        void saveValue(record, field, value).catch(setError);
                    }}
                    onHideEmpty={(hide) =>
                      void saveView({
                        ...view,
                        groups: view.groups.map((group, index) =>
                          index ? group : { ...group, hideEmpty: hide },
                        ),
                      }).catch(setError)
                    }
                    onCalculation={(fieldId, kind) =>
                      void saveView({
                        ...view,
                        calculations: { ...view.calculations, [fieldId]: kind },
                      }).catch(setError)
                    }
                  />
                ) : null}
                {query.data?.records.length === 0 ? (
                  <p className="muted">No records match this view.</p>
                ) : null}
              </RequestState>
            </>
          ) : null}
        </RequestState>
        {fieldEdit ? (
          <FieldDialog
            field={fieldEdit}
            fields={fields}
            onClose={() => setFieldEdit(undefined)}
            onSave={async (field) => {
              const {
                evaluationState: _evaluationState,
                readOnly: _readOnly,
                ...input
              } = field;
              await mutate(`/api/databases/${id}/fields`, {
                operationKey: operationKey(),
                expectedRevisionId: resource.data!.database.revision_id,
                field: input,
              });
              await reload();
            }}
          />
        ) : null}
        {dialog === "view" && view ? (
          <ViewDialog
            view={view}
            fields={fields}
            onSave={saveView}
            onClose={() => setDialog(null)}
          />
        ) : null}
        {dialog==='delete-view'&&view?<ActionDialog title="Delete this saved view?" action="Delete view" onClose={()=>setDialog(null)} onSubmit={async()=>{const {revisionId:_revisionId,...input}=view;await mutate(`/api/databases/${id}/views`,{operationKey:operationKey(),expectedRevisionId:resource.data!.database.revision_id,view:input,delete:true});setActive(undefined);if(!await resource.reload())throw new Error('The view was deleted. Reload the database to see its remaining views.');}}><p>Delete “{view.name}”. Its records and other saved views remain available.</p></ActionDialog>:null}
        {dialog === "new" ? (
          <ActionDialog
            title="New record"
            action="Create record"
            onClose={() => setDialog(null)}
            onSubmit={async (form) => {
              await mutate(`/api/databases/${id}/records`, {
                operationKey: operationKey(),
                title: String(form.get("title")),
                values: {},
              });
              await query.reload();
            }}
          >
            <label>
              Name
              <input name="title" required autoFocus />
            </label>
          </ActionDialog>
        ) : null}
        {edit && ["relation", "person", "file"].includes(edit.field.type) ? (
          <ReferenceValueDialog
            databaseId={id}
            field={edit.field}
            value={edit.record.values[edit.field.id]}
            onClose={() => setEdit(undefined)}
            onSave={(value) => saveValue(edit.record, edit.field, value)}
          />
        ) : edit ? (
          <RecordValueDialog
            field={edit.field}
            value={edit.record.values[edit.field.id]}
            onClose={() => setEdit(undefined)}
            onSave={(value) => saveValue(edit.record, edit.field, value)}
          />
        ) : null}
      </section>
    </>
  );
}
