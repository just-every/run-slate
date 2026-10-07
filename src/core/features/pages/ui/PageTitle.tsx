import { ImagePlus, MessageSquarePlus, Smile } from "lucide-react";
import { useId } from "react";
import { Button, cn } from "../../../ui";
import { pageTypefaceClass, type PageTypeface } from "./types";

/**
 * The page title. A textarea that grows with its content rather than a
 * `contentEditable` region, so it is labelled, keyboard reachable and reports
 * its own value. The row above it carries the affordances `PAGE-006` describes:
 * add an icon, add a cover — neither of which is required.
 */
export function PageTitle({
  title,
  onTitleChange,
  onCommit,
  canEdit = false,
  placeholder = "Untitled",
  typeface = "default",
  smallText = false,
  onAddIcon,
  onAddCover,
  onAddComment,
  className,
}: {
  title: string;
  onTitleChange?: (next: string) => void;
  /** Enter commits rather than inserting a line break. */
  onCommit?: () => void;
  canEdit?: boolean;
  placeholder?: string;
  typeface?: PageTypeface;
  smallText?: boolean;
  onAddIcon?: () => void;
  onAddCover?: () => void;
  onAddComment?: () => void;
  className?: string;
}) {
  const labelId = useId();
  const typeClass = cn(
    pageTypefaceClass[typeface],
    smallText ? "text-h1" : "text-title",
    "font-bold tracking-tight text-ink",
  );

  const affordances = [
    onAddIcon ? { key: "icon", label: "Add icon", icon: Smile, run: onAddIcon } : undefined,
    onAddCover ? { key: "cover", label: "Add cover", icon: ImagePlus, run: onAddCover } : undefined,
    onAddComment ? { key: "comment", label: "Add comment", icon: MessageSquarePlus, run: onAddComment } : undefined,
  ].flatMap((item) => (item ? [item] : []));

  return (
    <div className={cn("group/title", className)}>
      {canEdit && affordances.length > 0 ? (
        <div className="mb-1 flex h-7 items-center gap-1 opacity-0 transition-opacity group-hover/title:opacity-100 focus-within:opacity-100">
          {affordances.map((item) => (
            <Button key={item.key} onClick={item.run} size="sm" variant="ghost">
              <item.icon aria-hidden="true" className="size-3.5" />
              {item.label}
            </Button>
          ))}
        </div>
      ) : null}

      {canEdit ? (
        <h1 className="grid">
          <span aria-hidden="true" className={cn(typeClass, "col-start-1 row-start-1 invisible whitespace-pre-wrap break-words")}>
            {title.length > 0 ? title : placeholder}{" "}
          </span>
          <span className="sr-only" id={labelId}>
            Page title
          </span>
          <textarea
            aria-labelledby={labelId}
            className={cn(
              typeClass,
              "col-start-1 row-start-1 resize-none overflow-hidden bg-transparent outline-none placeholder:text-ink-faint focus-visible:outline-none",
            )}
            onChange={(event) => onTitleChange?.(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              onCommit?.();
            }}
            placeholder={placeholder}
            rows={1}
            spellCheck={false}
            value={title}
          />
        </h1>
      ) : (
        <h1 className={cn(typeClass, title.length > 0 ? "" : "text-ink-faint")}>
          {title.length > 0 ? title : placeholder}
        </h1>
      )}
    </div>
  );
}
