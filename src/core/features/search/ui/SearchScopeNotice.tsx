import { Folder } from "lucide-react";
import { Button, cn } from "../../../ui";
import { containerNoun } from "./nouns";
import type { SearchScope } from "./types";

/**
 * `SEARCH-006` — search scoped to one container says which container it is
 * scoped to, and offers the one action that widens it to the whole workspace.
 * Every filter stays in force either way; this notice changes nothing but scope.
 */
export function SearchScopeNotice({
  scope,
  onSearchWholeWorkspace,
  className,
}: {
  scope: SearchScope;
  onSearchWholeWorkspace: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-card border border-line bg-sidebar px-3 py-2",
        className,
      )}
    >
      <Folder aria-hidden="true" className="size-4 shrink-0 text-ink-faint" />
      <p className="text-ui text-ink-muted">
        {`Searching one ${containerNoun}: `}
        <span className="font-medium text-ink">{scope.containerName}</span>
      </p>
      <Button className="ml-auto" onClick={onSearchWholeWorkspace} size="sm" variant="secondary">
        Search the whole workspace
      </Button>
    </div>
  );
}
