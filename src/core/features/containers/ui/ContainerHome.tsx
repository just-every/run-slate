import { Plus, Search, Settings } from "lucide-react";
import type { ReactNode } from "react";
import {
  Badge,
  Button,
  DeniedState,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  type SurfaceState,
  cn,
} from "../../../ui";
import { containerNoun, memberNoun } from "./nouns";
import { containerVisibilityCopy, type ContainerContentItem, type ContainerIdentity } from "./types";

export interface ContainerHomeProps {
  state: SurfaceState;
  container: ContainerIdentity;
  /** The container's page tree, rendered by the tree feature and slotted in here. */
  pageTree: ReactNode;
  content: readonly ContainerContentItem[];
  /** SEARCH-006 — search scoped to this container from its own surface. */
  searchQuery: string;
  onSearchQueryChange: (next: string) => void;
  onSearch: () => void;
  onOpenPage: (pageId: string) => void;
  onCreatePage: () => void;
  onOpenSettings: () => void;
  errorDetail?: string;
  onRetry: () => void;
  /** Slot for the bulk bar, the personal notice or anything the surface hosts. */
  children?: ReactNode;
  className?: string;
}

/** The container's own surface: identity, tree, content and a scoped search entry. */
export function ContainerHome({
  state,
  container,
  pageTree,
  content,
  searchQuery,
  onSearchQueryChange,
  onSearch,
  onOpenPage,
  onCreatePage,
  onOpenSettings,
  errorDetail,
  onRetry,
  children,
  className,
}: ContainerHomeProps) {
  if (state === "denied") {
    return <DeniedState className={className} title={`You need access to open this ${containerNoun}`} />;
  }

  return (
    <div className={cn("min-h-screen bg-canvas", className)}>
      <header className="border-b border-line px-4 py-5 md:px-8 md:py-7">
        <div className="mx-auto flex max-w-wide flex-col gap-3">
          <div className="flex items-start gap-3">
            <span aria-hidden="true" className="text-h1 leading-none">
              {container.icon}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-h1 font-semibold text-ink">{container.name}</h1>
                {container.key ? <Badge tone="outline">{container.key}</Badge> : null}
              </div>
              <p className="mt-1 max-w-reading text-body text-ink-muted">{container.description}</p>
              <p className="mt-1 text-tiny text-ink-faint">
                {containerVisibilityCopy[container.visibility].label} ·{" "}
                {containerVisibilityCopy[container.visibility].description} · {container.memberCount}{" "}
                {container.memberCount === 1 ? memberNoun : `${memberNoun}s`}
              </p>
            </div>
            <div className="flex shrink-0 gap-1.5">
              <Button onClick={onCreatePage} size="sm">
                <Plus aria-hidden="true" className="size-3.5" />
                New page
              </Button>
              <Button aria-label={`Settings for ${container.name}`} onClick={onOpenSettings} size="icon" variant="ghost">
                <Settings aria-hidden="true" className="size-4" />
              </Button>
            </div>
          </div>

          <form
            className="flex gap-1.5"
            onSubmit={(event) => {
              event.preventDefault();
              onSearch();
            }}
            role="search"
          >
            <label className="sr-only" htmlFor="container-scoped-search">
              Search in {container.name}
            </label>
            <div className="relative flex-1">
              <Search aria-hidden="true" className="absolute top-2 left-2.5 size-4 text-ink-faint" />
              <Input
                className="pl-8"
                id="container-scoped-search"
                onChange={(event) => onSearchQueryChange(event.target.value)}
                placeholder={`Search in ${container.name}`}
                value={searchQuery}
              />
            </div>
            <Button type="submit" variant="secondary">
              Search
            </Button>
          </form>
          <p className="text-tiny text-ink-faint">
            Search here is scoped to {container.name}. Clear the scope on the results to search the whole workspace.
          </p>
        </div>
      </header>

      <div className="mx-auto flex max-w-wide flex-col gap-6 px-4 py-6 md:flex-row md:px-8">
        <aside aria-label={`Pages in ${container.name}`} className="shrink-0 md:w-sidebar">
          {pageTree}
        </aside>

        <main className="min-w-0 flex-1">
          {children}
          {state === "loading" ? <LoadingState rows={6} /> : null}
          {state === "error" ? (
            <ErrorState detail={errorDetail} onRetry={onRetry} title={`This ${containerNoun} could not be loaded`} />
          ) : null}
          {state === "empty" ? (
            <EmptyState
              action={<Button onClick={onCreatePage}>Create the first page</Button>}
              description={`Nothing has been written in this ${containerNoun} yet.`}
              title="No pages yet"
            />
          ) : null}
          {state === "ready" ? <ContentList content={content} onOpenPage={onOpenPage} /> : null}
        </main>
      </div>
    </div>
  );
}

function ContentList({
  content,
  onOpenPage,
}: {
  content: readonly ContainerContentItem[];
  onOpenPage: (pageId: string) => void;
}) {
  return (
    <section aria-label="Content" className="overflow-x-auto rounded-card border border-line">
      <ul className="min-w-[28rem] divide-y divide-line">
        {content.map((item) => (
          <li key={item.id}>
            <button
              className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-sidebar-hover"
              onClick={() => onOpenPage(item.id)}
              type="button"
            >
              <span aria-hidden="true">{item.icon}</span>
              <span className="min-w-0 flex-1 truncate text-ui text-ink">{item.title}</span>
              {item.statusLabel ? <Badge tone="outline">{item.statusLabel}</Badge> : null}
              <span className="hidden w-36 shrink-0 truncate text-tiny text-ink-muted sm:block">{item.ownerName}</span>
              <span className="w-28 shrink-0 text-right text-tiny text-ink-faint">{item.updatedAtLabel}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
