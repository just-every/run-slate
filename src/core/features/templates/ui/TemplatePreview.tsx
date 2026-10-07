import { FileText } from "lucide-react";
import { Badge, Button, Separator, cn } from "../../../ui";
import { containerNoun, pageBodyNoun, sentenceCase } from "./nouns";
import type { TemplateBlock, TemplateDetail } from "./types";

/**
 * `TMPL-002` — the page this template produces, shown before it is used: its
 * body, its properties and its child pages.
 *
 * A figure such as a team size or a duration appears only when the template's
 * author wrote one. When the author wrote none, this surface says so. It never
 * estimates one, never infers one from the body, and never draws a placeholder
 * figure in its place.
 */
export function TemplatePreview({
  template,
  onUse,
  className,
}: {
  template: TemplateDetail;
  onUse?: (templateId: string) => void;
  className?: string;
}) {
  const home =
    template.home.kind === "workspace"
      ? "Offered everywhere in this workspace"
      : `Offered first inside the ${template.home.containerName} ${containerNoun}`;

  return (
    <article className={cn("mx-auto flex w-full max-w-reading flex-col gap-5 px-6 py-8", className)}>
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={template.origin === "shipped" ? "outline" : "neutral"}>
            {template.origin === "shipped" ? "Shipped template" : "Custom template"}
          </Badge>
          <Badge tone="neutral">{template.categoryLabel}</Badge>
        </div>
        <div className="flex items-start gap-2.5">
          <span
            aria-hidden="true"
            className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-control bg-sidebar text-h3"
          >
            {template.icon ?? <FileText className="size-4 text-ink-muted" />}
          </span>
          <h1 className="text-h1 font-semibold tracking-tight text-ink">{template.title}</h1>
        </div>
        {template.description ? <p className="text-body text-ink-muted">{template.description}</p> : null}
        <p className="text-tiny text-ink-faint">
          Written by {template.authorName}. {home}.
        </p>
        {onUse ? (
          <div className="pt-1">
            <Button onClick={() => onUse(template.id)}>Use this template</Button>
          </div>
        ) : null}
      </header>

      <TemplateFigures figures={template.figures} />

      <Separator />

      <section className="flex flex-col gap-2">
        <h2 className="text-tiny font-medium tracking-wide text-ink-faint uppercase">Properties</h2>
        {template.properties.length === 0 ? (
          <p className="text-ui text-ink-muted">This template sets no properties.</p>
        ) : (
          <dl className="flex flex-col gap-1.5">
            {template.properties.map((property) => (
              <div className="flex flex-wrap gap-x-3 gap-y-0.5" key={property.id}>
                <dt className="w-40 shrink-0 text-ui text-ink-muted">{property.name}</dt>
                <dd className="text-ui text-ink">{property.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      <Separator />

      <section className="flex flex-col gap-2">
        <h2 className="text-tiny font-medium tracking-wide text-ink-faint uppercase">
          {sentenceCase(pageBodyNoun)}
        </h2>
        {template.body.length === 0 ? (
          <p className="text-ui text-ink-muted">This template produces an empty {pageBodyNoun}.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {template.body.map((block) => (
              <TemplateBlockLine block={block} key={block.id} />
            ))}
          </div>
        )}
      </section>

      <Separator />

      <section className="flex flex-col gap-2">
        <h2 className="text-tiny font-medium tracking-wide text-ink-faint uppercase">Child pages</h2>
        {template.children.length === 0 ? (
          <p className="text-ui text-ink-muted">This template creates no child pages.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {template.children.map((child) => (
              <li className="flex items-center gap-2 text-ui text-ink" key={child.id}>
                <span aria-hidden="true" className="w-4 text-center text-tiny">
                  {child.icon ?? "·"}
                </span>
                {child.title}
              </li>
            ))}
          </ul>
        )}
      </section>
    </article>
  );
}

/**
 * The figures the author wrote, or the plain statement that they wrote none.
 * There is deliberately no estimate and no placeholder here.
 */
function TemplateFigures({ figures }: { figures: TemplateDetail["figures"] }) {
  if (figures.length === 0) {
    return (
      <p className="rounded-card border border-line bg-sidebar px-3 py-2 text-ui text-ink-muted">
        This template&rsquo;s author wrote no team size and no duration. Slate shows neither, because it would
        have to guess.
      </p>
    );
  }

  return (
    <dl className="flex flex-wrap gap-2">
      {figures.map((figure) => (
        <div className="rounded-card border border-line bg-sidebar px-3 py-2" key={figure.id}>
          <dt className="text-micro tracking-wide text-ink-faint uppercase">{figure.label}</dt>
          <dd className="text-ui font-medium text-ink">{figure.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function TemplateBlockLine({ block }: { block: TemplateBlock }) {
  if (block.kind === "divider") return <hr className="border-line" />;
  if (block.kind === "heading") return <h3 className="text-h3 font-semibold text-ink">{block.text}</h3>;
  if (block.kind === "quote") {
    return (
      <blockquote className="border-l-2 border-line-strong pl-3 text-body text-ink-muted">{block.text}</blockquote>
    );
  }
  if (block.kind === "bullet") {
    return (
      <p className="flex gap-2 text-body text-ink">
        <span aria-hidden="true">&bull;</span>
        {block.text}
      </p>
    );
  }
  if (block.kind === "todo") {
    return (
      <p className="flex gap-2 text-body text-ink">
        <span aria-hidden="true" className="mt-1 size-3.5 shrink-0 rounded-[3px] border border-line-strong" />
        {block.text}
      </p>
    );
  }
  return <p className="text-body text-ink">{block.text}</p>;
}
