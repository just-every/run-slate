import { Globe, Lock, Plus, Users } from "lucide-react";
import type { ContainerVisibility } from "../../../shared/knowledge/model";
import type { KnowledgePolicyProfile } from "../../../shared/knowledge/policies";
import {
  Button,
  DeniedState,
  EmptyState,
  ErrorState,
  LoadingState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  type SurfaceState,
  cn,
} from "../../../ui";
import { ContainerIndexFilters } from "./ContainerIndexFilters";
import { countOf, noun, pluralHeading } from "./nouns";
import type { ContainerIndexEntry, ContainerIndexFilterState } from "./types";

const visibilityLabels: Record<ContainerVisibility, string> = {
  default: "Default",
  open: "Open",
  closed: "Closed",
  private: "Private",
  personal: "Personal",
};

function AccessCell({
  entry,
  accessPolicy,
}: {
  entry: ContainerIndexEntry;
  accessPolicy: KnowledgePolicyProfile["container.access.v1"];
}) {
  if (accessPolicy === "grant-led") {
    return (
      <span className="flex items-center gap-1.5 text-ui text-ink-muted">
        <Users aria-hidden="true" className="size-3.5 text-ink-faint" />
        {entry.grantCount === 1 ? "1 grant" : `${entry.grantCount} grants`}
      </span>
    );
  }
  const open = entry.visibility === "open" || entry.visibility === "default";
  return (
    <span className="flex items-center gap-1.5 text-ui text-ink-muted">
      {open ? (
        <Globe aria-hidden="true" className="size-3.5 text-ink-faint" />
      ) : (
        <Lock aria-hidden="true" className="size-3.5 text-ink-faint" />
      )}
      {visibilityLabels[entry.visibility]}
    </span>
  );
}

export interface ContainerIndexProps {
  state: SurfaceState;
  containers: readonly ContainerIndexEntry[];
  filters: ContainerIndexFilterState;
  onFiltersChange: (filters: ContainerIndexFilterState) => void;
  onOpen: (id: string) => void;
  onCreate?: () => void;
  onRetry?: () => void;
  onRequestAccess?: () => void;
  errorDetail?: string;
  /** container.access.v1 — class-led shows the visibility class, grant-led the grants. */
  accessPolicy: KnowledgePolicyProfile["container.access.v1"];
  className?: string;
}

/** The index of containers: name, description, access and member count, filterable. */
export function ContainerIndex({
  state,
  containers,
  filters,
  onFiltersChange,
  onOpen,
  onCreate,
  onRetry,
  onRequestAccess,
  errorDetail,
  accessPolicy,
  className,
}: ContainerIndexProps) {
  const heading = pluralHeading("container");
  const singular = noun("container");

  return (
    <div className={cn("mx-auto w-full max-w-wide px-4 py-8 sm:px-6", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-h1 font-semibold text-ink">{heading}</h1>
        {onCreate ? (
          <Button onClick={onCreate} size="sm">
            <Plus aria-hidden="true" className="size-3.5" />
            {`New ${singular}`}
          </Button>
        ) : null}
      </div>

      {state === "denied" ? (
        <DeniedState className="mt-8" onRequestAccess={onRequestAccess} />
      ) : (
        <>
          <div className="mt-5">
            <ContainerIndexFilters filters={filters} onFiltersChange={onFiltersChange} />
          </div>

          {state === "loading" ? <LoadingState rows={6} /> : null}
          {state === "error" ? (
            <div className="mt-6">
              <ErrorState detail={errorDetail} onRetry={onRetry} title={`${heading} could not be loaded`} />
            </div>
          ) : null}
          {state === "empty" ? (
            <EmptyState
              action={onCreate ? <Button onClick={onCreate}>{`Create a ${singular}`}</Button> : undefined}
              className="mt-6"
              description={`No ${heading.toLowerCase()} match these filters.`}
              title="Nothing to show"
            />
          ) : null}

          {state === "ready" ? (
            <div className="mt-4 overflow-x-auto">
              <Table className="min-w-[44rem]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Access</TableHead>
                    <TableHead>{pluralHeading("member")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {containers.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>
                        <button
                          className="flex min-w-0 items-center gap-2 rounded-control text-left focus-visible:outline-2 focus-visible:outline-accent"
                          onClick={() => onOpen(entry.id)}
                          type="button"
                        >
                          {entry.icon ? (
                            <span aria-hidden="true" className="w-5 shrink-0 text-center leading-none">
                              {entry.icon}
                            </span>
                          ) : (
                            <Users aria-hidden="true" className="size-4 shrink-0 text-ink-faint" />
                          )}
                          <span className="truncate font-medium text-ink">{entry.name}</span>
                          {entry.isPersonal ? (
                            <span className="shrink-0 text-tiny text-ink-faint">Personal</span>
                          ) : null}
                        </button>
                      </TableCell>
                      <TableCell className="text-ink-muted">
                        {entry.description ?? <span className="text-ink-faint">No description</span>}
                      </TableCell>
                      <TableCell>
                        <AccessCell accessPolicy={accessPolicy} entry={entry} />
                      </TableCell>
                      <TableCell className="text-ink-muted">
                        {entry.isMember
                          ? `${countOf(entry.memberCount, "member")}, including you`
                          : countOf(entry.memberCount, "member")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
