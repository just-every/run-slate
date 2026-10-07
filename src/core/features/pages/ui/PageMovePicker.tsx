import { ArrowRight, Folder, FileText } from "lucide-react";
import {
  Button,
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DeniedState,
  EmptyState,
  DialogTitle,
  ErrorState,
  LoadingState,
  type SurfaceState,
} from "../../../ui";
import { knowledgeNoun } from "../../../shared/knowledge/vocabulary";

export interface PageMoveDestination {
  id: string;
  label: string;
  /** The trail the destination sits on, so two same-named pages are told apart. */
  path: string;
  kind: "container" | "page";
}

/**
 * `PAGE-004` — the searchable destination picker. Children move with the page,
 * grants are re-resolved against the new parent, and the change is shown before
 * it is applied, which is what the summary at the foot is for.
 */
export function PageMovePicker({
  open,
  onOpenChange,
  pageTitle,
  currentPath,
  childCount,
  destinations,
  state,
  query,
  onQueryChange,
  selectedDestinationId,
  onSelectDestination,
  onConfirm,
  onRetry,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  pageTitle: string;
  currentPath: string;
  childCount: number;
  destinations: readonly PageMoveDestination[];
  state: SurfaceState;
  query: string;
  onQueryChange: (next: string) => void;
  selectedDestinationId: string | null;
  onSelectDestination: (destinationId: string) => void;
  onConfirm: () => void;
  onRetry?: () => void;
}) {
  const selected = destinations.find((destination) => destination.id === selectedDestinationId) ?? null;

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="p-0">
        <DialogHeader>
          <DialogTitle>Move “{pageTitle}”</DialogTitle>
          <DialogDescription>
            Choose a page or a {knowledgeNoun("container")} to move it into.
          </DialogDescription>
        </DialogHeader>

        <Command className="max-h-80" label="Move destinations">
          <CommandInput
            aria-expanded={state === "ready"}
            {...(state !== "ready" ? { "aria-controls": undefined } : {})}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search for a destination"
            value={query}
          />
          {state === "loading" ? <LoadingState rows={4} /> : null}
          {state === "denied" ? <DeniedState /> : null}
          {state === "empty" ? <EmptyState title="No destinations available" description="No destination matches this search." /> : null}
          {state === "error" ? (
            <div className="p-3">
              <ErrorState detail="Nothing has moved." onRetry={onRetry} title="Could not load destinations" />
            </div>
          ) : null}
          {state === "ready" ? (
            <CommandList>
              {destinations.length === 0 ? <CommandEmpty>No destination matches that search.</CommandEmpty> : null}
              {destinations.map((destination) => (
                <CommandItem
                  className={destination.id === selectedDestinationId ? "bg-accent-soft text-accent" : undefined}
                  hint={destination.path}
                  key={destination.id}
                  onSelect={() => onSelectDestination(destination.id)}
                  value={destination.id}
                >
                  {destination.kind === "container" ? (
                    <Folder aria-hidden="true" className="size-4" />
                  ) : (
                    <FileText aria-hidden="true" className="size-4" />
                  )}
                  {destination.label}
                </CommandItem>
              ))}
            </CommandList>
          ) : null}
        </Command>

        <div className="border-t border-line px-4 py-3 text-ui" aria-live="polite">
          {selected === null || state !== "ready" ? (
            <p className="text-ink-muted">Choose a destination to see what will change.</p>
          ) : (
            <div className="flex flex-col gap-1">
              <p className="flex flex-wrap items-center gap-1.5 text-ink">
                <span className="text-ink-muted">{currentPath}</span>
                <ArrowRight aria-hidden="true" className="size-3.5 text-ink-faint" />
                <span className="font-medium">
                  {selected.path === "" ? selected.label : `${selected.path} / ${selected.label}`}
                </span>
              </p>
              <p className="text-tiny text-ink-muted">
                {childCount === 0
                  ? "No child page moves with it."
                  : childCount === 1
                    ? "1 child page moves with it."
                    : `${childCount} child pages move with it.`}{" "}
                Access is resolved again against the new parent. Comments, versions and links are unchanged.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant="secondary">
            Cancel
          </Button>
          <Button disabled={state !== "ready" || selected === null} onClick={onConfirm} variant="primary">
            Move page
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
