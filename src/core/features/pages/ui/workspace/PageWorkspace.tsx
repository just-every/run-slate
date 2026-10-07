import { useFlagshipEnabled } from "../../../../app/ui/LaunchProfile";
import {PageReactions} from './ReactionControls';
import {PublicPageBanner} from './PublicPageBanner';
import {PageStatusBadge} from "./PageStatusBadge";
import {PageAppearance} from "./PageAppearance";
import {useWorkspace} from "../../../../app/ui/WorkspaceContext";
import type {PageSelection} from "./selection";
import { PageOutline } from "../PageOutline";
import { PagePresentation } from "./PagePresentation";
import { richTextToPlain } from "../../../editor/ui/types";
import { useEffect, useRef, useState } from "react";
import { validatePageRead } from "../../../../client/pageReadBoundary";
import { TransportError } from "../../../../client/transport";
import { useResource, type Resource } from "../../../../client/useResource";
import { contentApi, type DocumentView } from "../../../../client/content";
import {
  mutate,
  operationKey,
  errorMessage,
} from "../../../../client/transport";
import { useCollaboration } from "../../../../client/useCollaboration";
import { usePageEditor } from "../../../../client/usePageEditor";
import { RequestState } from "../../../../app/ui/RequestState";
import { PageEditorBody } from "./PageEditorBody";
import { PageDetails } from "./PageDetails";

export function PageWorkspace({ pageId }: { pageId: string }) {
  const {member, workspace}=useWorkspace();
  return <RequestState loading={workspace.loading} error={workspace.error} retry={workspace.reload}>
    <PageBoundary key={`${member.workspaceId}:${member.id}:${workspace.data?.id ?? ''}:${pageId}`} pageId={pageId}/>
  </RequestState>;
}
function PageBoundary({pageId}:{pageId:string}) {
  const resource = useResource<DocumentView>(`/api/pages/${encodeURIComponent(pageId)}`, {
    retainOnTransportFailure:true,
    validate: value=>validatePageRead(value,pageId),
  });
  const retained=resource.data !== undefined && resource.error instanceof TransportError;
  return <>
    {retained?<div role="alert">Refresh failed. Current server state is unconfirmed. Your unsaved edits remain here. <button onClick={()=>void resource.reload()}>Retry page refresh</button></div>:null}
    <RequestState loading={resource.loading} error={retained?undefined:resource.error} retry={resource.reload}>
      {resource.data?<LoadedPage key={`${pageId}:${resource.data.permissions.canEdit}:${resource.data.permissions.canShare}`} document={resource.data} reload={resource.reload} read={resource.read}/>:null}
    </RequestState>
  </>;
}
function LoadedPage({
  document,
  reload,
  read,
}: {
  document: DocumentView;
  reload: () => Promise<boolean>;
  read: Resource<DocumentView>["read"];
}) {
  const {member}=useWorkspace();
  const flagship = useFlagshipEnabled();
  const editor = usePageEditor(document);
  const collaboration = useCollaboration(document.page.id, read);
  const titleKey=`slate:unsaved-title:${member.workspaceId}:${member.id}:${document.page.id}`;
  const recovered=useRef<{title:string;revision:string;key:string}|null>(null);
  const [title, setTitle] = useState(()=>{try{const value=localStorage.getItem(titleKey);if(value && document.permissions.canEdit)recovered.current=JSON.parse(value);}catch{}return recovered.current?.title??document.page.title;});
  const [savedTitle, setSavedTitle] = useState(document.page.title);
  const [selection,setSelection] = useState<PageSelection>();
  const [present, setPresent] = useState(false);
  const [detail, setDetail] = useState<string | null>(() => typeof window !== "undefined" ? (new URLSearchParams(window.location.search).get("detail") ?? (new URLSearchParams(window.location.search).has("thread")||new URLSearchParams(window.location.search).has("comment")?"comments":null)) : null);
  const detailPanel=useRef<HTMLElement>(null);
  const detailReturnFocus=useRef<HTMLElement|null>(null);
  const detailReturnBlock=useRef<string|undefined>(undefined);
  useEffect(()=>{
    if(detail){
      detailReturnBlock.current=selection?.blockId;
      const active=window.document.activeElement;
      if(active instanceof HTMLElement && active!==window.document.body && !detailPanel.current?.contains(active))detailReturnFocus.current=active;
      detailPanel.current?.querySelector<HTMLButtonElement>('button')?.focus();
    }else if(detailReturnFocus.current || detailReturnBlock.current){
      if(detailReturnFocus.current?.isConnected)detailReturnFocus.current.focus();
      else if(detailReturnBlock.current){
        const block=[...window.document.querySelectorAll<HTMLElement>('[data-block-id]')].find(element=>element.dataset.blockId===detailReturnBlock.current);
        block?.querySelector<HTMLElement>('[data-slate-editable]')?.focus();
      }
      detailReturnFocus.current=null;
      detailReturnBlock.current=undefined;
    }
  },[detail]);
  const [error, setError] = useState<unknown>();
  const [titleSaving, setTitleSaving] = useState(false);
  const [titleSaved, setTitleSaved] = useState(false);
  const titleAttempt = useRef<{title:string; revision:string; key:string} | undefined>(recovered.current??undefined);
  useEffect(()=>{setDetail(new URLSearchParams(window.location.search).get("detail") ?? (new URLSearchParams(window.location.search).has("thread")||new URLSearchParams(window.location.search).has("comment")?"comments":null));},[]);
  const receiveRef = useRef(editor.receive);
  receiveRef.current = editor.receive;
  useEffect(() => {
    receiveRef.current(document);
  }, [document]);
  useEffect(() => {
    const changed = (event: Event) => {
      if ((event as CustomEvent<{pageId:string}>).detail?.pageId === document.page.id) void reload();
    };
    window.addEventListener("slate:page-mutated", changed);
    return () => {
      window.removeEventListener("slate:page-mutated", changed);
    };
  }, [document.page.id, reload]);

  useEffect(() => {
    void mutate(`/api/pages/${document.page.id}/open`, {
      operationKey: operationKey(),
      revisionId: document.permissions.canEdit
        ? document.workingRevisionId
        : (document.publishedRevisionId ?? document.workingRevisionId),
    }).then(()=>window.dispatchEvent(new Event("slate:page-opened"))).catch(setError);
  }, [document.page.id]);
  async function saveTitle() {
    if (!document.permissions.canEdit || title === savedTitle || titleSaving) return;
    setTitleSaving(true);
    setTitleSaved(false);
    setError(undefined);
    try {
      const attempt = titleAttempt.current?.title === title ? titleAttempt.current : {title, revision: editor.revision, key: operationKey()};
      titleAttempt.current = attempt;
      const result = await mutate<{value:{revisionId:string}}>(`/api/pages/${document.page.id}`, {operationKey:attempt.key, expectedRevisionId:attempt.revision, properties:{title:attempt.title}}, "PATCH");
      editor.setRevision(result.value.revisionId);
      await reload();
      setSavedTitle(title);
      setTitleSaved(true);
      window.dispatchEvent(new Event("slate:navigation-changed"));
      localStorage.removeItem(titleKey);
      titleAttempt.current = undefined;
    } catch (cause) {
      setError(cause);
    } finally {
      setTitleSaving(false);
    }
  }
  return (
    <>
      <header className="topbar">
        <div className="crumbs">
          <a href="/app">Pages</a>
          <span aria-hidden="true">›</span>
          <span>{document.page.title || "Untitled"}</span>{document.policyProfile["page.status.v1"]==="verification-only"?<PageStatusBadge document={document}/>:null}
        </div>
        <div className="tools">
          {[
            ["ask", "Ask"],
            ["share", "Share"],
            ["comments", "Comments"],
            ["history", "History"],
            ["details", "Details"],
            ["options", "More"],
          ].filter(([value]) => flagship || value !== "ask").map(([value, label]) => (
            <button
              className="tool"
              type="button"
              key={value}
              aria-expanded={detail === value}
              onClick={() => {setSelection(undefined);setDetail(detail === value ? null : value);}}
            >
              {label}
            </button>
          ))}
        </div>
      </header>
      {present ? (
        <PagePresentation
          title={title}
          blocks={editor.blocks}
          onClose={() => setPresent(false)}
        />
      ) : null}
      <div className="content-frame">
        <article
          className={`main page-document ${document.properties?.smallText ? "page-small-text" : ""} ${document.properties?.fullWidth ? "page-full-width" : ""}`}
          data-typeface={document.properties?.typeface ?? "default"}
        >
          <p className="eyebrow">
            {document.page.lifecycle === "draft"
              ? "PRIVATE DRAFT"
              : "WORKSPACE PAGE"}
          </p>
          <h1 className="sr-only">{title || "Untitled page"}</h1>
          <PublicPageBanner document={document} onManage={()=>setDetail("options")}/>
          {(document as DocumentView&{schedule?:{state:string;publishAt:string;failure?:string}}).schedule?.state==='scheduled'?<p role="status">Scheduled for {new Date((document as DocumentView&{schedule:{publishAt:string}}).schedule.publishAt).toLocaleString()}</p>:null}
          {(document as DocumentView&{schedule?:{state:string;publishAt:string;failure?:string}}).schedule?.state==='failed'?<p role="alert">Scheduled publication needs attention: {(document as DocumentView&{schedule:{failure?:string}}).schedule.failure??'Open publication options to review and reschedule.'}</p>:null}
          <PageAppearance document={document} revision={editor.revision} onSaved={revision=>{editor.setRevision(revision);reload();window.dispatchEvent(new Event("slate:navigation-changed"));}}/>
          <textarea
            rows={1}
            className="title page-title-input"
            aria-label="Page title"
            readOnly={!document.permissions.canEdit}
            value={title}
            onChange={(event) => {
              setTitle(event.target.value);
              const attempt={title:event.target.value,revision:titleAttempt.current?.revision??editor.revision,key:operationKey()};
              titleAttempt.current=attempt;localStorage.setItem(titleKey,JSON.stringify(attempt));
              setTitleSaved(false);
              event.target.style.height = "auto";
              event.target.style.height = `${event.target.scrollHeight}px`;
            }}
            onBlur={() => void saveTitle()}
          />
          <div className="page-reading-actions">
          {document.policyProfile["page.status.v1"]==="verification-only"?<button className="title-status-action" onClick={()=>setDetail("details")}>Status & verification</button>:<p className="page-byline">{(document as DocumentView&{authorDisplayName?:string}).authorDisplayName}<PageStatusBadge document={document}/> · {Math.max(1,Math.ceil(editor.blocks.map(b=>'text'in b?richTextToPlain(b.text):'').join(' ').split(/\s+/).length/200))} min read <button onClick={()=>setDetail("details")}>Change status</button></p>}
            <button onClick={() => setPresent(true)}>Present this page</button>
          </div>
          {collaboration.presence.length > 1 ? (
            <p className="muted">
              Here now:{" "}
              {collaboration.presence
                .map((person) => person.displayName)
                .join(", ")}
            </p>
          ) : null}
          <p role="status" aria-live="polite">{titleSaving ? "Saving title…" : titleSaved ? "Saved" : title !== savedTitle ? "Unsaved title" : ""}</p>
          {error ? <div role="alert">{errorMessage(error)}{title !== savedTitle ? <><button onClick={() => void saveTitle()}>Retry title save</button><button onClick={async () => {const fresh = await contentApi.document(document.page.id); setError(new Error(`Saved title: ${fresh.page.title}. Your unsaved title: ${title}`)); editor.receive(fresh); titleAttempt.current = undefined;}}>Compare saved title</button><button onClick={async () => {const fresh=await contentApi.document(document.page.id);setTitle(fresh.page.title);setSavedTitle(fresh.page.title);editor.receive(fresh);titleAttempt.current=undefined;setError(undefined);}}>Reload saved title</button></> : null}</div> : null}
          {editor.blocks.some(block => block.type === "heading") ? <details className="page-outline">
            <summary>On this page</summary>
            <PageOutline
              headings={editor.blocks.flatMap((block) =>
                block.type === "heading"
                  ? [
                      {
                        id: block.id,
                        level: block.level,
                        text: richTextToPlain(block.text),
                      },
                    ]
                  : [],
              )}
              onSelectHeading={(id) =>
                window.document
                  .querySelector(`[data-block-id="${CSS.escape(id)}"]`)
                  ?.scrollIntoView({
                    behavior: matchMedia("(prefers-reduced-motion: reduce)")
                      .matches
                      ? "instant"
                      : "smooth",
                    block: "center",
                  })
              }
            />
          </details> : null}
          <PageReactions pageId={document.page.id}/>
          {!document.permissions.canEdit?<p role="status">This page is read-only with your current access. Any unsent draft remains in this tab’s recovery storage.</p>:null}
          <PageEditorBody
            editor={editor}
            document={document}
            onAsk={selection=>{if(flagship){setSelection(selection);setDetail("ask");}}}
            onComment={selection=>{setSelection(selection);setDetail("comments");if(selection)reload();}}
          />
        </article>
        {detail && (flagship || detail !== "ask") ? (
          <aside className="right" ref={detailPanel}>
            <PageDetails
              kind={detail}
              unsaved={editor.hasUnsavedChanges || titleSaving || title !== savedTitle}
              selection={selection}
              document={{ ...document, page: {...document.page, revisionId: editor.revision}, workingRevisionId: editor.workingRevisionId }}
              revision={editor.revision}
              onClose={() => setDetail(null)}
              reload={reload}
            />
          </aside>
        ) : null}
      </div>
    </>
  );
}
