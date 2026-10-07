import { Eye } from "lucide-react";
import { knowledgeNoun } from "../../../shared/knowledge/vocabulary";
import { cn } from "../../../ui";

/**
 * `AI-013` — the caveat that rides under every generated answer, summary, chat
 * reply and agent output. The reference puts this line at the foot of the answer
 * card in small muted type beside the provider mark; we keep the same place and
 * the same weight, because the claim it makes is load-bearing: the answer was
 * produced from what this reader may read, at the moment it was produced.
 *
 * It is one sentence and it never moves. A surface that can produce an answer
 * renders this; there is no variant that omits it.
 */
export function AiAnswerBoundaryNote({
  /** Where the run drew from, when the surface knows it: a page, a container, the workspace. */
  scopeLabel,
  /** The provider mark the reference shows at the right of the caveat row. */
  providerLabel,
  className,
}: {
  scopeLabel?: string | null;
  providerLabel?: string | null;
  className?: string;
}) {
  return (
    <p className={cn("flex flex-wrap items-center gap-x-1.5 gap-y-1 text-tiny text-ink-faint", className)}>
      <Eye aria-hidden="true" className="size-3.5 shrink-0" />
      <span>
        Produced only from what you may read{scopeLabel ? ` in ${scopeLabel}` : ""}, as at the moment it was produced. A
        page whose access was removed, or that was archived, trashed or left as another {knowledgeNoun("member")}&apos;s
        draft, is not in it.
      </span>
      {providerLabel ? <span className="ml-auto shrink-0 text-ink-faint">{providerLabel}</span> : null}
    </p>
  );
}
