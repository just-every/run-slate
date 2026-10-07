import { knowledgeNoun } from "../../../shared/knowledge/vocabulary";
import {
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  cn,
} from "../../../ui";
import {
  decisionStateLabel,
  decisionStates,
  sentenceCase,
  type DecisionFilterOption,
  type DecisionLogFilterValues,
  type DecisionState,
} from "./types";

/**
 * `DEC-004` — the six axes the decision log filters on.
 *
 * Design decision: every filter is a controlled value handed back to the caller
 * whole. This bar holds no state and filters no rows; the surface that owns the
 * query does both, so the same bar serves a client list and a server query
 * without behaving differently.
 */
export interface DecisionLogFiltersProps {
  filters: DecisionLogFilterValues;
  onFiltersChange: (filters: DecisionLogFilterValues) => void;
  containers: readonly DecisionFilterOption[];
  owners: readonly DecisionFilterOption[];
  className?: string;
}

export function DecisionLogFilters({
  filters,
  onFiltersChange,
  containers,
  owners,
  className,
}: DecisionLogFiltersProps) {
  const patch = (next: Partial<DecisionLogFilterValues>) => onFiltersChange({ ...filters, ...next });

  return (
    <div className={cn("flex flex-wrap items-end gap-3", className)}>
      <div className="flex flex-col gap-1">
        <Label htmlFor="decision-filter-state">State</Label>
        <Select
          onValueChange={(value) => patch({ state: value === "all" ? "all" : (value as DecisionState) })}
          value={filters.state}
        >
          <SelectTrigger className="w-40" id="decision-filter-state">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any state</SelectItem>
            {decisionStates.map((state) => (
              <SelectItem key={state} value={state}>
                {decisionStateLabel[state]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="decision-filter-container">{sentenceCase(knowledgeNoun("container"))}</Label>
        <Select onValueChange={(containerId) => patch({ containerId })} value={filters.containerId}>
          <SelectTrigger className="w-48" id="decision-filter-container">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any {knowledgeNoun("container")}</SelectItem>
            {containers.map((container) => (
              <SelectItem key={container.id} value={container.id}>
                {container.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="decision-filter-owner">Owner</Label>
        <Select onValueChange={(ownerId) => patch({ ownerId })} value={filters.ownerId}>
          <SelectTrigger className="w-48" id="decision-filter-owner">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any owner</SelectItem>
            {owners.map((owner) => (
              <SelectItem key={owner.id} value={owner.id}>
                {owner.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="decision-filter-decided">Decided on or after</Label>
        <Input
          className="w-44"
          id="decision-filter-decided"
          onChange={(event) => patch({ decidedFrom: event.target.value })}
          type="date"
          value={filters.decidedFrom}
        />
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="decision-filter-review">Review due before</Label>
        <Input
          className="w-44"
          id="decision-filter-review"
          onChange={(event) => patch({ reviewBefore: event.target.value })}
          type="date"
          value={filters.reviewBefore}
        />
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="decision-filter-citations">Citations</Label>
        <Select
          onValueChange={(value) => patch({ citations: value as DecisionLogFilterValues["citations"] })}
          value={filters.citations}
        >
          <SelectTrigger className="w-44" id="decision-filter-citations">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Current or not</SelectItem>
            <SelectItem value="current">All citations current</SelectItem>
            <SelectItem value="stale">Has a stale citation</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
