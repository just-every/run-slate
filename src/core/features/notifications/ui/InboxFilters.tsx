import { SlidersHorizontal } from "lucide-react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../../ui";
import { inboxKindFilterLabel, notificationKinds, type InboxKindFilter } from "./types";

/**
 * `NOTIF-002` — the kind filter that sits in the inbox header.
 *
 * Design decision: one value at a time, as radio items. A member reaches for
 * this to answer "what did I miss about X", and a multi-select would make them
 * clear nine checkboxes to get there.
 */
export interface InboxFiltersProps {
  value: InboxKindFilter;
  onChange: (next: InboxKindFilter) => void;
  /** Controlled only where something else needs the menu open. */
  open?: boolean;
  onOpenChange?: (next: boolean) => void;
  className?: string;
}

export function InboxFilters({ value, onChange, open, onOpenChange, className }: InboxFiltersProps) {
  return (
    <DropdownMenu onOpenChange={onOpenChange} open={open}>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={`Filter by kind. Showing: ${inboxKindFilterLabel(value)}`}
          className={className}
          size="iconSm"
          variant="ghost"
        >
          <SlidersHorizontal aria-hidden="true" className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Show</DropdownMenuLabel>
        <DropdownMenuRadioGroup onValueChange={(next) => onChange(next as InboxKindFilter)} value={value}>
          <DropdownMenuRadioItem value="all">{inboxKindFilterLabel("all")}</DropdownMenuRadioItem>
          <DropdownMenuSeparator />
          {notificationKinds.map((kind) => (
            <DropdownMenuRadioItem key={kind} value={kind}>
              {inboxKindFilterLabel(kind)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
