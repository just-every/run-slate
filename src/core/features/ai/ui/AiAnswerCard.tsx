import { SearchX } from "lucide-react";
import { cn } from "../../../ui";
import { AiAnswerBoundaryNote } from "./AiAnswerBoundaryNote";
import { AiCitationList } from "./AiCitationList";
import type { AiChatMessage } from "./types";

/**
 * One generated answer, drawn the way the reference draws it: a bordered card
 * carrying the answer, its sources, and the caveat line at its foot with the
 * provider mark at the right. The same card is used in the chat panel and above
 * search results, because `AI-015` requires the answer above results to be the
 * same answer with the same citations and the same caveat — one component is the
 * cheapest way to keep that true.
 *
 * `AI-015`'s not-found answer is a different shape on purpose: no provider mark,
 * no citation footer, nothing that would let it read as a sourced answer.
 */
export function AiAnswerCard({
  message,
  onOpenRevision,
  providerLabel,
  scopeLabel,
  className,
}: {
  message: AiChatMessage;
  onOpenRevision: (citationId: string) => void;
  providerLabel?: string | null;
  scopeLabel?: string | null;
  className?: string;
}) {
  if (message.notFound) {
    return (
      <div className={cn("rounded-card border border-line bg-sidebar p-3", className)}>
        <p className="flex items-start gap-1.5 text-ui text-ink">
          <SearchX aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-ink-faint" />
          {message.text}
        </p>
        <AiAnswerBoundaryNote className="mt-2" scopeLabel={scopeLabel} />
      </div>
    );
  }

  const hasSources = (message.citations?.length ?? 0) > 0 || (message.unsourced?.length ?? 0) > 0;

  return (
    <article className={cn("overflow-hidden rounded-card border border-accent/30 bg-surface", className)}>
      <div className="px-3 pt-3">
        <h3 className="text-micro font-medium tracking-wide text-ink-faint uppercase">Answer</h3>
        <p className="mt-1 text-body whitespace-pre-wrap text-ink">{message.text}</p>
      </div>

      {hasSources ? (
        <div className="px-3 pt-3">
          <AiCitationList
            citations={message.citations ?? []}
            onOpenRevision={onOpenRevision}
            unsourced={message.unsourced}
          />
        </div>
      ) : null}

      <div className="mt-3 border-t border-line bg-sidebar px-3 py-2">
        <AiAnswerBoundaryNote providerLabel={providerLabel} scopeLabel={scopeLabel} />
      </div>
    </article>
  );
}
