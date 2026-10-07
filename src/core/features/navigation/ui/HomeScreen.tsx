import { Star, Users } from "lucide-react";
import type { ReactNode } from "react";
import {
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  type SurfaceState,
  cn,
} from "../../../ui";
import { NavEntryRow } from "./NavEntryRow";
import { countOf, pluralHeading } from "./nouns";
import type { HomeContainerEntry, NavEntry } from "./types";

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1">
      <h2 className="px-2 text-tiny font-medium tracking-wide text-ink-faint uppercase">{title}</h2>
      {children}
    </section>
  );
}

function Quiet({ children }: { children: ReactNode }) {
  return <p className="px-2 py-1 text-ui text-ink-muted">{children}</p>;
}

export interface HomeScreenProps {
  state: SurfaceState;
  /** NAV-002 — the member's own recent pages. */
  recents: readonly NavEntry[];
  /** NAV-003 / PAGE-008 — the member's own favourites. */
  favourites: readonly NavEntry[];
  /** The containers this member belongs to, and no others. */
  containers: readonly HomeContainerEntry[];
  onOpen: (id: string) => void;
  onOpenContainer: (id: string) => void;
  onCreatePage?: () => void;
  onRetry?: () => void;
  errorDetail?: string;
  className?: string;
}

/** NAV-001 — home: recents, favourites and the member's containers. No activity feed. */
export function HomeScreen({
  state,
  recents,
  favourites,
  containers,
  onOpen,
  onOpenContainer,
  onCreatePage,
  onRetry,
  errorDetail,
  className,
}: HomeScreenProps) {
  const containersHeading = pluralHeading("container");

  return (
    <div className={cn("mx-auto w-full max-w-wide px-4 py-8 sm:px-6", className)}>
      <h1 className="px-2 text-h1 font-semibold text-ink">Home</h1>

      {state === "loading" ? <LoadingState rows={8} /> : null}

      {state === "error" ? (
        <div className="mt-6 px-2">
          <ErrorState detail={errorDetail} onRetry={onRetry} title="Home could not be loaded" />
        </div>
      ) : null}

      {state === "denied" ? (
        <div className="mt-6">
          <EmptyState description="Ask a workspace administrator to add you." title="You have no access to this workspace" />
        </div>
      ) : null}

      {state === "empty" ? (
        <div className="mt-6">
          <EmptyState
            action={onCreatePage ? <Button onClick={onCreatePage}>Create a page</Button> : undefined}
            description="Pages you open and favourite will appear here."
            title="Nothing here yet"
          />
        </div>
      ) : null}

      {state === "ready" ? (
        <div className="mt-6 flex flex-col gap-8">
          <Group title="Recently visited">
            {recents.length === 0 ? (
              <Quiet>Nothing opened yet.</Quiet>
            ) : (
              <ul className="grid gap-1 sm:grid-cols-2">
                {recents.map((entry) => (
                  <li key={entry.id}>
                    <NavEntryRow
                      className="border border-line"
                      entry={entry}
                      onOpen={onOpen}
                    />
                  </li>
                ))}
              </ul>
            )}
          </Group>

          <Group title="Favourites">
            {favourites.length === 0 ? (
              <Quiet>
                <Star aria-hidden="true" className="mr-1 inline size-3.5 text-ink-faint" />
                Star a page to keep it here.
              </Quiet>
            ) : (
              <ul className="flex flex-col">
                {favourites.map((entry) => (
                  <li key={entry.id}>
                    <NavEntryRow entry={entry} onOpen={onOpen} />
                  </li>
                ))}
              </ul>
            )}
          </Group>

          <Group title={`Your ${containersHeading.toLowerCase()}`}>
            {containers.length === 0 ? (
              <Quiet>{`You belong to no ${containersHeading.toLowerCase()} yet.`}</Quiet>
            ) : (
              <ul className="flex flex-col">
                {containers.map((container) => (
                  <li key={container.id}>
                    <NavEntryRow
                      entry={{ id: container.id, title: container.name, icon: container.icon, kind: "container" }}
                      onOpen={onOpenContainer}
                      trailing={
                        <span className="flex items-center gap-1">
                          <Users aria-hidden="true" className="size-3.5" />
                          {countOf(container.memberCount, "member")}
                        </span>
                      }
                    />
                  </li>
                ))}
              </ul>
            )}
          </Group>
        </div>
      ) : null}
    </div>
  );
}
