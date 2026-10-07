import { ChevronRight, Plus } from "lucide-react";
import { useId, type ReactNode } from "react";
import { Button, cn } from "../../../ui";

export interface SidebarSectionProps {
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Shown instead of the children when the section holds nothing. */
  emptyMessage: string;
  isEmpty: boolean;
  /** An optional add control in the section header, e.g. "Add a page". */
  action?: { label: string; onClick: () => void };
  children?: ReactNode;
  className?: string;
}

export function SidebarSection({
  title,
  open,
  onOpenChange,
  emptyMessage,
  isEmpty,
  action,
  children,
  className,
}: SidebarSectionProps) {
  const regionId = useId();

  return (
    <section aria-label={title} className={cn("flex flex-col", className)}>
      <div className="group flex items-center gap-0.5 pr-0.5">
        <button
          aria-controls={regionId}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-1 rounded-control px-1.5 py-1 text-left text-micro font-medium tracking-wide text-ink-faint uppercase hover:bg-sidebar-hover focus-visible:outline-2 focus-visible:outline-accent"
          onClick={() => onOpenChange(!open)}
          type="button"
        >
          <ChevronRight aria-hidden="true" className={cn("size-3 transition-transform", open && "rotate-90")} />
          <span className="truncate">{title}</span>
        </button>
        {action ? (
          <Button
            aria-label={action.label}
            className="opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 md:focus-visible:opacity-100"
            onClick={action.onClick}
            size="iconSm"
            variant="ghost"
          >
            <Plus aria-hidden="true" className="size-3.5" />
          </Button>
        ) : null}
      </div>

      <div className="flex flex-col" hidden={!open} id={regionId}>
        {isEmpty ? <p className="px-2 py-1 text-tiny text-ink-faint">{emptyMessage}</p> : children}
      </div>
    </section>
  );
}
