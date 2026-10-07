import {ReadableExportDialog} from "../../../exports/ui/ReadableExportDialog";
import {CreateDecisionDialog} from '../../../decisions/ui/CreateDecisionDialog';
import {WorkspacePublicationDialog} from "./WorkspacePublicationDialog";
import {PageStatusPanel} from "../../../page-status/ui/workspace/PageStatusPanel";
import { PageTransferDialog } from "./PageTransferDialog";
import { SaveTemplateDialog } from "../../../templates/ui/workspace/SaveTemplateDialog";
import { AnalyticsPanel } from "../../../analytics/ui/workspace/AnalyticsPanel";
import { PageFollowing } from "./PageFollowing";
import { useState } from "react";
import type { DocumentView } from "../../../../client/content";
import { contentApi } from "../../../../client/content";
import {
  mutate,
  operationKey,
  errorMessage,
} from "../../../../client/transport";
import { ActionDialog } from "../../../../app/ui/ActionDialog";
import { PagePublication } from "./PagePublication";
export function PageOptions({
  document,
  unsaved,
  revision,
  reload,
}: {
  document: DocumentView;
  unsaved: boolean;
  revision: string;
  reload: () => void;
}) {
  const [action, setAction] = useState<string | null>(null);
  const [error, setError] = useState<unknown>();
  const id = document.page.id;
  const [transfer, setTransfer] = useState<"move" | "duplicate" | null>(null);
  const [decision,setDecision]=useState(false);
  const [exporting,setExporting]=useState(false);
  const [template, setTemplate] = useState(false);
  const [templateSaved, setTemplateSaved] = useState(false);
  async function perform(path: string, extra: object = {}) {
    await mutate(path, {
      operationKey: operationKey(),
      expectedRevisionId: revision,
      ...extra,
    });
    await reload();
    window.dispatchEvent(new Event("slate:navigation-changed"));
  }
  return (
    <section>
      <h2>Page options</h2>
      <button onClick={()=>setExporting(true)}>Export page</button>
      {exporting?<ReadableExportDialog id={id} onClose={()=>setExporting(false)}/>:null}
      {document.permissions.canEdit?<button onClick={()=>setDecision(true)}>Add decision record</button>:null}
      {decision?<CreateDecisionDialog pageId={id} onClose={()=>setDecision(false)}/>:null}
      {document.permissions.canEdit ? (
        <button onClick={() => setTransfer("move")}>Move page</button>
      ) : null}
      <button onClick={() => setTransfer("duplicate")}>Duplicate page</button>
      {transfer ? (
        <PageTransferDialog
          pageId={id}
          revision={revision}
          kind={transfer}
          onClose={() => setTransfer(null)}
          onDone={(next) => window.location.assign(`/app/pages/${next}`)}
        />
      ) : null}
      {document.permissions.canEdit ? (
        <button onClick={() => setTemplate(true)}>Save as template</button>
      ) : null}
      {templateSaved ? (
        <p role="status">
          Template saved. <a href="/app/templates">Open templates</a>
        </p>
      ) : null}
      {template ? (
        <SaveTemplateDialog
          sourcePageId={id}
          title={document.page.title}
          onClose={() => setTemplate(false)}
          onSaved={() => setTemplateSaved(true)}
        />
      ) : null}
      <PageFollowing pageId={id} />
      <PageStatusPanel pageId={id} revision={revision} workingRevisionId={document.workingRevisionId} canEdit={document.permissions.canEdit} onSaved={reload}/>
      <details>
        <summary>Readership & contributors</summary>
        <AnalyticsPanel pageId={id} />
      </details>
      {document.permissions.canEdit ? (
        <>
          <form
            className="detail-form"
            onSubmit={async (event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              try {
                await contentApi.properties(id, revision, {
                  icon: String(data.get("icon") ?? "") || null,
                  labels: String(data.get("labels") ?? "")
                    .split(",")
                    .map((value) => value.trim())
                    .filter(Boolean),
                  typeface: String(data.get("typeface")),
                  smallText: data.get("smallText") === "on",
                  fullWidth: data.get("fullWidth") === "on",
                });
                await reload();
              } catch (cause) {
                setError(cause);
              }
            }}
          >
            <label>
              Page icon
              <input
                name="icon"
                defaultValue={
                  typeof document.properties?.icon === "string"
                    ? document.properties.icon
                    : ""
                }
                placeholder="An emoji"
              />
            </label>
            <label>
              Labels
              <input
                name="labels"
                defaultValue={document.properties?.labels?.join(", ")}
                placeholder="Separate with commas"
              />
            </label>
            <label>
              Typeface
              <select
                name="typeface"
                defaultValue={document.properties?.typeface ?? "default"}
              >
                <option value="default">Default</option>
                <option value="serif">Serif</option>
                <option value="mono">Mono</option>
              </select>
            </label>
            <label>
              <input
                type="checkbox"
                name="smallText"
                defaultChecked={document.properties?.smallText}
              />
              Small text
            </label>
            <label>
              <input
                type="checkbox"
                name="fullWidth"
                defaultChecked={document.properties?.fullWidth}
              />
              Full width
            </label>
            <button type="submit">Save display settings</button>
          </form>
          {document.policyProfile["page.lifecycle.v1"] ===
            "draft-then-publish" || document.policyProfile["page.version.v1"] === "labelled" || document.page.lifecycle === "draft" ? (
            <><button type="button" disabled={unsaved} title={unsaved ? "Save or resolve your current edits before reviewing publication" : undefined} onClick={() => setAction("publish")}>
              Publish workspace revision
            </button>{unsaved?<p role="status">Save or resolve your current edits before reviewing publication.</p>:null}</>
          ) : null}
          {document.page.lifecycle === "scheduled" ? (
            <button type="button" onClick={() => setAction("cancel-schedule")}>
              Cancel scheduled publication
            </button>
          ) : null}
          {document.publishedRevisionId &&
          document.publishedRevisionId !== document.workingRevisionId ? (
            <button type="button" onClick={() => setAction("discard-changes")}>
              Discard unpublished changes
            </button>
          ) : null}
          <button type="button" onClick={() => setAction("archive")}>
            Archive page
          </button>
          <button type="button" onClick={() => setAction("trash")}>
            Move to trash
          </button>
        </>
      ) : (
        <p>You can read this page. Editing options require edit access.</p>
      )}
      <PagePublication document={document} revision={revision} />
      {error ? <p role="alert">{errorMessage(error)}</p> : null}
      {action === "publish" ? <WorkspacePublicationDialog document={document} revision={revision} onClose={()=>setAction(null)} onSaved={reload}/> : action ? (
        <ActionDialog
          title={action === "archive" ? "Archive this page?" : action === "trash" ? "Move this page to trash?" : "Confirm this page change"}
          action="Confirm"
          onClose={() => setAction(null)}
          onSubmit={async (data) => {
            if (["archive", "trash"].includes(action))
              await perform(`/api/archive/${id}`, {
                action,
                reason: String(data.get("reason") ?? ""),
              });
            else
              await perform(`/api/pages/${id}/${action}`);
          }}
        >
          <p>This changes the page for everyone who can access it. Its history is retained.</p>
          <label>Reason<input name="reason"/></label>
        </ActionDialog>
      ) : null}
    </section>
  );
}
