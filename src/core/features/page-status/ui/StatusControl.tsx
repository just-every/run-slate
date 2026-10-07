import { BadgeCheck, CircleDashed, Plus } from "lucide-react";
import { Button, cn, Input, Popover, PopoverContent, PopoverTrigger } from "../../../ui";
import { statusColourClass } from "./status-colours";
import { StatusColourPicker } from "./StatusColourPicker";
import { customStatusLabelLimit, type StatusColourKey, type StatusEntry, type StatusProfile } from "./types";

export interface StatusControlProps {
  statusProfile: StatusProfile;
  /** The whole workspace vocabulary; the profile decides what is offered. */
  entries: readonly StatusEntry[];
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `open-vocabulary` only — the custom entry being typed. */
  customLabel: string;
  onCustomLabelChange: (value: string) => void;
  customColour: StatusColourKey;
  onCustomColourChange: (colour: StatusColourKey) => void;
  onAddCustom: () => void;
}

/**
 * `STAT-005` — under `verification-only` only the entries that require verification are
 * offered, there is no colour picker and no custom-status field, and the control is
 * reached from the title's own hover row. Under `open-vocabulary` every entry is offered,
 * with a colour picker and a custom label of at most twenty characters.
 */
export function StatusControl(props: StatusControlProps) {
  const verificationOnly = props.statusProfile === "verification-only";
  const offered = props.entries.filter(
    (entry) => !entry.retired && (!verificationOnly || entry.requiresVerification),
  );
  const selected = props.entries.find((entry) => entry.key === props.selectedKey) ?? null;
  const trigger = (
    <PopoverTrigger asChild>
      <Button size="sm" variant={verificationOnly ? "ghost" : "secondary"}>
        {selected ? (
          <span aria-hidden="true" className={cn("size-2 rounded-full", statusColourClass[selected.colour])} />
        ) : (
          <CircleDashed aria-hidden="true" className="size-3.5" />
        )}
        {selected ? selected.label : "Status"}
      </Button>
    </PopoverTrigger>
  );

  return (
    <Popover onOpenChange={props.onOpenChange} open={props.open}>
      {verificationOnly ? (
        <div
          className="inline-flex items-center gap-0.5 rounded-control border border-line bg-surface p-0.5 shadow-[0_6px_18px_rgb(15_15_15/0.10)]"
          role="group"
          aria-label="Title actions"
        >
          {trigger}
        </div>
      ) : (
        trigger
      )}

      <PopoverContent className="w-64 p-0">
        <div className="flex flex-col gap-2 p-2">
          <p className="text-micro font-medium tracking-wide text-ink-faint uppercase">Set status</p>

          {verificationOnly ? (
            <p className="text-tiny text-ink-muted">
              This workspace offers the statuses that require verification. Setting one records you as its
              owner on the revision you have open.
            </p>
          ) : (
            <div className="flex items-center gap-1.5">
              <StatusColourPicker onChange={props.onCustomColourChange} value={props.customColour} />
              <Input
                aria-describedby="status-custom-hint"
                aria-label="Add a custom status"
                maxLength={customStatusLabelLimit}
                onChange={(event) => props.onCustomLabelChange(event.target.value)}
                placeholder="Add custom status"
                value={props.customLabel}
              />
              <Button
                aria-label="Add this custom status"
                disabled={props.customLabel.trim().length === 0}
                onClick={props.onAddCustom}
                size="icon"
                variant="ghost"
              >
                <Plus aria-hidden="true" className="size-4" />
              </Button>
            </div>
          )}

          {verificationOnly ? null : (
            <p className="text-tiny text-ink-faint" id="status-custom-hint">
              A custom status can be at most {customStatusLabelLimit} characters.{" "}
              {props.customLabel.length}/{customStatusLabelLimit} used.
            </p>
          )}
        </div>

        <div className="border-t border-line p-1">
          <p className="px-2 py-1 text-micro font-medium tracking-wide text-ink-faint uppercase">
            {verificationOnly ? "Requires verification" : "Suggested"}
          </p>
          <ul className="flex flex-col">
            {offered.map((entry) => (
              <li key={entry.key}>
                <button
                  aria-pressed={entry.key === props.selectedKey}
                  className="flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-left text-ui text-ink hover:bg-sidebar-hover"
                  onClick={() => props.onSelect(entry.key)}
                  type="button"
                >
                  <span aria-hidden="true" className={cn("size-2.5 rounded-full", statusColourClass[entry.colour])} />
                  {entry.label}
                  {entry.requiresVerification ? (
                    <BadgeCheck aria-hidden="true" className="ml-auto size-3.5 text-good" />
                  ) : null}
                  {entry.requiresVerification ? <span className="sr-only">Requires verification</span> : null}
                </button>
              </li>
            ))}
          </ul>
          {props.selectedKey ? (
            <Button className="mt-1 w-full justify-start" onClick={() => props.onSelect(null)} size="sm" variant="ghost">
              Clear status
            </Button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
