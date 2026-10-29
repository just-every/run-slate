import { useEffect, useRef, useState } from "react";
import { ShortcutReference } from "../../features/workspace-settings/ui/ShortcutReference";
export function KeyboardReference({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  useEffect(() => {
    const previous = document.activeElement;
    const selection = window.getSelection();
    const ranges = selection
      ? Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index).cloneRange())
      : [];
    const inputSelection = previous instanceof HTMLInputElement || previous instanceof HTMLTextAreaElement
      ? { start: previous.selectionStart, end: previous.selectionEnd, direction: previous.selectionDirection }
      : null;
    dialog.current?.showModal();
    return () => {
      if (previous instanceof HTMLElement) previous.focus({ preventScroll: true });
      if (inputSelection?.start !== null && inputSelection?.start !== undefined
          && (previous instanceof HTMLInputElement || previous instanceof HTMLTextAreaElement)) {
        previous.setSelectionRange(inputSelection.start, inputSelection.end, inputSelection.direction ?? undefined);
      } else if (ranges.length && selection) {
        selection.removeAllRanges();
        for (const range of ranges) selection.addRange(range);
      }
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="folio-dialog"
      aria-label="Keyboard shortcuts"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <button onClick={onClose}>Close shortcuts</button>
      <ShortcutReference
        query={query}
        onQueryChange={setQuery}
        openShortcut="Ctrl / or ⌘ /"
        groups={[
          {id:"typed",title:"Typed formatting",kind:"typed",entries:[
            {id:"insert",label:"Insert a block",keys:"/"},{id:"mention",label:"Mention a person, group, page or date",keys:"@"},
            {id:"heading",label:"Headings (then space)",keys:"# or ## or ###"},{id:"bullet",label:"Bulleted list (then space)",keys:"- or *"},
            {id:"number",label:"Numbered list (then space)",keys:"1."},{id:"quote",label:"Quote (then space)",keys:"> or \""},
            {id:"task",label:"Task (then space)",keys:"[] or [ ]"},{id:"divider",label:"Divider",keys:"---"},{id:"codeblock",label:"Code block",keys:"```"},
            {id:"typed-bold",label:"Bold",keys:"**text**"},{id:"typed-italic",label:"Italic",keys:"*text*"},{id:"typed-code",label:"Inline code",keys:"`text`"},
            {id:"undo-conversion",label:"Undo a formatting conversion, retaining typed text",keys:"Ctrl Z or ⌘ Z"}
          ]},
          {
            id: "navigation",
            title: "Navigation",
            kind: "keyboard",
            entries: [
              {
                id: "search",
                label: "Open workspace search",
                keys: "Ctrl K or ⌘ K",
              },
              {
                id: "help",
                label: "Show keyboard shortcuts",
                keys: "Ctrl / or ⌘ /",
              },
              {
                id: "close",
                label: "Close an open dialog or mobile navigation",
                keys: "Esc",
              },
            ],
          },
          {
            id: "editing",
            title: "Writing and suggestions",
            kind: "keyboard",
            entries: [
              { id: "paragraph", label: "Split a block or continue a task", keys: "Enter" },
              { id: "line-break", label: "Line break within a block", keys: "Shift Enter" },
              { id: "suggestion-move", label: "Move through insert or mention suggestions", keys: "↑ or ↓" },
              { id: "suggestion-choose", label: "Choose an insert or mention suggestion", keys: "Enter" },
              { id: "mention-choose", label: "Choose a mention suggestion", keys: "Tab" },
              { id: "suggestion-close", label: "Close insert or mention suggestions", keys: "Esc" },
            ],
          },
          {id:'tables',title:'Table cells',kind:'keyboard',entries:[{id:'table-add-row',label:'Add a row after this cell',keys:'Alt Shift ↓'},{id:'table-remove-row',label:'Remove this row',keys:'Alt Shift ↑'},{id:'table-add-column',label:'Add a column after this cell',keys:'Alt Shift →'},{id:'table-remove-column',label:'Remove this column',keys:'Alt Shift ←'}]},
          {
            id: "format",
            title: "Text selection",
            kind: "keyboard",
            entries: [
              { id: "bold", label: "Bold", keys: "Ctrl B or ⌘ B" },
              { id: "italic", label: "Italic", keys: "Ctrl I or ⌘ I" },
              { id: "underline", label: "Underline", keys: "Ctrl U or ⌘ U" },
            ],
          },
          {
            id: "present",
            title: "Presenting a page",
            kind: "keyboard",
            entries: [
              { id: "next", label: "Next section", keys: "→ or Page Down" },
              {
                id: "previous",
                label: "Previous section",
                keys: "← or Page Up",
              },
            ],
          },
        ]}
      />
    </dialog>
  );
}
