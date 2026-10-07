import { CircleCheck, CircleDot, CircleSlash, Clock } from "lucide-react";
import { Badge, cn } from "../../../ui";
import { decisionStateLabel, type DecisionState } from "./types";

/**
 * `DEC-002` — Proposed, Accepted, Superseded.
 *
 * Design decision: each state carries its own glyph as well as its label, so the
 * state survives a monochrome print, a colour-blind reader and a screen reader
 * alike; the tone only reinforces what the words already say.
 *
 * `DEC-005`: an overdue decision stays Accepted. Overdue is therefore a second,
 * separate chip — it never replaces or recolours the state chip.
 */
const stateGlyph = {
  proposed: CircleDot,
  accepted: CircleCheck,
  superseded: CircleSlash,
} as const;

const stateTone = {
  proposed: "draft",
  accepted: "good",
  superseded: "neutral",
} as const;

export interface DecisionStateChipProps {
  state: DecisionState;
  /** `DEC-005`: renders an additional "Overdue" chip beside the state. */
  overdue?: boolean;
  /** Adds "terminal" to the accessible description of a superseded decision. */
  terminal?: boolean;
  className?: string;
}

export function DecisionStateChip({ state, overdue = false, terminal = false, className }: DecisionStateChipProps) {
  const Glyph = stateGlyph[state];
  const label = decisionStateLabel[state];
  const described =
    state === "superseded" && terminal ? `Decision state: ${label}, terminal` : `Decision state: ${label}`;

  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1", className)}>
      <Badge tone={stateTone[state]}>
        <Glyph aria-hidden="true" className="size-3" />
        <span className="sr-only">{described}</span>
        <span aria-hidden="true">{label}</span>
      </Badge>
      {overdue ? (
        <Badge tone="warn">
          <Clock aria-hidden="true" className="size-3" />
          Overdue
        </Badge>
      ) : null}
    </span>
  );
}
