import { useEffect, useState } from "react";
import {
  request,
  mutate,
  operationKey,
  errorMessage,
} from "../../../client/transport";
import { editorBlocks, type DocumentView } from "../../../client/content";
import { BlockView } from "../../editor/ui/blocks/BlockView";
import type { RunDocument } from "../../runs/ui/RunPanel";
import { RefineChanges } from "./RefineChanges";
export function RunChanges({
  run,
  reload,
}: {
  run: RunDocument;
  reload: () => void;
}) {
  const [pages, setPages] = useState<DocumentView[]>([]),
    [error, setError] = useState<unknown>(),
    [pending, setPending] = useState(false),
    [selected, setSelected] = useState<number[]>([]);
  const [modes, setModes] = useState<
    Record<number, "replace" | "insert-below">
  >({});
  const changes = run.output?.answer.proposedChanges ?? [];
  useEffect(() => {
    let active = true;
    setPages([]);
    setSelected([]);
    Promise.all(
      run.inputRefs
        .filter((ref) => (ref as { kind?: string }).kind === "page")
        .map((ref) =>
          request<DocumentView>(
            `/api/pages/${encodeURIComponent(ref.sourceId)}`,
          ),
        ),
    ).then(
      (value) => {
        if (active) setPages(value);
      },
      (cause) => {
        if (active) setError(cause);
      },
    );
    return () => {
      active = false;
    };
  }, [run.id, run.revisionId]);
  function target(index: number) {
    const change = changes[index];
    return pages.find(
      (page) =>
        page.page.id === change.targetId ||
        page.blocks.some((block) => block.id === change.targetId),
    );
  }
  async function accept() {
    setPending(true);
    setError(undefined);
    try {
      await mutate(`/api/runs/${encodeURIComponent(run.id)}/accept-changes`, {
        operationKey: operationKey(),
        expectedRevisionId: run.revisionId,
        selections: selected.map((index) => {
          const page = target(index)!;
          const block = page.blocks.find(
            (b) => b.id === changes[index].targetId,
          );
          return {
            index,
            pageId: page.page.id,
            expectedPageRevisionId: page.page.revisionId,
            mode: block ? (modes[index] ?? "replace") : "insert-below",
            ...(block ? { blockId: block.id } : {}),
          };
        }),
      });
      for (const pageId of new Set(
        selected.map((index) => target(index)!.page.id),
      ))
        window.dispatchEvent(
          new CustomEvent("slate:page-mutated", { detail: { pageId } }),
        );
      reload();
    } catch (cause) {
      setError(cause);
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="proposal-review">
      <h3>Suggested changes</h3>
      <p>Review the exact change before it reaches the page.</p>
      {changes.map((change, index) => {
        const page = target(index),
          block = page?.blocks.find((b) => b.id === change.targetId),
          ref = run.inputRefs.find((ref) => ref.sourceId === page?.page.id);
        const stale =
          !!page && ref?.sourceRevisionId !== page.workingRevisionId;
        return (
          <article className="finding" key={index}>
            <label>
              <input
                type="checkbox"
                checked={selected.includes(index)}
                disabled={!page?.permissions.canEdit || stale || pending}
                onChange={(event) =>
                  setSelected((previous) =>
                    event.target.checked
                      ? [...previous, index]
                      : previous.filter((item) => item !== index),
                  )
                }
              />
              {page?.page.title ?? "Checking the destination…"}
            </label>
            {stale ? (
              <p role="alert">
                This page changed after the suggestion was prepared. Ask again
                against its current revision.
              </p>
            ) : null}
            {block ? (
              <label>
                Placement
                <select
                  value={modes[index] ?? "replace"}
                  onChange={(event) =>
                    setModes((previous) => ({
                      ...previous,
                      [index]: event.target.value as "replace" | "insert-below",
                    }))
                  }
                  disabled={pending}
                >
                  <option value="replace">{run.selection ? "Replace selection" : "Replace this paragraph"}</option>
                  <option value="insert-below">
                    Insert below; keep original
                  </option>
                </select>
              </label>
            ) : null}
            <div className="proposal-diff">
              <section>
                <h4>Before</h4>
                {run.selection ? <p>{run.selection.text}</p> : block ? (
                  <BlockView
                    block={editorBlocks([block])[0]}
                    canEdit={false}
                    onChange={() => {}}
                  />
                ) : (
                  <p className="muted">Append a new paragraph.</p>
                )}
              </section>
              <section>
                <h4>After</h4>
                {block && modes[index] === "insert-below" ? (
                  <BlockView
                    block={editorBlocks([block])[0]}
                    canEdit={false}
                    onChange={() => {}}
                  />
                ) : null}
                <p>{change.text}</p>
              </section>
            </div>
          </article>
        );
      })}
      <button
        className="primary-button"
        disabled={pending || !selected.length}
        onClick={() => void accept()}
      >
        {pending
          ? "Applying…"
          : `Apply ${selected.length || ""} selected change${selected.length === 1 ? "" : "s"}`}
      </button>
      {run.pageId ? <RefineChanges run={run} /> : null}
      {error ? <p role="alert">{errorMessage(error)}</p> : null}
    </section>
  );
}
