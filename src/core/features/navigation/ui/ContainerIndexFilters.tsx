import { useId } from "react";
import type { ContainerVisibility } from "../../../shared/knowledge/model";
import { Checkbox, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../ui";
import { nounPlural } from "./nouns";
import type { ContainerIndexFilterState } from "./types";

const visibilityOptions: { value: ContainerVisibility | "any"; label: string }[] = [
  { value: "any", label: "Any visibility" },
  { value: "default", label: "Default" },
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
  { value: "private", label: "Private" },
];

export interface ContainerIndexFiltersProps {
  filters: ContainerIndexFilterState;
  onFiltersChange: (filters: ContainerIndexFilterState) => void;
}

/** Membership, visibility and personal — the three filters over the index. */
export function ContainerIndexFilters({ filters, onFiltersChange }: ContainerIndexFiltersProps) {
  const membershipId = useId();
  const visibilityId = useId();
  const personalId = useId();
  const plural = nounPlural("container");

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-1.5">
        <Label htmlFor={membershipId}>Membership</Label>
        <Select
          onValueChange={(value) => onFiltersChange({ ...filters, membership: value as ContainerIndexFilterState["membership"] })}
          value={filters.membership}
        >
          <SelectTrigger aria-label="Filter by membership" id={membershipId}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{`All ${plural}`}</SelectItem>
            <SelectItem value="mine">{`${plural} I belong to`}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-1.5">
        <Label htmlFor={visibilityId}>Visibility</Label>
        <Select
          onValueChange={(value) => onFiltersChange({ ...filters, visibility: value as ContainerIndexFilterState["visibility"] })}
          value={filters.visibility}
        >
          <SelectTrigger aria-label="Filter by visibility" id={visibilityId}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {visibilityOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-1.5">
        <Checkbox
          checked={filters.includePersonal}
          id={personalId}
          onCheckedChange={(checked) => onFiltersChange({ ...filters, includePersonal: checked === true })}
        />
        <Label htmlFor={personalId}>{`Include personal ${plural}`}</Label>
      </div>
    </div>
  );
}
