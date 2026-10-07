import { Snowflake } from "lucide-react";
import { knowledgeNoun } from "../../../../shared/knowledge/vocabulary";
import { cn, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../../../../ui";

const HEADLINE = "Not being recomputed";

function markerName(fieldName?: string): string {
  return fieldName ? `${fieldName}: ${HEADLINE.toLowerCase()}` : HEADLINE;
}

/**
 * `DB-002` — the mark a rollup or formula cell carries. A glyph plus an
 * accessible name and a tooltip, so the state never depends on colour.
 */
export function NotRecomputedMarker({ fieldName, className }: { fieldName?: string; className?: string }) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            aria-label={markerName(fieldName)}
            className={cn(
              "inline-flex size-4 shrink-0 items-center justify-center rounded-control text-ink-faint",
              className,
            )}
            role="img"
            tabIndex={0}
          >
            <Snowflake aria-hidden="true" className="size-3.5" />
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-56">
          {HEADLINE}. The stored value is shown, not a current one.
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * `DB-002` — the block form, for the record detail and the field editor. It
 * says in plain words that the field is not evaluated here, and shows the
 * stored configuration and the value's origin only when they were passed.
 */
export function NotRecomputedNote({
  fieldName,
  expression,
  valueFrom,
  className,
}: {
  fieldName?: string;
  /** The stored configuration, exactly as the field carries it. */
  expression?: string | null;
  /** Where and when the carried value was produced. */
  valueFrom?: string | null;
  className?: string;
}) {
  return (
    <div
      className={cn("rounded-card border border-line bg-sidebar p-3 text-tiny text-ink-muted", className)}
      role="note"
    >
      <p className="flex items-center gap-1.5 font-medium text-ink">
        <Snowflake aria-hidden="true" className="size-3.5 shrink-0" />
        <span>
          {fieldName ? `${fieldName} is not being recomputed` : HEADLINE}
        </span>
      </p>
      <p className="mt-1.5">
        {`The value shown is the one stored with this ${knowledgeNoun("record")}. It is not calculated here and is not presented as current.`}
      </p>
      {expression ? (
        <dl className="mt-2 grid gap-0.5">
          <dt className="text-ink-faint">Stored configuration</dt>
          <dd className="font-mono break-words text-ink">{expression}</dd>
        </dl>
      ) : null}
      {valueFrom ? (
        <dl className="mt-2 grid gap-0.5">
          <dt className="text-ink-faint">Value carried from</dt>
          <dd className="text-ink">{valueFrom}</dd>
        </dl>
      ) : null}
    </div>
  );
}
