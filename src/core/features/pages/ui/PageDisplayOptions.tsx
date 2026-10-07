import { useId } from "react";
import { cn, Popover, PopoverContent, PopoverTrigger, Switch } from "../../../ui";
import type { ReactNode } from "react";
import { pageTypefaces, type PageDisplaySettings, type PageTypeface } from "./types";

/**
 * `PAGE-012` — a page's own typeface from a fixed set, plus small-text and
 * full-width toggles. These are stored on the page and are the same for every
 * reader, so nothing here is a personal preference.
 */
export function PageDisplayOptions({
  settings,
  canEdit = false,
  onTypefaceChange,
  onSmallTextChange,
  onFullWidthChange,
  trigger,
  defaultOpen = false,
  className,
}: {
  settings: PageDisplaySettings;
  canEdit?: boolean;
  onTypefaceChange: (typeface: PageTypeface) => void;
  onSmallTextChange: (next: boolean) => void;
  onFullWidthChange: (next: boolean) => void;
  trigger: ReactNode;
  /** Opens the popover on mount, for a surface that renders it already open. */
  defaultOpen?: boolean;
  className?: string;
}) {
  const groupId = useId();
  const smallTextId = useId();
  const fullWidthId = useId();

  return (
    <Popover defaultOpen={defaultOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="end" className={cn("w-64 p-2", className)}>
        <p className="px-1 pb-1 text-micro font-medium tracking-wide text-ink-faint uppercase" id={groupId}>
          Typeface
        </p>
        <div aria-labelledby={groupId} className="flex gap-1" role="radiogroup">
          {pageTypefaces.map((typeface) => {
            const selected = settings.typeface === typeface.id;
            return (
              <button
                aria-checked={selected}
                className={cn(
                  "flex flex-1 flex-col items-center gap-0.5 rounded-control border px-2 py-2 transition-colors",
                  selected ? "border-accent bg-accent-soft text-accent" : "border-line text-ink-muted hover:bg-sidebar-hover",
                )}
                disabled={!canEdit}
                key={typeface.id}
                onClick={() => onTypefaceChange(typeface.id)}
                role="radio"
                type="button"
              >
                <span aria-hidden="true" className={cn(typeface.className, "text-h3")}>
                  {typeface.sample}
                </span>
                <span className="text-micro">{typeface.label}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-2 flex flex-col gap-1">
          <SwitchRow
            checked={settings.smallText}
            disabled={!canEdit}
            id={smallTextId}
            label="Small text"
            onChange={onSmallTextChange}
          />
          <SwitchRow
            checked={settings.fullWidth}
            disabled={!canEdit}
            id={fullWidthId}
            label="Full width"
            onChange={onFullWidthChange}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

function SwitchRow({
  id,
  label,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-control px-1 py-1.5">
      <span className="text-ui text-ink" id={id}>
        {label}
      </span>
      <Switch aria-labelledby={id} checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  );
}
