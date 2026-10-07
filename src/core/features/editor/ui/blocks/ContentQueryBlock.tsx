import { FileText, Pencil, RefreshCw, TriangleAlert } from "lucide-react";
import {
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../../ui";
import { knowledgeNoun } from "../../../../shared/knowledge/vocabulary";
import type { BlockRenderProps, ContentQueryBlockData, ContentQueryDefinition } from "../types";

function capitalise(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

export function describeQuery(definition: ContentQueryDefinition): string {
  const parts = [
    definition.container ? `in ${knowledgeNoun("container")} ${definition.container}` : null,
    definition.ancestor ? `under ${definition.ancestor}` : null,
    definition.pageType ? `type ${definition.pageType}` : null,
    definition.status ? `status ${definition.status}` : null,
    definition.contributor ? `contributed to by ${definition.contributor}` : null,
    definition.dateRange ? definition.dateRange : null,
    definition.orderBy ? `ordered by ${definition.orderBy}` : null,
    definition.limit ? `first ${definition.limit}` : null,
  ].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? capitalise(parts.join(" · ")) : "Every page this reader may read";
}

/**
 * `BLOCK-010` — a live list of pages with its definition, when it last ran, and
 * the count it returned. A query whose source is gone says so rather than
 * rendering an empty list.
 */
export function ContentQueryBlock({ block, canEdit, actions }: BlockRenderProps<ContentQueryBlockData>) {
  const footer = `Ran ${block.lastRanLabel} · ${block.results.length} ${block.results.length === 1 ? "item" : "items"}`;

  return (
    <section aria-label="Content query" className="my-2 rounded-card border border-line">
      <header className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
        <p className="min-w-0 flex-1 truncate text-small text-ink-muted">{describeQuery(block.definition)}</p>
        {canEdit && actions?.onEditQueryDefinition ? (
          <Button onClick={() => actions.onEditQueryDefinition?.(block.id)} size="sm" variant="ghost">
            <Pencil aria-hidden="true" className="size-3.5" />
            Edit the query
          </Button>
        ) : null}
        {actions?.onRerunQuery ? (
          <Button onClick={() => actions.onRerunQuery?.(block.id)} size="sm" variant="ghost">
            <RefreshCw aria-hidden="true" className="size-3.5" />
            Run it again
          </Button>
        ) : null}
      </header>

      {block.sourceMissing ? (
        <p className="flex items-start gap-2 px-3 py-4 text-ui text-ink" role="status">
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warn" />
          {block.sourceMissing.message}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Type</TableHead>
                <TableHead scope="col">Title</TableHead>
                <TableHead scope="col">{capitalise(knowledgeNoun("container"))}</TableHead>
                <TableHead scope="col">Description</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {block.results.map((result) => (
                <TableRow key={result.id}>
                  <TableCell>
                    <span className="flex items-center gap-1.5 text-ink-muted">
                      <FileText aria-hidden="true" className="size-3.5" />
                      {result.typeLabel}
                    </span>
                  </TableCell>
                  <TableCell>
                    <button
                      className="text-left text-accent underline-offset-2 hover:underline"
                      onClick={() => actions?.onOpenQueryResult?.(result.id)}
                      type="button"
                    >
                      {result.title}
                    </button>
                  </TableCell>
                  <TableCell className="text-ink-muted">{result.containerLabel}</TableCell>
                  <TableCell className="max-w-80 truncate text-ink-muted">{result.description}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <footer className="flex items-center justify-end border-t border-line px-3 py-1.5 text-tiny text-ink-faint">
        {block.sourceMissing ? `Ran ${block.lastRanLabel}` : footer}
      </footer>
    </section>
  );
}
