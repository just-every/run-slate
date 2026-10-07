import { Fragment } from "react";

export type PublishedSpan =
  | { kind: "text"; text: string }
  | { kind: "link"; text: string; href: string }
  /**
   * `WEB-004` — a link to a page that is not itself published carries no
   * address, and renders as plain text rather than a link to a sign-in page.
   */
  | { kind: "page-link"; text: string; href: string | null };

export type PublishedBlock =
  | { id: string; kind: "heading"; level: 2 | 3; text: string }
  | { id: string; kind: "paragraph"; spans: readonly PublishedSpan[] }
  | { id: string; kind: "bulleted"; items: readonly (readonly PublishedSpan[])[] }
  | { id: string; kind: "quote"; text: string }
  | { id: string; kind: "divider" };

export function PublishedSpans({ spans }: { spans: readonly PublishedSpan[] }) {
  return (
    <>
      {spans.map((span, index) => (
        <Fragment key={index}>{renderSpan(span)}</Fragment>
      ))}
    </>
  );
}

function renderSpan(span: PublishedSpan) {
  if (span.kind === "text") return span.text;
  if (span.kind === "link") {
    return (
      <a className="text-accent underline underline-offset-2" href={span.href} rel="noreferrer">
        {span.text}
      </a>
    );
  }
  if (span.href === null) return <span>{span.text}</span>;
  return (
    <a className="text-accent underline underline-offset-2" href={span.href}>
      {span.text}
    </a>
  );
}

export function PublishedBody({ blocks }: { blocks: readonly PublishedBlock[] }) {
  return (
    <div className="flex flex-col gap-4 text-body text-ink">
      {blocks.map((block) => {
        switch (block.kind) {
          case "heading":
            return block.level === 2 ? (
              <h2 className="pt-2 text-h2 font-semibold text-ink" id={block.id} key={block.id}>
                {block.text}
              </h2>
            ) : (
              <h3 className="pt-1 text-h3 font-semibold text-ink" id={block.id} key={block.id}>
                {block.text}
              </h3>
            );
          case "paragraph":
            return (
              <p key={block.id}>
                <PublishedSpans spans={block.spans} />
              </p>
            );
          case "bulleted":
            return (
              <ul className="flex list-disc flex-col gap-1.5 pl-5" key={block.id}>
                {block.items.map((item, index) => (
                  <li key={index}>
                    <PublishedSpans spans={item} />
                  </li>
                ))}
              </ul>
            );
          case "quote":
            return (
              <blockquote className="border-l-2 border-line-strong pl-3 text-ink-muted" key={block.id}>
                {block.text}
              </blockquote>
            );
          case "divider":
            return <hr className="border-line" key={block.id} />;
        }
      })}
    </div>
  );
}

export function publishedHeadings(blocks: readonly PublishedBlock[]) {
  return blocks.filter((block): block is Extract<PublishedBlock, { kind: "heading" }> => block.kind === "heading");
}
