import { useFlagshipEnabled } from "../../../../app/ui/LaunchProfile";
import { useNavigate } from "@tanstack/react-router";
import {PageReactions} from './ReactionControls';
import {PublicPageBanner} from './PublicPageBanner';
import { PageStatusBadge } from "./PageStatusBadge";
import { PageReadMetadata } from "./PageReadMetadata";
import {PageAppearance} from "./PageAppearance";
import {useWorkspace} from "../../../../app/ui/WorkspaceContext";
import type {PageSelection} from "./selection";
import { PageOutline } from "../PageOutline";
import { richTextToPlain } from "../../../editor/ui/types";
import { PagePresentation } from "./PagePresentation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { validatePageRead } from "../../../../client/pageReadBoundary";
import { ApiError, TransportError } from "../../../../client/transport";
import { draftKeys } from "../../../../client/draftRecovery";
import { UnsavedDraft } from "./UnsavedDraft";
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
import { PageDetails, panelTitles } from "./PageDetails";
import { PageMoreMenu } from "./PageMoreMenu";
import { PageTopBar } from "./PageTopBar";
import { useNewPageArrival } from "./useNewPageArrival";
import type { Crumb } from "../../../../app/ui/header/TopBar";

/** What a host adds around a page: its own location, extra More-menu items, and properties shown beneath the byline. */
export interface PageHost {
  /** The crumbs before the page's own title; defaults to "Pages". */
  trail?: Crumb[];
  /** Extra items for the top bar's More menu, listed after Export page. */
  moreItems?: ReactNode;
  properties?: ReactNode;
}
export function PageWorkspace({ pageId, host }: { pageId: string; host?: PageHost }) {
  const {member, workspace}=useWorkspace();
  return <RequestState loading={workspace.loading} error={workspace.error} retry={workspace.reload}>
    <PageBoundary key={`${member.workspaceId}:${member.id}:${workspace.data?.id ?? ''}:${pageId}`} pageId={pageId} host={host}/>
  </RequestState>;
}
function PageBoundary({pageId,host}:{pageId:string;host?:PageHost}) {
  const {member}=useWorkspace();
  const resource = useResource<DocumentView>(`/api/pages/${encodeURIComponent(pageId)}`, {
    retainOnTransportFailure:true,
    validate: value=>validatePageRead(value,pageId),
  });
  const retained=resource.data !== undefined && resource.error instanceof TransportError;
  const opened=useRef(false);
  if(resource.data)opened.current=true;
  const denied=resource.error instanceof ApiError && (resource.error.status===403 || resource.error.status===404);
  // SHARE-007: losing access while the page is open also drops it from the tree.
  useEffect(()=>{if(denied&&opened.current)window.dispatchEvent(new Event("slate:navigation-changed"));},[denied]);
  if(denied)return <PageAccessNeeded pageId={pageId} changed={opened.current} keys={draftKeys(member.workspaceId,member.id,pageId)}/>;
  return <>
    {retained?<div role="alert">Refresh failed. Current server state is unconfirmed. Your unsaved edits remain here. <button onClick={()=>void resource.reload()}>Retry page refresh</button></div>:null}
    <RequestState loading={resource.loading} error={retained?undefined:resource.error} retry={resource.reload}>
      {resource.data?<LoadedPage key={`${pageId}:${resource.data.permissions.canEdit}:${resource.data.permissions.canShare}`} document={resource.data} reload={resource.reload} read={resource.read} invalidateRead={resource.invalidate} host={host}/>:null}
    </RequestState>
  </>;
}
/** LINK-004: the page's existence is acknowledged with no title, snippet or author. */
function PageAccessNeeded({pageId,changed,keys}:{pageId:string;changed:boolean;keys:ReturnType<typeof draftKeys>}) {
  return <div className="content-frame"><article className="main page-document">
    <div className="request-notice" role="alert">
      <h2>Access needed</h2>
      <p>{changed?"Your access to this page changed while it was open. ":""}You need access to open this page.</p>
      <button type="button" data-request-page-access={pageId}>Request access</button>
    </div>
    <UnsavedDraft keys={keys} reason="Your access to this page changed before this text was saved."/>
  </article></div>;
}
function LoadedPage({
  document,
  reload,
  read,
  invalidateRead,
  host,
}: {
  document: DocumentView;
  reload: () => Promise<boolean>;
  read: Resource<DocumentView>["read"];
  invalidateRead: () => void;
  host?: PageHost;
}) {
  const {member}=useWorkspace();
  const navigate = useNavigate();
  const flagship = useFlagshipEnabled();
  const editor = usePageEditor(document, invalidateRead);
  const collaboration = useCollaboration(document.page.id, read);
  const keys=draftKeys(member.workspaceId,member.id,document.page.id),titleKey=keys.title;
  const recovered=useRef<{title:string;revision:string;key:string}|null>(null);
  const [title, setTitle] = useState(()=>{try{const value=localStorage.getItem(titleKey);if(value && document.permissions.canEdit)recovered.current=JSON.parse(value);}catch{}return recovered.current?.title??document.page.title;});
  const [savedTitle, setSavedTitle] = useState(document.page.title);
  const [selection,setSelection] = useState<PageSelection>();
  const [present, setPresent] = useState(false);
  const [detail, setDetailState] = useState<string | null>(() => typeof window !== "undefined" ? (new URLSearchParams(window.location.search).get("detail") ?? (new URLSearchParams(window.location.search).has("thread")||new URLSearchParams(window.location.search).has("comment")?"comments":null)) : null);
  function setDetail(value: string | null) {
    setDetailState(value);
    const url = new URL(window.location.href);
    if (value) url.searchParams.set("detail", value);
    else {
      url.searchParams.delete("detail");
      url.searchParams.delete("thread");
      url.searchParams.delete("comment");
    }
    // A panel updates the current page URL without restoring an earlier page
    // scroll position after its own focus has already settled.
    void navigate({ href: `${url.pathname}${url.search}${url.hash}`, replace: true, resetScroll: false, hashScrollIntoView: false }).catch(setError);
  }
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === "Escape" && !event.defaultPrevented && !window.document.querySelector("dialog[open], [role=dialog]")) setDetail(null); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);
  const detailPanel=useRef<HTMLElement>(null);
  const detailReturnFocus=useRef<HTMLElement|null>(null);
  // A panel opened from the More menu returns focus to the menu's button, which the menu names here.
  const requestedReturn=useRef<HTMLElement|null>(null);
  const detailReturnBlock=useRef<string|undefined>(undefined);
  useEffect(()=>{
    if(detail){
      detailReturnBlock.current=selection?.blockId;
      const active=window.document.activeElement;
      if(requestedReturn.current)detailReturnFocus.current=requestedReturn.current;
      else if(active instanceof HTMLElement && active!==window.document.body && !detailPanel.current?.contains(active))detailReturnFocus.current=active;
      requestedReturn.current=null;
      detailPanel.current?.querySelector<HTMLButtonElement>('button')?.focus();
      if (window.matchMedia("(max-width: 1200px)").matches) detailPanel.current?.scrollIntoView({block:"start"});
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
  const titleInput = useRef<HTMLTextAreaElement>(null);
  useNewPageArrival(titleInput, document.permissions.canEdit, setError);
  const [titleSaving, setTitleSaving] = useState(false);
  const [titleSaved, setTitleSaved] = useState(false);
  const titleAttempt = useRef<{title:string; revision:string; key:string} | undefined>(recovered.current??undefined);
  useEffect(()=>{setDetailState(new URLSearchParams(window.location.search).get("detail") ?? (new URLSearchParams(window.location.search).has("thread")||new URLSearchParams(window.location.search).has("comment")?"comments":null));},[]);
  // A title committed elsewhere replaces the shown title unless this tab is editing it.
  useEffect(() => {
    if (title === savedTitle && document.page.title !== savedTitle && !titleSaving) {
      setTitle(document.page.title);
      setSavedTitle(document.page.title);
    }
  }, [document.page.title]);
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
    const open = async (current: DocumentView, again: boolean): Promise<void> => {
      try {
        await mutate(`/api/pages/${current.page.id}/open`, {
          operationKey: operationKey(),
          revisionId: current.permissions.canEdit
            ? current.workingRevisionId
            : (current.publishedRevisionId ?? current.workingRevisionId),
        });
        window.dispatchEvent(new Event("slate:page-opened"));
      } catch (cause) {
        // Someone else's change can land while this tab records its visit; record
        // the visit once more against the page as it is now.
        if (again && cause instanceof ApiError && cause.status === 409) return open(await contentApi.document(current.page.id), false);
        throw cause;
      }
    };
    void open(document, true).catch(setError);
  }, [document.page.id]);
  // SAVE-003: a title saved against a superseded page revision is refused; keeping
  // it is an explicit overwrite against the revision the server holds now.
  const [titleConflict,setTitleConflict]=useState(false);
  async function overwriteTitle() {
    try {
      const fresh=await contentApi.document(document.page.id);
      editor.receive(fresh);
      titleAttempt.current={title,revision:fresh.page.revisionId,key:operationKey()};
      localStorage.setItem(titleKey,JSON.stringify(titleAttempt.current));
      await saveTitle();
    } catch (cause) { setError(cause); }
  }
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
      setTitleConflict(false);
    } catch (cause) {
      setError(cause);
      setTitleConflict(cause instanceof ApiError && cause.status===409);
    } finally {
      setTitleSaving(false);
    }
  }
  return (
    <>
      <PageTopBar
        trail={[...(host?.trail ?? [{ label: "Pages", href: "/app" }]), { label: document.page.title || "Untitled", suffix: document.policyProfile["page.status.v1"] === "verification-only" ? <PageStatusBadge document={document}/> : null }]}
        flagship={flagship}
        detail={detail}
        onToggle={value => {setSelection(undefined);setDetail(detail === value ? null : value);}}
        more={<PageMoreMenu
          document={{ ...document, page: {...document.page, revisionId: editor.revision}, workingRevisionId: editor.workingRevisionId }}
          unsaved={editor.hasUnsavedChanges || titleSaving || title !== savedTitle}
          revision={editor.revision}
          flagship={flagship}
          extraItems={host?.moreItems}
          reload={reload}
          onPresent={() => {setPresent(true);setDetail(null);}}
          onOpenPanel={(kind, returnTo) => {setSelection(undefined);requestedReturn.current=returnTo;setDetail(kind);}}
        />}
      />
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
          {document.page.lifecycle === "draft" ? <p className="draft-label">Private draft</p> : null}
          <h1 className="sr-only">{title || "Untitled page"}</h1>
          <PublicPageBanner document={document} onManage={()=>setDetail("publication")}/>
          {(document as DocumentView&{schedule?:{state:string;publishAt:string;failure?:string}}).schedule?.state==='scheduled'?<p role="status">Scheduled for {new Date((document as DocumentView&{schedule:{publishAt:string}}).schedule.publishAt).toLocaleString()}</p>:null}
          {(document as DocumentView&{schedule?:{state:string;publishAt:string;failure?:string}}).schedule?.state==='failed'?<p role="alert">Scheduled publication needs attention: {(document as DocumentView&{schedule:{failure?:string}}).schedule.failure??'Open publication options to review and reschedule.'}</p>:null}
          <PageAppearance document={document}/>
          <textarea
            ref={titleInput}
            rows={1}
            className="page-title page-title-input"
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
          <PageReadMetadata document={document} saveState={titleSaving ? "Saving title…" : titleSaved ? "Saved" : title !== savedTitle ? "Unsaved title" : undefined} />
          {host?.properties}
          {collaboration.presence.length > 1 ? (
            <p className="muted">
              Here now:{" "}
              {collaboration.presence
                .map((person) => person.displayName)
                .join(", ")}
            </p>
          ) : null}
          {error ? <div role="alert">{errorMessage(error)}{title !== savedTitle ? <>{titleConflict ? <button onClick={() => void overwriteTitle()}>Keep my title</button> : <button onClick={() => void saveTitle()}>Retry title save</button>}<button onClick={async () => {const fresh = await contentApi.document(document.page.id); setError(new Error(`Saved title: ${fresh.page.title}. Your unsaved title: ${title}`)); editor.receive(fresh);}}>Compare saved title</button><button onClick={async () => {const fresh=await contentApi.document(document.page.id);setTitle(fresh.page.title);setSavedTitle(fresh.page.title);editor.receive(fresh);titleAttempt.current=undefined;localStorage.removeItem(titleKey);setTitleConflict(false);setError(undefined);}}>Reload saved title</button></> : null}</div> : null}
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
          {!document.permissions.canEdit?<><p role="status">This page is read-only with your current access.</p><UnsavedDraft keys={keys} reason="Your access to this page changed to view only before this text was saved."/></>:null}
          <PageEditorBody
            editor={editor}
            document={document}
            onAsk={selection=>{if(flagship){setSelection(selection);setDetail("ask");}}}
            onComment={selection=>{setSelection(selection);setDetail("comments");if(selection)reload();}}
            footer={<details className="page-reactions"><summary>Reactions</summary><PageReactions pageId={document.page.id}/></details>}
          />
        </article>
        {detail && Object.hasOwn(panelTitles, detail) && (flagship || detail !== "ask") ? (
          <aside className="right" ref={detailPanel} role="region" aria-label={panelTitles[detail]}>
            <PageDetails
              kind={detail}
              selection={selection}
              document={{ ...document, page: {...document.page, revisionId: editor.revision}, workingRevisionId: editor.workingRevisionId }}
              revision={editor.revision}
              onClose={() => setDetail(null)}
              onCommentSent={() => setSelection(undefined)}
              reload={reload}
            />
          </aside>
        ) : null}
      </div>
    </>
  );
}
