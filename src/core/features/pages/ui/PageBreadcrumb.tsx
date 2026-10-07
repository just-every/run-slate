import { MoreHorizontal } from "lucide-react";
import type { ReactNode } from "react";
import {
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../../ui";
import { PageIcon } from "./PageIcon";
import type { PageCrumb } from "./types";

/**
 * The trail over a page: its container, then its ancestors, then the page
 * itself. At narrow widths the middle collapses into one overflow control so
 * the container and the page are always readable (`NAV-006`).
 */
export function PageBreadcrumb({
  container,
  ancestors,
  page,
  onOpen,
  maxAncestors = 2,
  trailing,
  className,
}: {
  container: PageCrumb;
  ancestors: readonly PageCrumb[];
  page: PageCrumb;
  onOpen: (id: string) => void;
  /** Ancestors shown in full before the middle collapses. */
  maxAncestors?: number;
  /** Rendered after the page crumb — `STAT-005` puts the chip here. */
  trailing?: ReactNode;
  className?: string;
}) {
  const collapsed = ancestors.length > maxAncestors;
  const hidden = collapsed ? ancestors.slice(0, ancestors.length - maxAncestors) : [];
  const shown = collapsed ? ancestors.slice(ancestors.length - maxAncestors) : ancestors;

  return (
    <nav aria-label="Breadcrumb" className={cn("min-w-0", className)}>
      <ol className="flex min-w-0 items-center gap-0.5 text-ui text-ink-muted">
        <Crumb crumb={container} onOpen={onOpen} />
        {collapsed ? (
          <li className="flex items-center gap-0.5">
            <Divider />
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label={`Show ${hidden.length} more pages in this trail`}
                className="rounded-control px-1 py-0.5 text-ink-faint hover:bg-sidebar-hover hover:text-ink"
              >
                <MoreHorizontal aria-hidden="true" className="size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {hidden.map((crumb) => (
                  <DropdownMenuItem key={crumb.id} onSelect={() => onOpen(crumb.id)}>
                    <PageIcon fallback icon={crumb.icon ?? null} size="row" />
                    {crumb.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </li>
        ) : null}
        {shown.map((crumb) => (
          <li className="flex min-w-0 items-center gap-0.5" key={crumb.id}>
            <Divider />
            <CrumbButton crumb={crumb} onOpen={onOpen} />
          </li>
        ))}
        <li className="flex min-w-0 items-center gap-0.5">
          <Divider />
          <span
            aria-current="page"
            className="flex min-w-0 items-center gap-1.5 rounded-control px-1.5 py-0.5 font-medium text-ink"
          >
            <PageIcon icon={page.icon ?? null} size="row" />
            <span className="truncate">{page.label}</span>
          </span>
        </li>
        {trailing ? <li className="ml-1 flex shrink-0 items-center">{trailing}</li> : null}
      </ol>
    </nav>
  );
}

function Crumb({ crumb, onOpen }: { crumb: PageCrumb; onOpen: (id: string) => void }) {
  return (
    <li className="flex min-w-0 items-center">
      <CrumbButton crumb={crumb} onOpen={onOpen} />
    </li>
  );
}

function CrumbButton({ crumb, onOpen }: { crumb: PageCrumb; onOpen: (id: string) => void }) {
  return (
    <button
      className="flex min-w-0 max-w-[10rem] items-center gap-1.5 rounded-control px-1.5 py-0.5 hover:bg-sidebar-hover hover:text-ink sm:max-w-[14rem]"
      onClick={() => onOpen(crumb.id)}
      type="button"
    >
      <PageIcon icon={crumb.icon ?? null} size="row" />
      <span className="truncate">{crumb.label}</span>
    </button>
  );
}

function Divider() {
  return (
    <span aria-hidden="true" className="px-0.5 text-ink-faint">
      /
    </span>
  );
}
