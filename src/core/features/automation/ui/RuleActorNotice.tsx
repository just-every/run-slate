import { ShieldCheck } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage, cn } from "../../../ui";
import { containerNoun, memberNoun, plural, sentenceCase } from "./nouns";
import type { RuleActor } from "./types";

/** `AUTO-002` — what a rule may never do, whoever its actor is. */
const forbidden: readonly string[] = [
  "publish or unpublish a page",
  "change grants or external-access switches",
  "verify a page",
  "permanently delete anything",
  `manage ${plural(memberNoun)}`,
];

/**
 * `AUTO-002` — the rule acts as its actor, and never beyond it.
 *
 * Design decision: the standing limits are a list rather than a paragraph. A
 * reader deciding whether to trust a rule scans for the one thing they are
 * worried about; a paragraph makes them read all five.
 */
export interface RuleActorNoticeProps {
  actor: RuleActor;
  /** Given, the notice offers the way to change the actor. */
  onChangeActor?: () => void;
  className?: string;
}

export function RuleActorNotice({ actor, onChangeActor, className }: RuleActorNoticeProps) {
  return (
    <section
      aria-label="What this rule may do"
      className={cn("flex flex-col gap-2 rounded-card border border-line bg-surface p-3", className)}
    >
      <header className="flex items-center gap-2">
        <Avatar className="size-6">
          {actor.imageUrl ? <AvatarImage alt="" src={actor.imageUrl} /> : null}
          <AvatarFallback>{actor.name.slice(0, 1).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-col">
          <p className="text-ui font-medium text-ink">Runs as {actor.name}</p>
          <p className="text-tiny text-ink-muted">{actor.accessSummary}</p>
        </div>
        {onChangeActor ? (
          <button
            className="ml-auto rounded-control px-1 text-tiny text-accent hover:underline"
            onClick={onChangeActor}
            type="button"
          >
            Change
          </button>
        ) : null}
      </header>

      <p className="flex items-start gap-1.5 text-tiny text-ink-muted">
        <ShieldCheck aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-ink-faint" />
        <span>
          This rule performs only what {actor.name} could perform by hand. Every action is checked against this{" "}
          {memberNoun}&rsquo;s access at the moment it runs, and an action that would exceed it is skipped and logged
          rather than performed.
        </span>
      </p>

      <div>
        <h4 className="pb-1 text-micro font-medium tracking-wide text-ink-faint uppercase">
          What no rule can do
        </h4>
        <ul className="flex flex-col gap-0.5 text-tiny text-ink-muted">
          {forbidden.map((limit) => (
            <li className="flex items-start gap-1.5" key={limit}>
              <span aria-hidden="true" className="mt-1.5 size-1 shrink-0 rounded-full bg-ink-faint" />
              <span>{sentenceCase(limit)}</span>
            </li>
          ))}
        </ul>
        <p className="pt-1 text-tiny text-ink-faint">
          These hold in every {containerNoun}, under every scope, for every actor.
        </p>
      </div>
    </section>
  );
}
