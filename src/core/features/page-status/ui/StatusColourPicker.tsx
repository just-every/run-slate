import { Check, ChevronDown } from "lucide-react";
import { cn, Popover, PopoverContent, PopoverTrigger } from "../../../ui";
import { statusColourClass, statusColourName } from "./status-colours";
import { statusColourKeys, type StatusColourKey } from "./types";

/**
 * The colour swatch dropdown `STAT-005` shows only under `open-vocabulary`. Each swatch
 * carries its colour name, so the choice never rests on colour alone.
 */
export function StatusColourPicker({
  value,
  onChange,
  label = "Status colour",
}: {
  value: StatusColourKey;
  onChange: (colour: StatusColourKey) => void;
  label?: string;
}) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label={`${label}: ${statusColourName[value]}`}
        className="inline-flex h-8 items-center gap-1 rounded-control border border-line-strong bg-surface px-1.5 text-ink transition-colors hover:bg-sidebar-hover"
      >
        <span aria-hidden="true" className={cn("size-3.5 rounded-full", statusColourClass[value])} />
        <ChevronDown aria-hidden="true" className="size-3.5 text-ink-faint" />
      </PopoverTrigger>
      <PopoverContent className="w-44">
        <ul className="flex flex-col">
          {statusColourKeys.map((colour) => (
            <li key={colour}>
              <button
                className="flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-left text-ui text-ink hover:bg-sidebar-hover"
                onClick={() => onChange(colour)}
                type="button"
              >
                <span aria-hidden="true" className={cn("size-3.5 rounded-full", statusColourClass[colour])} />
                {statusColourName[colour]}
                {colour === value ? <Check aria-hidden="true" className="ml-auto size-3.5" /> : null}
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
