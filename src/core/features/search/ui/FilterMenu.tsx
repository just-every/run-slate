import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  cn,
} from "../../../ui";

export type FilterDensity = "chips" | "bar";

const triggerSize = { chips: "sm", bar: "md" } as const;

function triggerClass(density: FilterDensity): string {
  return cn("gap-1.5 font-normal", density === "chips" ? "rounded-full" : "");
}

/** The label + chosen-value pair inside a filter trigger. */
function TriggerLabel({ icon, label, value }: { icon?: ReactNode; label: string; value: string | null }) {
  return (
    <>
      {icon}
      <span className="text-ink-muted">{label}</span>
      {value ? <span className="font-medium text-ink">{value}</span> : null}
      <ChevronDown aria-hidden="true" className="size-3.5 text-ink-faint" />
    </>
  );
}

export interface FilterChoice {
  id: string;
  label: string;
}

/** A filter over many values at once — kind, container, contributor, status. */
export function MultiFilterMenu({
  label,
  heading,
  options,
  selectedIds,
  onChange,
  density,
  icon,
}: {
  label: string;
  heading: string;
  options: readonly FilterChoice[];
  selectedIds: readonly string[];
  onChange: (next: readonly string[]) => void;
  density: FilterDensity;
  icon?: ReactNode;
}) {
  const chosen = options.filter((option) => selectedIds.includes(option.id));
  const summary =
    chosen.length === 0 ? null : chosen.length === 1 ? (chosen[0]?.label ?? null) : `${chosen.length} chosen`;

  const toggle = (id: string) => {
    onChange(selectedIds.includes(id) ? selectedIds.filter((value) => value !== id) : [...selectedIds, id]);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className={triggerClass(density)} size={triggerSize[density]} variant="secondary">
          <TriggerLabel icon={icon} label={label} value={summary} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
        <DropdownMenuLabel>{heading}</DropdownMenuLabel>
        {options.map((option) => (
          <DropdownMenuCheckboxItem
            checked={selectedIds.includes(option.id)}
            key={option.id}
            onCheckedChange={() => toggle(option.id)}
            onSelect={(event) => event.preventDefault()}
          >
            {option.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** A filter over one value — the updated-date window. */
export function SingleFilterMenu({
  label,
  heading,
  options,
  selectedId,
  onChange,
  density,
  icon,
  clearLabel,
}: {
  label: string;
  heading: string;
  options: readonly FilterChoice[];
  selectedId: string | null;
  onChange: (next: string | null) => void;
  density: FilterDensity;
  icon?: ReactNode;
  clearLabel: string;
}) {
  const chosen = options.find((option) => option.id === selectedId) ?? null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className={triggerClass(density)} size={triggerSize[density]} variant="secondary">
          <TriggerLabel icon={icon} label={label} value={chosen?.label ?? null} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>{heading}</DropdownMenuLabel>
        <DropdownMenuRadioGroup onValueChange={(next) => onChange(next === "" ? null : next)} value={selectedId ?? ""}>
          <DropdownMenuRadioItem value="">{clearLabel}</DropdownMenuRadioItem>
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.id} value={option.id}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
