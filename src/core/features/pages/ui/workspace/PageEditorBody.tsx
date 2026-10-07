import {useContentQueries} from './useContentQueries';
import {ContentQueryDialog} from './ContentQueryDialog';
import {EmptyPageDraft} from "./EmptyPageDraft";
import {sliceRichText} from "../../../editor/ui/sliceRichText";
import type {PageSelection} from "./selection";
import {formatSelection} from "../../../editor/ui/formatSelection";
import {richTextToPlain} from "../../../editor/ui/types";
import {typedBlock} from "../../../editor/ui/typedFormatting";
import { useEffect, useRef, useState } from "react";
import { EditorMediaDialog } from "./EditorMediaDialog";
import { BlockEditor } from "../../../editor/ui/BlockEditor";
import { BlockView } from "../../../editor/ui/blocks/BlockView";
import { InsertMenu } from "../../../editor/ui/InsertMenu";
import { newBlock } from "../../../editor/ui/newBlock";
import type { InsertKind } from "../../../editor/ui/blockCatalog";
import type { BlockMove, EditorBlock } from "../../../editor/ui/types";
import type { usePageEditor } from "../../../../client/usePageEditor";
import type { DocumentView } from "../../../../client/content";
import { contentApi, editorBlocks } from "../../../../client/content";
import { errorMessage } from "../../../../client/transport";
import { ActionDialog } from "../../../../app/ui/ActionDialog";

export function PageEditorBody({
  editor,
  document,
  onAsk,
  onComment,
}: {
  editor: ReturnType<typeof usePageEditor>;
  document: DocumentView;
  onAsk: (selection?:PageSelection) => void;
  onComment: (selection?:PageSelection) => void;
}) {
  const liveQueries=useContentQueries(document.page.id,editor.blocks);
  const [queryEditor,setQueryEditor]=useState<string|null>(null);
  const editedQuery=editor.blocks.find(block=>block.id===queryEditor);
  const undoConversion = useRef<EditorBlock | null>(null);
  const wrapper = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = wrapper.current;
    if (!element) return;
    const insertAt = (event:Event) => {const target=event.target as HTMLElement;setInsert({after:target.closest<HTMLElement>('[data-block-id]')?.dataset.blockId ?? null,range:(event as CustomEvent<{anchor:number;focus:number}>).detail});};
    const undo=(event:KeyboardEvent)=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='z'&&undoConversion.current){event.preventDefault();const previous=undoConversion.current;undoConversion.current=null;void editor.structure(editor.blocks.map(b=>b.id===previous.id?previous:b)).catch(setError);}};
    element.addEventListener('slate-insert-at-cursor',insertAt);
    element.addEventListener('keydown',undo);
    const selected = async (event:Event, comment:boolean) => {
      const target=event.target as HTMLElement,blockId=target.closest<HTMLElement>('[data-block-id]')?.dataset.blockId;
      const range=(event as CustomEvent<{anchor:number;focus:number}>).detail;
      const block=editor.blocks.find(b=>b.id===blockId);
      if(!block || !('text' in block) || !range)return;
      const start=Math.min(range.anchor,range.focus),end=Math.max(range.anchor,range.focus),anchorId=crypto.randomUUID();
      const value:PageSelection={blockId:block.id,blockRevisionId:document.blocks.find(b=>b.id===block.id)?.revisionId??'',revisionId:editor.workingRevisionId,anchorId,start,end,quote:richTextToPlain(block.text).slice(start,end)};
      if(comment){try{await editor.structure(editor.blocks.map(b=>b.id===block.id?{...block,text:formatSelection(block.text,start,end,span=>({...span,commentAnchorId:anchorId}))}:b));const fresh=await contentApi.document(document.page.id);value.revisionId=fresh.workingRevisionId;onComment(value);}catch(cause){setError(cause);}}
      else onAsk(value);
    };
    const comment=(event:Event)=>{void selected(event,true);};const ask=(event:Event)=>{void selected(event,false);};
    element.addEventListener("slate-comment-selection", comment);
    element.addEventListener("slate-ask-selection", ask);
    return () => {
      element.removeEventListener('slate-insert-at-cursor',insertAt);
      element.removeEventListener('keydown',undo);
      element.removeEventListener("slate-comment-selection", comment);
      element.removeEventListener("slate-ask-selection", ask);
    };
  }, [onAsk, onComment,editor]);
  const [insert, setInsert] = useState<{ after: string | null; range?:{anchor:number;focus:number} } | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<unknown>();
  const [conflict, setConflict] = useState<{
    id: string;
    saved: EditorBlock;
  } | null>(null);
  const [media, setMedia] = useState<{ id: string; mode: "upload" | "link" }>();
  const [selected, setSelected] = useState<string[]>([]);

  async function apply(next: EditorBlock[]) {
    setError(undefined);
    try {
      await editor.structure(next);
    } catch (cause) {
      setError(cause);
    }
  }
  function add(kind: InsertKind) {
    const index = insert?.after
      ? editor.blocks.findIndex((block) => block.id === insert.after) + 1
      : editor.blocks.length;
    const next = [...editor.blocks];
    const block=next[index-1];
    const inserted=newBlock(kind);
    if(insert?.range && block?.type==='paragraph'){
      const start=Math.min(insert.range.anchor,insert.range.focus),end=Math.max(insert.range.anchor,insert.range.focus);
      const before=sliceRichText(block.text,0,start),after=sliceRichText(block.text,end);
      next.splice(index-1,1,...(before.length?[{...block,text:before}]:[]),inserted,...(after.length?[{id:crypto.randomUUID(),type:'paragraph' as const,text:after}]:[]));
    }else next.splice(index, 0, inserted);
    setInsert(null);
    setQuery("");
    void apply(next).then(()=>requestAnimationFrame(()=>window.document.querySelector<HTMLElement>(`[data-block-id="${inserted.id}"] [contenteditable="true"]`)?.focus()));
  }
  function move(id: string, movement: BlockMove) {
    const next = [...editor.blocks];
    const index = next.findIndex((block) => block.id === id);
    if (index < 0) return;
    if (movement.kind === "indent" || movement.kind === "outdent")
      next[index] = {
        ...next[index],
        indent: Math.max(
          0,
          (next[index].indent ?? 0) + (movement.kind === "indent" ? 1 : -1),
        ),
      };
    else {
      const [block] = next.splice(index, 1);
      const target =
        movement.kind === "step"
          ? index + (movement.direction === "up" ? -1 : 1)
          : next.findIndex((item) => item.id === movement.blockId) +
            (movement.kind === "after" ? 1 : 0);
      next.splice(Math.max(0, Math.min(next.length, target)), 0, block);
    }
    void apply(next);
  }
  async function compare(id: string) {
    try {
      const fresh = await contentApi.document(document.page.id);
      const saved = editorBlocks(fresh.blocks).find((block) => block.id === id);
      if (!saved)
        throw new Error(
          "The saved block was removed. Your local text remains in the editor.",
        );
      setConflict({ id, saved });
    } catch (cause) {
      setError(cause);
    }
  }
  return (
    <div ref={wrapper} data-page-editor tabIndex={-1}>
      {document.permissions.canEdit ? (
        <div className="editor-actions">
          <button type="button" onClick={() => setInsert({ after: null })}>
            ＋ Add block
          </button>
        </div>
      ) : (
        <p className="muted">You have read access to this page.</p>
      )}
      {insert ? (
        <InsertMenu
          open
          query={query}
          onQueryChange={setQuery}
          onInsert={add}
          onClose={() => setInsert(null)}
        />
      ) : null}
      {editedQuery?.type==='content-query'?<ContentQueryDialog block={editedQuery} onClose={()=>setQueryEditor(null)} onSave={async definition=>{await editor.structure(editor.blocks.map(block=>block.id===editedQuery.id?{...editedQuery,definition,results:[],lastRanLabel:"Not run yet"}:block));}}/>:null}
      {error ? <p role="alert">{errorMessage(error)}</p> : null}
      {editor.structureState?<p role="status">{editor.structureState==="saving"?"Saving page structure…":"Saved page structure"}</p>:null}
      {!editor.blocks.length&&document.permissions.canEdit?<EmptyPageDraft pageId={document.page.id} editor={editor}/>:<BlockEditor
        blocks={liveQueries.blocks.map(block=>{
          const mentions=(document as DocumentView&{mentions?:Record<string,{label:string;available:boolean;state:string}>}).mentions;
          const hydrate=(value:unknown):unknown=>Array.isArray(value)?value.map(hydrate):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,item])=>[key,key==='mention'&&item&&typeof item==='object'&&'id'in item&&mentions?.[String(item.id)]?{...item,...mentions[String(item.id)]}:hydrate(item)])):value;
          return hydrate(block) as EditorBlock;
        })}
        canEdit={document.permissions.canEdit && editor.structureState!=="saving"}
        saveState={editor.saveState}
        selectedBlockIds={selected}
        onSelectionChange={setSelected}
        actions={{
          onChooseFile: (id) => setMedia({ id, mode: "upload" }),
          onAddFileLink: (id) => setMedia({ id, mode: "link" }),
          onDownloadFile: (id) => {
            const block = editor.blocks.find((item) => item.id === id);
            if (block?.type === "media" && block.source)
              window.open(block.source.url, "_blank", "noopener");
          },
          onCopyCode: (id) => {
            const block = editor.blocks.find((item) => item.id === id);
            if (block?.type === "code")
              void navigator.clipboard.writeText(block.code).catch(setError);
          },
          onEditQueryDefinition: id=>setQueryEditor(id),
          onRerunQuery: liveQueries.rerun,
          onOpenQueryResult: (id) => window.location.assign(`/app/pages/${id}`),
        }}
        onChange={(id,rendered)=>{const clean=(value:unknown):unknown=>Array.isArray(value)?value.map(clean):value&&typeof value==="object"?Object.fromEntries(Object.entries(value).map(([key,item])=>[key,key==="mention"&&item&&typeof item==="object"?Object.fromEntries(Object.entries(item).filter(([field])=>field!=="state"&&field!=="available"&&field!=="deletedAt")):clean(item)])):value;const next=clean(rendered) as EditorBlock;const conversion=typedBlock(next);if(conversion){undoConversion.current=next;void apply(editor.blocks.map(block=>block.id===id?conversion:block)).then(()=>requestAnimationFrame(()=>{const target=window.document.querySelector<HTMLElement>(`[data-block-id="${id}"] [contenteditable="true"]`);(target??wrapper.current)?.focus();}));}else{undoConversion.current=null;editor.change(id,next);}}}
        onInsert={(after) => setInsert({ after })}
        onDelete={(id) =>
          void apply(editor.blocks.filter((block) => block.id !== id))
        }
        onMove={move}
        onDuplicate={(id) => {
          const at = editor.blocks.findIndex((block) => block.id === id);
          const next = [...editor.blocks];
          next.splice(at + 1, 0, {
            ...structuredClone(editor.blocks[at]),
            id: crypto.randomUUID(),
          });
          void apply(next);
        }}
        onRetrySave={(id) => {
          const block=[...(wrapper.current?.querySelectorAll<HTMLElement>('[data-block-id]')??[])].find(element=>element.dataset.blockId===id);
          block?.querySelector<HTMLElement>('[data-slate-editable]')?.focus();
          void editor.retry(id);
        }}
        onResolveConflict={(id) => void compare(id)}
        placeholder="Add your first block to start writing."
      />}
      {media && editor.blocks.some((block) => block.id === media.id) ? (
        <EditorMediaDialog
          pageId={document.page.id}
          block={editor.blocks.find((block) => block.id === media.id)!}
          mode={media.mode}
          onChange={(block) => editor.change(block.id, block)}
          onClose={() => setMedia(undefined)}
        />
      ) : null}
      {conflict ? (
        <ActionDialog
          title="Resolve this block’s changes"
          action="Keep my version"
          onClose={() => setConflict(null)}
          onSubmit={async () => {
            await editor.resolve(conflict.id, true);
          }}
        >
          <p>
            Keeping your version replaces the currently saved block. Both page
            revisions remain in history.
          </p>
          <div className="conflict-columns">
            <section>
              <h3>Your unsaved text</h3>
              {editor.blocks
                .filter((block) => block.id === conflict.id)
                .map((block) => (
                  <BlockView
                    key={block.id}
                    block={block}
                    canEdit={false}
                    onChange={() => {}}
                  />
                ))}
            </section>
            <section>
              <h3>Saved block</h3>
              <BlockView
                block={conflict.saved}
                canEdit={false}
                onChange={() => {}}
              />
            </section>
          </div>
          <button
            type="button"
            onClick={() => {
              void editor
                .resolve(conflict.id, false)
                .then(() => setConflict(null))
                .catch(setError);
            }}
          >
            Discard my changes and load saved block
          </button>
        </ActionDialog>
      ) : null}
    </div>
  );
}
