import { Archive, CheckCheck, X } from "lucide-react";
import {
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  cn,
} from "../../../ui";
import { InboxFilters } from "./InboxFilters";
import { NotificationRow } from "./NotificationRow";
import {
  inboxViewCopy,
  inboxViews,
  type InboxKindFilter,
  type InboxView,
  type NotificationEntry,
  type NotificationPeriod,
  type NotificationSurfaceState,
} from "./types";

/**
 * `NOTIF-002` — the inbox, as a panel over the app.
 *
 * Newest first, grouped by period with a heading, an unread count, and the two
 * views kept apart: what is addressed to the member, and what comes from the
 * pages they watch. Opening an entry marks it read and opens the referenced
 * record at the referenced comment — that is the caller's `onOpenNotification`.
 */
export interface InboxPanelProps {
  state: NotificationSurfaceState;
  view: InboxView;
  onViewChange: (next: InboxView) => void;
  /** Newest period first; entries newest first inside each. */
  periods: readonly NotificationPeriod[];
  unreadCount: number;
  kindFilter: InboxKindFilter;
  onKindFilterChange: (next: InboxKindFilter) => void;
  onOpenNotification: (entry: NotificationEntry) => void;
  onMarkAllRead: () => void;
  onArchiveRead: () => void;
  onClose: () => void;
  filtersOpen?: boolean;
  onFiltersOpenChange?: (next: boolean) => void;
  errorDetail?: string;
  onRetry?: () => void;
  className?: string;
}

export function InboxPanel(props: InboxPanelProps) {
  const { state, view, periods, unreadCount, className } = props;

  return (
    <aside
      aria-label="Inbox"
      className={cn(
        "flex h-full w-full flex-col border-r border-line bg-surface sm:w-panel",
        "shadow-[0_12px_32px_rgb(15_15_15/0.14)]",
        className,
      )}
    >
      <header className="flex flex-col gap-2 border-b border-line px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <h2 className="flex-1 text-ui font-semibold text-ink">
            Inbox
            {unreadCount > 0 ? (
              <span className="ml-1.5 rounded-control bg-accent px-1.5 py-0.5 text-micro font-medium text-ink-inverse">
                {unreadCount} unread
              </span>
            ) : null}
          </h2>
          <Button aria-label="Mark everything read" onClick={props.onMarkAllRead} size="iconSm" variant="ghost">
            <CheckCheck aria-hidden="true" className="size-4" />
          </Button>
          <Button aria-label="Archive everything read" onClick={props.onArchiveRead} size="iconSm" variant="ghost">
            <Archive aria-hidden="true" className="size-4" />
          </Button>
          <InboxFilters
            onChange={props.onKindFilterChange}
            onOpenChange={props.onFiltersOpenChange}
            open={props.filtersOpen}
            value={props.kindFilter}
          />
          <Button aria-label="Close the inbox" onClick={props.onClose} size="iconSm" variant="ghost">
            <X aria-hidden="true" className="size-4" />
          </Button>
        </div>
      </header>

      <Tabs
        className="flex min-h-0 flex-1 flex-col"
        onValueChange={(next) => props.onViewChange(next as InboxView)}
        value={view}
      >
        <TabsList className="px-3">
          {inboxViews.map((value) => (
            <TabsTrigger key={value} value={value}>
              {inboxViewCopy[value].label}
            </TabsTrigger>
          ))}
        </TabsList>
        {inboxViews.map((value) => (
          <TabsContent className="min-h-0 flex-1 overflow-y-auto" key={value} value={value}>
            <p className="px-3 py-2 text-tiny text-ink-muted">{inboxViewCopy[value].description}</p>
            {state === "loading" ? <LoadingState rows={6} /> : null}
            {state === "error" ? (
              <ErrorState
                className="m-3"
                detail={props.errorDetail}
                onRetry={props.onRetry}
                title="The inbox could not be loaded"
              />
            ) : null}
            {state === "empty" ? (
              <EmptyState
                description={
                  value === "addressed"
                    ? "Mentions, replies and access land here as they happen."
                    : "Activity on the pages you watch lands here as it happens."
                }
                title="Nothing here"
              />
            ) : null}
            {state === "ready" ? (
              <div className="flex flex-col">
                {periods.map((period) => (
                  <section key={period.id}>
                    <h3 className="sticky top-0 bg-surface px-3 py-1.5 text-micro font-medium tracking-wide text-ink-faint uppercase">
                      {period.label}
                    </h3>
                    <ul className="flex flex-col">
                      {period.entries.map((entry) => (
                        <NotificationRow entry={entry} key={entry.id} onOpen={props.onOpenNotification} />
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            ) : null}
          </TabsContent>
        ))}
      </Tabs>
    </aside>
  );
}
