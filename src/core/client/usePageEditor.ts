import { useEffect, useRef, useState } from "react";
import type { EditorBlock, BlockSaveState } from "../features/editor/ui/types";
import { contentApi, editorBlocks, type DocumentView } from "./content";
import { ApiError, errorMessage, operationKey } from "./transport";

import {
  readDraft,
  storeDraft,
  type PendingEdit as Pending,
} from "./draftRecovery";
import { useWorkspace } from "../app/ui/WorkspaceContext";

export function usePageEditor(document: DocumentView) {
  const { member } = useWorkspace();
  const journalKey = `slate:draft:${member.workspaceId}:${member.id}:${document.page.id}`;
  const restored = useRef(document.permissions.canEdit ? readDraft(journalKey) : null);
  const [blocks, setBlocks] = useState(() => {
    const saved = editorBlocks(document.blocks);
    const dirty = new Map(
      (restored.current?.blocks ?? []).map((block) => [block.id, block]),
    );
    return saved
      .map((block) => dirty.get(block.id) ?? block)
      .concat(
        [...dirty.values()].filter(
          (block) => !saved.some((item) => item.id === block.id),
        ),
      );
  });
  const [saveState, setSaveState] = useState<Record<string, BlockSaveState>>(
    Object.fromEntries(
      (restored.current?.edits ?? []).map(([id]) => [
        id,
        {
          status: "failed",
          message:
            "An unsaved edit was recovered in this tab. Retry its save or compare it with the current page.",
        } as BlockSaveState,
      ]),
    ),
  );
  // Mutable page CAS may advance without creating a content snapshot (sharing, status).
  const [revision, setRevision] = useState(document.page.revisionId);
  const [workingRevisionId, setWorkingRevisionId] = useState(document.workingRevisionId);
  const [firstBlockDirty,setFirstBlockDirty]=useState(false);
  const [structureState,setStructureState]=useState<"saving"|"saved"|null>(null);
  const current = useRef(blocks);
  const structureBusy=useRef(false);
  const revisions = useRef(
    new Map(document.blocks.map((block) => [block.id, block.revisionId])),
  );
  const pending = useRef(
    new Map<string, Pending>(restored.current?.edits ?? []),
  );
  const busy = useRef(new Set<string>());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const alive = useRef(true);
  const pageId = document.page.id;
  const canEdit=useRef(document.permissions.canEdit);
  canEdit.current=document.permissions.canEdit;
  useEffect(()=>{
    if (!document.permissions.canEdit) {
      timers.current.forEach(clearTimeout);
      timers.current.clear();
    }
  },[document.permissions.canEdit]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      timers.current.forEach(clearTimeout);
    };
  }, []);
  useEffect(() => {
    const prevent = (event: BeforeUnloadEvent) => {
      if (pending.current.size || busy.current.size) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, []);
  function persistDraft() {
    try {
      storeDraft(journalKey, pending.current, current.current);
    } catch {
      for (const id of pending.current.keys())
        status(id, {
          status: "failed",
          message:
            "This browser could not preserve a recovery copy. Keep this tab open until the server confirms your save.",
        });
    }
  }
  function status(id: string, value: BlockSaveState) {
    if (alive.current) setSaveState((old) => ({ ...old, [id]: value }));
  }
  async function save(id: string, propagate = false) {
    if (!alive.current || !canEdit.current || busy.current.has(id)) return;
    const edit = pending.current.get(id);
    if (!edit) return;
    busy.current.add(id);
    status(id, { status: "saving" });
    try {
      const receipt = await contentApi.block(
        pageId,
        edit.block,
        edit.revision,
        edit.key,
      );
      if (!receipt.value.blockRevisionId)
        throw new Error(
          "The server did not confirm the block revision. Your text remains here.",
        );
      revisions.current.set(id, receipt.value.blockRevisionId);
      if (alive.current) {
        setRevision(receipt.value.revisionId);
        setWorkingRevisionId(receipt.value.revisionId);
      }
      const latest = current.current.find((block) => block.id === id);
      pending.current.delete(id);
      if (latest && latest !== edit.block) {
        pending.current.set(id, {
          block: latest,
          key: operationKey(),
          revision: receipt.value.blockRevisionId,
        });
      } else
        status(id, {
          status: "saved",
          atLabel: new Date(receipt.receipt.committedAt).toLocaleTimeString(),
        });
    } catch (error) {
      status(
        id,
        error instanceof ApiError && error.status === 409
          ? {
              status: "conflict",
              conflict: {
                fromRevision: edit.revision,
                currentRevision: "changed",
                byMemberName: "Another editor",
                atLabel: "since your last save",
              },
            }
          : !navigator.onLine ? { status: "offline" } : { status: "failed", message: errorMessage(error) },
      );
      busy.current.delete(id);
      if (propagate) throw error;
      return;
    }
    persistDraft();
    busy.current.delete(id);
    if (pending.current.has(id) && alive.current) void save(id);
  }
  function change(id: string, block: EditorBlock) {
    if (!alive.current || !canEdit.current) return;
    setStructureState(null);
    const next = current.current.map((existing) =>
      existing.id === id ? block : existing,
    );
    current.current = next;
    setBlocks(next);
    clearTimeout(timers.current.get(id));
    // A dispatched operation keeps its original payload and key until reconciled.
    if (
      !busy.current.has(id) &&
      saveState[id]?.status !== "failed" &&
      saveState[id]?.status !== "offline" &&
      saveState[id]?.status !== "conflict"
    )
      pending.current.set(id, {
        block,
        key: operationKey(),
        revision: revisions.current.get(id)!,
      });
    persistDraft();
    if (
      saveState[id]?.status !== "conflict" &&
      saveState[id]?.status !== "failed" &&
      saveState[id]?.status !== "offline"
    ) {
      status(id, { status: "idle" });
      timers.current.set(
        id,
        setTimeout(() => void save(id), 650),
      );
    }
  }
  async function structure(next: EditorBlock[]) {
    if (!alive.current || !canEdit.current) throw new Error("This page is read-only with your current access.");
    if (structureBusy.current || busy.current.size || pending.current.size)
      throw new Error(
        "Save or resolve your current edits before changing the page structure.",
      );
    structureBusy.current=true;
    setStructureState("saving");
    try {
    await contentApi.structure(pageId, revision, next);
    const fresh = await contentApi.document(pageId);
    const loaded = editorBlocks(fresh.blocks);
    current.current = loaded;
    setBlocks(loaded);
    setRevision(fresh.page.revisionId);
    setWorkingRevisionId(fresh.workingRevisionId);
    revisions.current = new Map(
      fresh.blocks.map((block) => [block.id, block.revisionId]),
    );
    setStructureState("saved");
    } catch(error) {setStructureState(null);throw error;} finally {structureBusy.current=false;}
  }
  async function resolve(id: string, keepMine: boolean) {
    if (!alive.current || !canEdit.current) throw new Error("This page is read-only with your current access.");
    const fresh = await contentApi.document(pageId);
    const saved = fresh.blocks.find((block) => block.id === id);
    if (!saved)
      throw new Error(
        "This block was removed. Copy your text before reloading the page.",
      );
    revisions.current.set(id, saved.revisionId);
    setRevision(fresh.page.revisionId);
    setWorkingRevisionId(fresh.workingRevisionId);
    if (keepMine) {
      const block = current.current.find((item) => item.id === id)!;
      pending.current.set(id, {
        block,
        key: operationKey(),
        revision: saved.revisionId,
      });
      await save(id, true);
    } else {
      pending.current.delete(id);
      const restored = editorBlocks(fresh.blocks).find(
        (block) => block.id === id,
      )!;
      const next = current.current.map((block) =>
        block.id === id ? restored : block,
      );
      current.current = next;
      setBlocks(next);
      status(id, { status: "idle" });
      persistDraft();
    }
  }
  function receive(fresh: DocumentView) {
    if(!alive.current || fresh.page.id!==pageId || structureBusy.current)return;
    const loaded = editorBlocks(fresh.blocks);
    const byId = new Map(current.current.map((block) => [block.id, block]));
    const next = loaded.map((block) =>
      pending.current.has(block.id) || busy.current.has(block.id)
        ? (byId.get(block.id) ?? block)
        : block,
    );
    for (const block of current.current)
      if (
        !loaded.some((item) => item.id === block.id) &&
        pending.current.has(block.id)
      ) {
        next.push(block);
        status(block.id, {
          status: "failed",
          message:
            "This block was removed elsewhere. Your unsaved content remains here; copy it before reloading.",
        });
      }
    for (const block of fresh.blocks)
      if (!pending.current.has(block.id) && !busy.current.has(block.id))
        revisions.current.set(block.id, block.revisionId);
    if (JSON.stringify(next) !== JSON.stringify(current.current)) {
      current.current = next;
      setBlocks(next);
    }
    setRevision(fresh.page.revisionId);
    setWorkingRevisionId(fresh.workingRevisionId);
  }
  return {
    receive,
    blocks,
    saveState,
    revision,
    workingRevisionId,
    structureState,
    setFirstBlockDirty,
    hasUnsavedChanges: firstBlockDirty || structureState === "saving" || pending.current.size > 0 || busy.current.size > 0,
    setRevision,
    change,
    structure,
    retry: save,
    resolve,
  };
}
