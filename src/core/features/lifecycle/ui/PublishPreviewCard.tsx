import { ChevronRight, Eye } from "lucide-react";
import { Fragment } from "react";
import type { PublishPreview } from "./types";

/**
 * The preview of what readers will see that `LIFE-003` requires before confirmation.
 * It shows the location the page will sit in, its title, who will be able to open it
 * and the opening of the body as a reader receives it.
 */
export function PublishPreviewCard({ preview }: { preview: PublishPreview }) {
  return (
    <section aria-labelledby="publish-preview-heading" className="rounded-card border border-line bg-canvas">
      <h3
        className="flex items-center gap-1.5 border-b border-line px-3 py-1.5 text-micro font-medium tracking-wide text-ink-faint uppercase"
        id="publish-preview-heading"
      >
        <Eye aria-hidden="true" className="size-3.5" />
        What readers will see
      </h3>
      <div className="flex flex-col gap-1.5 px-3 py-2.5">
        <p className="flex flex-wrap items-center gap-0.5 text-tiny text-ink-faint">
          {preview.breadcrumb.map((crumb, index) => (
            <Fragment key={crumb}>
              {index > 0 ? <ChevronRight aria-hidden="true" className="size-3" /> : null}
              <span>{crumb}</span>
            </Fragment>
          ))}
        </p>
        <p className="text-h3 font-semibold text-ink">{preview.title}</p>
        <p className="text-tiny text-ink-muted">{preview.audience}</p>
        <p className="line-clamp-3 text-ui text-ink-muted">{preview.excerpt}</p>
      </div>
    </section>
  );
}
