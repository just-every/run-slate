import { Search } from "lucide-react";
import { useId } from "react";
import {
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  cn,
  type SurfaceState,
} from "../../../ui";
import { TemplateCard } from "./TemplateCard";
import type { TemplateCategory, TemplateSummary } from "./types";

/** `TMPL-001` — the exact line a search with no match shows. */
export const noTemplateMatchMessage = "No templates match this search.";

export const allTemplateCategoriesId = "all";

export interface TemplateGalleryProps {
  state: SurfaceState;
  templates: readonly TemplateSummary[];
  categories: readonly TemplateCategory[];
  query: string;
  onQueryChange: (next: string) => void;
  /** A category id, or `allTemplateCategoriesId`. */
  categoryId: string;
  onCategoryChange: (next: string) => void;
  onOpen: (templateId: string) => void;
  onUse: (templateId: string) => void;
  onCreate?: () => void;
  onRetry?: () => void;
  errorDetail?: string;
  className?: string;
}

/**
 * `TMPL-001` — templates searched by title and description and filtered by
 * category. Searching and filtering belong to the caller; this surface renders
 * the list it is handed and states plainly when that list is empty.
 */
export function TemplateGallery({
  state,
  templates,
  categories,
  query,
  onQueryChange,
  categoryId,
  onCategoryChange,
  onOpen,
  onUse,
  onCreate,
  onRetry,
  errorDetail,
  className,
}: TemplateGalleryProps) {
  const searchId = useId();
  const searching = query.trim().length > 0;

  return (
    <section className={cn("mx-auto flex w-full max-w-wide flex-col gap-4 px-6 py-8", className)}>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-h2 font-semibold text-ink">Templates</h1>
        {onCreate ? (
          <button
            className="h-8 rounded-control bg-accent px-3 text-ui font-medium text-accent-ink hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
            onClick={onCreate}
            type="button"
          >
            New template
          </button>
        ) : null}
      </header>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-56 flex-1 flex-col gap-1">
          <label className="text-tiny font-medium text-ink-muted" htmlFor={searchId}>
            Search templates
          </label>
          <div className="relative">
            <Search aria-hidden="true" className="pointer-events-none absolute top-2 left-2.5 size-4 text-ink-faint" />
            <Input
              className="pl-8"
              id={searchId}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Title or description"
              type="search"
              value={query}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-tiny font-medium text-ink-muted" id={`${searchId}-category`}>
            Category
          </span>
          <Select onValueChange={onCategoryChange} value={categoryId}>
            <SelectTrigger aria-labelledby={`${searchId}-category`} className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={allTemplateCategoriesId}>Every category</SelectItem>
              {categories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <TemplateGalleryBody
        errorDetail={errorDetail}
        onCreate={onCreate}
        onOpen={onOpen}
        onRetry={onRetry}
        onUse={onUse}
        searching={searching}
        state={state}
        templates={templates}
      />
    </section>
  );
}

function TemplateGalleryBody({
  state,
  templates,
  searching,
  onOpen,
  onUse,
  onCreate,
  onRetry,
  errorDetail,
}: {
  state: SurfaceState;
  templates: readonly TemplateSummary[];
  searching: boolean;
  onOpen: (templateId: string) => void;
  onUse: (templateId: string) => void;
  onCreate?: () => void;
  onRetry?: () => void;
  errorDetail?: string;
}) {
  if (state === "loading") return <LoadingState className="px-0" rows={6} />;

  if (state === "error") {
    return (
      <ErrorState
        detail={errorDetail}
        onRetry={onRetry}
        title="Slate could not load the template gallery."
      />
    );
  }

  if (state === "empty" || templates.length === 0) {
    if (searching) {
      return (
        <p className="px-1 py-10 text-center text-ui text-ink-muted" role="status">
          {noTemplateMatchMessage}
        </p>
      );
    }
    return (
      <EmptyState
        action={
          onCreate ? (
            <button
              className="h-8 rounded-control border border-line-strong bg-surface px-3 text-ui font-medium text-ink hover:bg-sidebar-hover focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
              onClick={onCreate}
              type="button"
            >
              New template
            </button>
          ) : null
        }
        description="Save a page as a template to offer it here."
        title="No templates yet"
      />
    );
  }

  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {templates.map((template) => (
        <li className="flex" key={template.id}>
          <TemplateCard className="w-full" onOpen={onOpen} onUse={onUse} template={template} />
        </li>
      ))}
    </ul>
  );
}
