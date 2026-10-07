import { ArrowUpDown, Group, ListFilter, Search, Settings2, X } from "lucide-react";
import { useId, useState } from "react";
import { Button, Input, Tooltip, TooltipContent, TooltipTrigger, cn } from "../../../ui";
import type { DatabaseView } from "./types";

function ControlButton({
  label,
  count,
  active,
  onClick,
  children,
}: {
  label: string;
  count?: number;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const accessibleName = count ? `${label} — ${count} in force` : label;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label={accessibleName}
          className={cn(active ? "bg-accent-soft text-accent" : "")}
          onClick={onClick}
          size={count ? "sm" : "iconSm"}
          variant="ghost"
        >
          {children}
          {count ? <span className="text-tiny font-medium">{count}</span> : null}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{accessibleName}</TooltipContent>
    </Tooltip>
  );
}

/**
 * The control cluster the view carries: filter, sort, group, search inside the
 * view and the way into view settings (`DB-003`, `DB-005`, `DB-006`).
 */
export function ViewControls({
  view,
  searchInView,
  onSearchInViewChange,
  onOpenFilter,
  onOpenSort,
  onOpenGroup,
  onOpenSettings,
  className,
}: {
  view: DatabaseView;
  searchInView: string;
  onSearchInViewChange: (next: string) => void;
  onOpenFilter: () => void;
  onOpenSort: () => void;
  onOpenGroup: () => void;
  onOpenSettings: () => void;
  className?: string;
}) {
  const [searchOpen, setSearchOpen] = useState(searchInView.length > 0);
  const searchId = useId();

  return (
    <div className={cn("flex items-center gap-0.5", className)}>
      <ControlButton
        active={view.filter.rules.length > 0}
        count={view.filter.rules.length || undefined}
        label="Filter"
        onClick={onOpenFilter}
      >
        <ListFilter aria-hidden="true" className="size-4" />
      </ControlButton>
      <ControlButton
        active={view.sorts.length > 0}
        count={view.sorts.length || undefined}
        label="Sort"
        onClick={onOpenSort}
      >
        <ArrowUpDown aria-hidden="true" className="size-4" />
      </ControlButton>
      <ControlButton active={view.groupFieldId !== null} label="Group" onClick={onOpenGroup}>
        <Group aria-hidden="true" className="size-4" />
      </ControlButton>

      {searchOpen ? (
        <div className="flex items-center gap-1">
          <label className="sr-only" htmlFor={searchId}>
            Search in this view
          </label>
          <Input
            autoComplete="off"
            className="h-7 w-40"
            id={searchId}
            onChange={(event) => onSearchInViewChange(event.target.value)}
            placeholder="Search in view"
            value={searchInView}
          />
          <Button
            aria-label="Close search in view"
            onClick={() => {
              onSearchInViewChange("");
              setSearchOpen(false);
            }}
            size="iconSm"
            variant="ghost"
          >
            <X aria-hidden="true" className="size-3.5" />
          </Button>
        </div>
      ) : (
        <ControlButton label="Search in this view" onClick={() => setSearchOpen(true)}>
          <Search aria-hidden="true" className="size-4" />
        </ControlButton>
      )}

      <ControlButton label="View settings" onClick={onOpenSettings}>
        <Settings2 aria-hidden="true" className="size-4" />
      </ControlButton>
    </div>
  );
}
