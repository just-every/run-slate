import {typedInline} from "../typedFormatting";
import {MentionPicker} from "./MentionPicker";
import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ElementType,
  type FormEvent,
} from "react";
import { EditableToolbar } from "./EditableToolbar";
import { cn } from "../../../../ui";
import type { EditableProps } from "./Editable";
import type {RichText} from '../types';
import {sliceRichText} from '../sliceRichText';
import { readRichText } from "./readRichText";
import {
  readEditableSelection,
  restoreEditableSelection,
  type EditableSelection,
} from "./editableSelection";
import { insertEditableLineBreak } from "./insertEditableLineBreak";

/** Own the browser-mutated subtree as one escaped markup boundary. */
export function EditableElement({
  value,
  html,
  placeholder,
  canEdit,
  onChange,
  label,
  className,
  multiline = true,
  as,
}: EditableProps & { html: string }) {
  // A fresh object on an unrelated render would reset an in-progress IME edit.
  const markup = useMemo(() => ({ __html: html }), [html]);
  const root = useRef<HTMLElement>(null);
  const [mention,setMention] = useState<{start:number;before:RichText;after:RichText}|null>(null);
  const inlineUndo = useRef<typeof value | null>(null);
  const pendingSelection = useRef<EditableSelection | null>(null);
  const publish = (element: HTMLElement) => {
    pendingSelection.current = readEditableSelection(element);
    const next = readRichText(element, value);
    const formatted = typedInline(next);
    inlineUndo.current = formatted ? next : null;
    if(formatted) pendingSelection.current = {anchor: formatted.map(s=>s.text).join("").length,focus:formatted.map(s=>s.text).join("").length};
    onChange(formatted ?? next);
  };
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    if (mention && (!canEdit || value.length === 0)) setMention(null);
    if (pendingSelection.current)
      restoreEditableSelection(element, pendingSelection.current);
    pendingSelection.current = null;
    const beforeInput = (event: InputEvent) => {
      if (
        !canEdit ||
        event.isComposing ||
        !["insertParagraph", "insertLineBreak"].includes(event.inputType)
      )
        return;
      event.preventDefault();
      if (!multiline) return;
      insertEditableLineBreak(element);
      publish(element);
    };
    element.addEventListener("beforeinput", beforeInput);
    return () => element.removeEventListener("beforeinput", beforeInput);
  });
  const Tag = (as ?? "div") as ElementType;
  return (
    <>
      <EditableToolbar
        root={root}
        value={value}
        onChange={onChange}
        canEdit={canEdit}
      />
      {mention && canEdit ? <MentionPicker onClose={()=>{setMention(null);root.current?.focus();}} onQueryChange={query=>{
        onChange([...mention.before,{text:'@'+query},...mention.after]);
      }} onSelect={span=>{
        pendingSelection.current={anchor:mention.start+span.text.length,focus:mention.start+span.text.length};onChange([...mention.before,span,...mention.after]);root.current?.focus();
      }}/> : null}
      <Tag
        ref={root}
        aria-label={label}
        aria-multiline={multiline}
        aria-readonly={canEdit ? undefined : true}
        className={cn(
          "min-h-[1.5em] w-full rounded-control break-words whitespace-pre-wrap outline-none",
          className,
        )}
        contentEditable={canEdit}
        dangerouslySetInnerHTML={markup}
        data-placeholder={placeholder}
        data-slate-editable=""
        onKeyDown={(event: React.KeyboardEvent<HTMLElement>) => {
          if(!canEdit || event.nativeEvent.isComposing) return;
          if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='z'&&inlineUndo.current){event.preventDefault();onChange(inlineUndo.current);inlineUndo.current=null;return;}
          if(!event.metaKey&&!event.ctrlKey&&!event.altKey&&(event.key==='@' || (event.key==='/'&&event.currentTarget.closest('[data-page-editor]')))){
            const selected=readEditableSelection(event.currentTarget);if(!selected)return;
            event.preventDefault();
            if(event.key==='@'){
              const start=Math.min(selected.anchor,selected.focus),end=Math.max(selected.anchor,selected.focus);
              const before=sliceRichText(value,0,start),after=sliceRichText(value,end);
              onChange([...before,{text:'@'},...after]);
              setMention({start,before,after});
            }
            else event.currentTarget.dispatchEvent(new CustomEvent('slate-insert-at-cursor',{bubbles:true,detail:selected}));
          }
        }}
        onInput={(event: FormEvent<HTMLElement>) => {
          if (!(event.nativeEvent as InputEvent).isComposing)
            publish(event.currentTarget);
        }}
        onCompositionEnd={(event: FormEvent<HTMLElement>) =>
          publish(event.currentTarget)
        }
        role="textbox"
        suppressContentEditableWarning
        tabIndex={0}
      />
    </>
  );
}
