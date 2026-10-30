import {sliceRichText} from '../sliceRichText';
import { useEffect, useRef, useState, type RefObject } from "react";
import { InlineToolbar } from "../InlineToolbar";
import { formatSelection } from "../formatSelection";
import type { InlineSpan, RichText, InlineMark } from "../types";
import {
  readEditableSelection,
  restoreEditableSelection,
  type EditableSelection,
} from "./editableSelection";
import { ActionDialog } from "../../../../app/ui/ActionDialog";
export function EditableToolbar({
  root,
  value,
  onChange,
  canEdit,
}: {
  root: RefObject<HTMLElement | null>;
  value: RichText;
  onChange: (value: RichText) => void;
  canEdit: boolean;
}) {
  const [selection, setSelection] = useState<EditableSelection | null>(null);
  const retained = useRef<EditableSelection | null>(null);
  const [link, setLink] = useState(false);
  const toolbar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const update = () => {
      if (!root.current) return;
      const next = readEditableSelection(root.current);
      if (next && next.anchor !== next.focus) {
        retained.current = next;
        setSelection(next);
      } else if (!toolbar.current?.contains(document.activeElement) && !link)
        setSelection(null);
    };
    document.addEventListener("selectionchange", update);
    return () => document.removeEventListener("selectionchange", update);
  }, [root, link]);
  function apply(update: (span: InlineSpan) => InlineSpan) {
    const selected = retained.current;
    if (!selected || !root.current) return;
    onChange(formatSelection(value, selected.anchor, selected.focus, update));
    root.current.focus();
    requestAnimationFrame(() => {
      if (root.current) restoreEditableSelection(root.current, selected);
    });
  }
  function toggle(mark: InlineMark) {
    apply((span) => ({
      ...span,
      marks: span.marks?.includes(mark)
        ? span.marks.filter((item) => item !== mark)
        : [...(span.marks ?? []), mark],
    }));
  }
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const key = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || !canEdit) return;
      const mark = ({ b: "bold", i: "italic", u: "underline" } as const)[
        event.key.toLowerCase() as "b"
      ];
      if (mark) {
        const selected = readEditableSelection(element);
        if (selected) {
          retained.current = selected;
          event.preventDefault();
          toggle(mark);
        }
      }
    };
    element.addEventListener("keydown", key);
    return () => element.removeEventListener("keydown", key);
  });
  if (!selection) return null;
  if (!canEdit) return root.current?.closest('[data-page-commentable="true"]') ? (
    <div ref={toolbar} className="inline-formatting" onMouseDown={event => event.preventDefault()}>
      <button type="button" className="secondary-button" onClick={() => root.current?.dispatchEvent(new CustomEvent('slate-comment-selection', {bubbles:true,detail:retained.current}))}>Comment</button>
    </div>
  ) : null;
  const selectedSpans=sliceRichText(value,Math.min(selection.anchor,selection.focus),Math.max(selection.anchor,selection.focus)).filter(span=>!span.mention);
  const activeMarks:InlineMark[]=(["bold","italic","underline","strikethrough","code"] as InlineMark[]).filter(mark=>selectedSpans.length>0&&selectedSpans.every(span=>span.marks?.includes(mark)));
  const colour=selectedSpans.length&&selectedSpans.every(span=>span.colour===selectedSpans[0].colour)?selectedSpans[0].colour??null:null;
  return (
    <>
      <div
        ref={toolbar}
        className="inline-formatting"
        onMouseDown={(event) => event.preventDefault()}
      >
        <InlineToolbar
          activeMarks={activeMarks}
          colour={colour}
          canEdit
          onToggleMark={toggle}
          onColour={(colour) =>
            apply((span) => ({ ...span, colour: colour ?? undefined }))
          }
          onLink={() => setLink(true)}
          onComment={() =>
            root.current?.dispatchEvent(
              new CustomEvent("slate-comment-selection", {
                bubbles: true,
                detail: retained.current,
              }),
            )
          }
          onAskAi={() =>
            root.current?.dispatchEvent(
              new CustomEvent("slate-ask-selection", {
                bubbles: true,
                detail: retained.current,
              }),
            )
          }
        />
      </div>
      {link ? (
        <ActionDialog
          title="Link selected text"
          action="Apply link"
          onClose={() => setLink(false)}
          onSubmit={async (form) => {
            const href = String(form.get("href"));
            const url = new URL(href, location.origin);
            if (!["http:", "https:", "mailto:"].includes(url.protocol))
              throw new Error("Use an https, http, or email link.");
            apply((span) => ({ ...span, link: { href: url.href } }));
          }}
        >
          <label>
            Link
            <input type="url" name="href" required placeholder="https://…" />
          </label>
        </ActionDialog>
      ) : null}
    </>
  );
}
