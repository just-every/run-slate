import { Badge, cn } from "../../../ui";
import { SearchKindGlyph, searchKindLabel } from "./kinds";
import { MatchedText, matchedPlainText } from "./MatchedText";
import type { SearchResultItem } from "./types";

/**
 * `SEARCH-002` — one ranked result: its kind, its matched text in context, and a
 * control that opens the record with the match highlighted. `SEARCH-009` — a
 * result the archived or trashed filter brought back says so in words.
 */
export function SearchResultRow({
  result,
  onOpen,
  className,
}: {
  result: SearchResultItem;
  onOpen: (resultId: string) => void;
  className?: string;
}) {
  const title = matchedPlainText(result.titleSegments);
  return (
    <article className={cn("flex gap-3 px-2 py-3", className)}>
      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-control bg-sidebar-hover">
        <SearchKindGlyph kind={result.kind} />
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="text-ui leading-6 font-medium">
          <button
            className="rounded-control text-left text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
            onClick={() => onOpen(result.id)}
            type="button"
          >
            <MatchedText segments={result.titleSegments} />
          </button>
        </h3>
        <SearchResultMeta result={result} />
        {result.contextSegments.length > 0 ? (
          <p className="mt-1 text-ui text-ink-muted">
            <span className="sr-only">{`Matched in ${title}: `}</span>
            <MatchedText segments={result.contextSegments} />
          </p>
        ) : null}
      </div>
    </article>
  );
}

/** The dot-separated line under a result title. */
export function SearchResultMeta({ result }: { result: SearchResultItem }) {
  const parts = [
    searchKindLabel(result.kind),
    result.containerName,
    result.contributor?.name ?? null,
    result.updatedLabel,
  ].filter((part): part is string => Boolean(part));

  return (
    <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-tiny text-ink-muted">
      {parts.map((part, index) => (
        <span className="flex items-center gap-1.5" key={`${part}-${index}`}>
          {index > 0 ? <span aria-hidden="true">·</span> : null}
          {part}
        </span>
      ))}
      {result.statusLabel ? <Badge tone="outline">{result.statusLabel}</Badge> : null}
      <SearchLifecycleBadge result={result} />
    </p>
  );
}

/** `SEARCH-009` — archived and trashed results are named as such, in words. */
export function SearchLifecycleBadge({ result }: { result: SearchResultItem }) {
  if (result.lifecycle === "live") return null;
  return (
    <Badge tone={result.lifecycle === "trashed" ? "danger" : "warn"}>
      {result.lifecycle === "trashed" ? "In trash" : "Archived"}
    </Badge>
  );
}

/**
 * The one-line form the dialog list uses. It renders content only: the dialog
 * wraps it in a `CommandItem`, which owns the keyboard behaviour.
 */
export function SearchResultLine({ result }: { result: SearchResultItem }) {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2">
      <SearchKindGlyph kind={result.kind} />
      <span className="min-w-0 truncate text-ui text-ink">
        <MatchedText segments={result.titleSegments} />
      </span>
      {result.containerName ? (
        <span className="hidden shrink-0 text-tiny text-ink-faint sm:inline">{`— ${result.containerName}`}</span>
      ) : null}
      {result.contextSegments.length > 0 ? (
        <span className="hidden min-w-0 flex-1 truncate text-tiny text-ink-muted md:inline">
          <MatchedText segments={result.contextSegments} />
        </span>
      ) : null}
      <span className="ml-auto flex shrink-0 items-center gap-1.5">
        <span className="text-tiny text-ink-faint">{searchKindLabel(result.kind)}</span>
        <SearchLifecycleBadge result={result} />
      </span>
    </span>
  );
}
