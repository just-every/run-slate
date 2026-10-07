import { Button, cn } from "../../../ui";
import { PublishedBody, publishedHeadings, type PublishedBlock } from "./PublishedBody";
import type { PublishedTheme } from "./types";

export interface PublishedPageViewProps {
  /**
   * `WEB-002`, `WEB-003` — the theme comes from the page's own public exposure
   * record. This view never reads the reader's member theme (`WORK-012`), so
   * the token set is stamped here rather than inherited from the document.
   */
  theme: PublishedTheme;
  title: string;
  /** An emoji the page carries, or nothing. */
  icon?: string | null;
  /** The byline the page itself shows — the only person named here (`WEB-003`). */
  byline?: { name: string; publishedAt: string } | null;
  blocks: readonly PublishedBlock[];
  /** A header control from the exposure record (`WEB-002`). */
  tableOfContents?: boolean;
  /** `WEB-002` — readers may take their own copy when the publisher allowed it. */
  onDuplicate?: () => void;
  className?: string;
}

export function PublishedPageView({
  theme,
  title,
  icon = null,
  byline = null,
  blocks,
  tableOfContents = false,
  onDuplicate,
  className,
}: PublishedPageViewProps) {
  const headings = tableOfContents ? publishedHeadings(blocks) : [];

  return (
    <div className={cn("min-h-screen bg-canvas", className)} data-theme={theme}>
      <article className="mx-auto flex max-w-reading flex-col gap-6 px-6 py-16">
        <header className="flex flex-col gap-3">
          {icon ? (
            <span aria-hidden="true" className="text-title leading-none">
              {icon}
            </span>
          ) : null}
          <h1 className="text-title font-bold text-ink">{title}</h1>
          {byline ? (
            <p className="text-tiny text-ink-muted">
              {byline.name} · {byline.publishedAt}
            </p>
          ) : null}
        </header>

        {headings.length > 0 ? (
          <nav aria-label="On this page" className="flex flex-col gap-1 border-l-2 border-line pl-3">
            {headings.map((heading) => (
              <a
                className={cn(
                  "text-ui text-ink-muted underline-offset-2 hover:text-ink hover:underline",
                  heading.level === 3 ? "pl-3" : null,
                )}
                href={`#${heading.id}`}
                key={heading.id}
              >
                {heading.text}
              </a>
            ))}
          </nav>
        ) : null}

        <PublishedBody blocks={blocks} />

        {onDuplicate ? (
          <footer className="pt-6">
            <Button onClick={onDuplicate} size="sm" variant="secondary">
              Duplicate this page
            </Button>
          </footer>
        ) : null}
      </article>
    </div>
  );
}
