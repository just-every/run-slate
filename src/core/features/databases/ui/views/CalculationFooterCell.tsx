import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "../../../../ui";
import type { CalculationKind, ColumnCalculation } from "../types";
import { calculationKinds, calculationLabel } from "../types";

/**
 * `DB-007` — the calculation under one table column, computed over the view's
 * filtered records. The result arrives already computed; this only shows it and
 * lets the member pick which calculation runs.
 */
export function CalculationFooterCell({
  fieldName,
  calculation,
  disabled,
  onChange,
}: {
  fieldName: string;
  calculation: ColumnCalculation | undefined;
  disabled: boolean;
  onChange: (kind: CalculationKind) => void;
}) {
  const kind = calculation?.kind ?? "none";
  const label = calculationLabel[kind];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={
          kind === "none" ? `Calculate a total for ${fieldName}` : `${label} for ${fieldName}: ${calculation?.display ?? ""}`
        }
        className="flex h-7 w-full items-center justify-end gap-1 rounded-control px-2 text-tiny text-ink-muted transition-colors hover:bg-sidebar-hover hover:text-ink disabled:opacity-50"
        disabled={disabled}
      >
        {kind === "none" ? (
          <span>Calculate</span>
        ) : (
          <>
            <span>{label}</span>
            <span className="font-medium text-ink">{calculation?.display}</span>
          </>
        )}
        <ChevronDown aria-hidden="true" className="size-3" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup onValueChange={(next) => onChange(next as CalculationKind)} value={kind}>
          {calculationKinds.map((candidate) => (
            <DropdownMenuRadioItem key={candidate} value={candidate}>
              {calculationLabel[candidate]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
