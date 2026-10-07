import { ExternalLink, Link as LinkIcon, TriangleAlert } from "lucide-react";
import { Button, cn } from "../../../../ui";
import type { BlockRenderProps, LinkCardBlockData, LinkCardDisplay } from "../types";

const displayOptions: { value: LinkCardDisplay; label: string }[] = [
  { value: "plain", label: "Plain link" },
  { value: "inline", label: "Inline card" },
  { value: "card", label: "Block card" },
];

function PlainLink({ url }: { url: string }) {
  return (
    <a className="text-body break-all text-accent underline underline-offset-2" href={url} rel="noreferrer" target="_blank">
      {url}
    </a>
  );
}

function DisplaySwitch({ block, onChange }: { block: LinkCardBlockData; onChange: (next: LinkCardBlockData) => void }) {
  return (
    <div aria-label="How this link is shown" className="flex items-center gap-1" role="group">
      {displayOptions.map((option) => (
        <Button
          aria-pressed={block.display === option.value}
          className={cn(block.display === option.value ? "bg-sidebar-hover text-ink" : "")}
          key={option.value}
          onClick={() => onChange({ ...block, display: option.value })}
          size="sm"
          variant="ghost"
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}

/**
 * `BLOCK-009` — a pasted URL as a plain link, an inline card or a block card.
 * A refused or failed preview leaves the plain link and says why; the URL is
 * stored exactly as pasted either way.
 */
export function LinkCardBlock({ block, canEdit, onChange, actions }: BlockRenderProps<LinkCardBlockData>) {
  const failed = block.previewState === "refused" || block.previewState === "failed";
  const preview = block.preview;

  return (
    <div className="my-2 flex flex-col gap-2">
      {failed || !preview || block.display === "plain" ? (
        <PlainLink url={block.url} />
      ) : block.display === "inline" ? (
        <a
          className="inline-flex max-w-full items-center gap-1.5 rounded-control border border-line px-1.5 py-0.5 align-middle text-body text-ink hover:bg-sidebar-hover"
          href={block.url}
          rel="noreferrer"
          target="_blank"
        >
          <LinkIcon aria-hidden="true" className="size-3.5 shrink-0 text-ink-muted" />
          <span className="truncate">{preview.title}</span>
        </a>
      ) : (
        <a
          className="flex items-start gap-3 rounded-card border border-line bg-surface p-3 transition-colors hover:bg-sidebar-hover"
          href={block.url}
          rel="noreferrer"
          target="_blank"
        >
          <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-control bg-sidebar-hover text-micro font-medium text-ink-muted">
            {preview.iconLabel ?? <ExternalLink aria-hidden="true" className="size-3.5" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-ui font-medium text-ink">{preview.title}</span>
            {preview.description ? (
              <span className="mt-0.5 block line-clamp-2 text-small text-ink-muted">{preview.description}</span>
            ) : null}
            <span className="mt-1 block truncate text-tiny text-ink-faint">{preview.siteName ?? block.url}</span>
          </span>
        </a>
      )}

      {failed ? (
        <p className="flex flex-wrap items-center gap-2 text-small text-ink-muted" role="status">
          <TriangleAlert aria-hidden="true" className="size-3.5 text-warn" />
          {block.previewMessage ??
            (block.previewState === "refused"
              ? "A preview was refused for this address, so the link is shown as written."
              : "A preview could not be fetched, so the link is shown as written.")}
          {actions?.onRetryPreview ? (
            <Button onClick={() => actions.onRetryPreview?.(block.id)} size="sm" variant="secondary">
              Try the preview again
            </Button>
          ) : null}
        </p>
      ) : null}

      {canEdit ? <DisplaySwitch block={block} onChange={onChange} /> : null}
    </div>
  );
}
