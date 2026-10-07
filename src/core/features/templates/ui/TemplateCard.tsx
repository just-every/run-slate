import { FileText } from "lucide-react";
import { Badge, Button, cn } from "../../../ui";
import { containerNoun } from "./nouns";
import type { TemplateSummary } from "./types";

/**
 * One template in the gallery: its mark, its title, the line saying what kind
 * of template it is and where it lives, and a thumbnail drawn from the outline
 * its author wrote. A template whose author wrote no outline shows no
 * thumbnail rather than an invented one.
 */
export function TemplateCard({
  template,
  onOpen,
  onUse,
  className,
}: {
  template: TemplateSummary;
  onOpen: (templateId: string) => void;
  onUse: (templateId: string) => void;
  className?: string;
}) {
  const home =
    template.home.kind === "workspace"
      ? "Workspace template"
      : `${template.home.containerName} ${containerNoun}`;

  return (
    <article
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-card border border-line bg-surface transition-colors hover:border-line-strong focus-within:border-line-strong",
        className,
      )}
    >
      <div className="flex items-start gap-2.5 p-3">
        <span
          aria-hidden="true"
          className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-control bg-sidebar text-ui"
        >
          {template.icon ?? <FileText className="size-3.5 text-ink-muted" />}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-ui leading-tight font-medium text-ink">
            <button
              className="text-left after:absolute after:inset-0 after:content-[''] focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
              onClick={() => onOpen(template.id)}
              type="button"
            >
              {template.title}
            </button>
          </h2>
          <p className="mt-0.5 truncate text-tiny text-ink-muted">
            {template.categoryLabel} · {home}
          </p>
        </div>
        {template.origin === "shipped" ? (
          <Badge className="relative shrink-0" tone="outline">
            Shipped
          </Badge>
        ) : null}
      </div>

      {template.outline.length > 0 ? (
        <div
          aria-hidden="true"
          className="mx-3 h-24 overflow-hidden rounded-t-control border-x border-t border-line bg-canvas px-3 pt-2.5"
        >
          <ul className="flex flex-col gap-1.5">
            {template.outline.slice(0, 6).map((line, index) => (
              <li
                className={cn("truncate text-micro text-ink-faint", index === 0 && "font-medium text-ink-muted")}
                key={line}
              >
                {line}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="relative mt-auto flex items-center justify-between gap-2 px-3 py-2">
        <span className="text-tiny text-ink-faint">
          {template.childPageCount > 0
            ? `${template.childPageCount} child ${template.childPageCount === 1 ? "page" : "pages"}`
            : "No child pages"}
        </span>
        <Button onClick={() => onUse(template.id)} size="sm" variant="secondary">
          Use
          <span className="sr-only"> {template.title}</span>
        </Button>
      </div>
    </article>
  );
}
