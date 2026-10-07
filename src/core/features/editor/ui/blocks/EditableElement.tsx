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
  const [mention,setMention] = useState<EditableSelection|null>(null);
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
      {mention ? <MentionPicker onClose={()=>setMention(null)} onSelect={span=>{
        const start=Math.min(mention.anchor,mention.focus),end=Math.max(mention.anchor,mention.focus);
        let offset=0;const before:typeof value=[],after:typeof value=[];
        for(const item of value){const to=offset+item.text.length;if(offset<start)before.push({...item,text:item.text.slice(0,Math.min(item.text.length,start-offset))});if(to>end)after.push({...item,text:item.text.slice(Math.max(0,end-offset))});offset=to;}
        pendingSelection.current={anchor:start+span.text.length,focus:start+span.text.length};onChange([...before,span,...after]);root.current?.focus();
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
            if(event.key==='@')setMention(selected);
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
