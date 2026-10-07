import { CheckCheck, X } from "lucide-react";
import type { AccessLevel } from "../../../shared/knowledge/model";
import {
  Button,
  DeniedState,
  EmptyState,
  ErrorState,
  LoadingState,
  ScrollArea,
  type SurfaceState,
  cn,
} from "../../../ui";
import { CommentComposer } from "./CommentComposer";
import { CommentThread } from "./CommentThread";
import { DiscussionsFilters, type DiscussionsFilter } from "./DiscussionsFilters";
import { pageBodyNoun } from "./nouns";
import { canComment, type CommentPerson, type CommentThreadRecord } from "./types";

export interface DiscussionsPanelProps {
  state: SurfaceState;
  pageTitle: string;
  /** COMM-006 — every thread on the page, already filtered by the caller. */
  threads: readonly CommentThreadRecord[];
  filter: DiscussionsFilter;
  people: readonly CommentPerson[];
  viewerAccess: AccessLevel;
  selectedThreadId: string | null;
  errorDetail?: string;
  onFilterChange: (next: DiscussionsFilter) => void;
  onResolveAll: () => void;
  /** COMM-006 — selecting a thread scrolls to its anchor. */
  onSelectThread: (threadId: string) => void;
  onStartPageThread: (body: string) => void | Promise<void>;
  onRetry: () => void;
  onClose: () => void;
  onReply: (threadId: string, body: string) => void | Promise<void>;
  onResolve: (threadId: string) => void;
  onReopen: (threadId: string) => void;
  onEditComment: (commentId: string, body: string) => void;
  onDeleteComment: (commentId: string) => void;
  onToggleReaction: (commentId: string, emoji: string) => void;
  onAddReaction: (commentId: string) => void;
  onMention: () => void;
  onAttach: () => void;
  onOpenRevision: (revisionId: string) => void;
  className?: string;
}

/** COMM-006 — one panel listing every thread on the page. */
export function DiscussionsPanel({
  state,
  pageTitle,
  threads,
  filter,
  people,
  viewerAccess,
  selectedThreadId,
  errorDetail,
  onFilterChange,
  onResolveAll,
  onSelectThread,
  onStartPageThread,
  onRetry,
  onClose,
  className,
  ...thread
}: DiscussionsPanelProps) {
  const openCount = threads.filter((item) => item.status === "open").length;
  const anchored = threads.filter((item) => item.anchor.kind === "inline");
  const general = threads.filter((item) => item.anchor.kind === "page");

  return (
    <aside
      aria-label={`Discussions on ${pageTitle}`}
      className={cn("flex h-full w-full flex-col border-line bg-surface md:w-panel md:border-l", className)}
    >
      <header className="flex items-center gap-1 border-b border-line px-3 py-2">
        <h2 className="shrink-0 text-ui font-medium text-ink">Discussions</h2>
        {state === "ready" ? (
          <span className="shrink-0 text-tiny whitespace-nowrap text-ink-faint">
            {openCount} open of {threads.length}
          </span>
        ) : null}
        <div className="ml-auto flex items-center gap-0.5">
          {state === "ready" && openCount > 0 && canComment(viewerAccess) ? (
            <Button onClick={onResolveAll} size="sm" variant="ghost">
              <CheckCheck aria-hidden="true" className="size-3.5" />
              Resolve all open
            </Button>
          ) : null}
          <DiscussionsFilters filter={filter} onChange={onFilterChange} people={people} />
          <Button aria-label="Close discussions" onClick={onClose} size="iconSm" variant="ghost">
            <X aria-hidden="true" className="size-4" />
          </Button>
        </div>
      </header>

      {state === "loading" ? <LoadingState rows={6} /> : null}
      {state === "denied" ? (
        <DeniedState title="You need access to read the discussion on this page" />
      ) : null}
      {state === "error" ? (
        <ErrorState
          className="m-3"
          detail={errorDetail}
          onRetry={onRetry}
          title="The discussion could not be loaded"
        />
      ) : null}
      {state === "empty" ? (
        <EmptyState
          description={`Select text in the ${pageBodyNoun} to anchor a thread, or start one about the whole page below.`}
          title="No threads yet"
        />
      ) : null}

      {state === "ready" ? (
        <ScrollArea className="flex-1">
          <div className="flex flex-col gap-3 p-3">
            {anchored.map((item) => (
              <ThreadRow
                key={item.id}
                onSelect={onSelectThread}
                selected={item.id === selectedThreadId}
                thread={item}
                viewerAccess={viewerAccess}
                {...thread}
              />
            ))}
            {general.length ? (
              <h3 className="mt-1 border-t border-line pt-3 text-tiny font-medium text-ink-muted">General comments</h3>
            ) : null}
            {general.map((item) => (
              <ThreadRow
                key={item.id}
                onSelect={onSelectThread}
                selected={item.id === selectedThreadId}
                thread={item}
                viewerAccess={viewerAccess}
                {...thread}
              />
            ))}
          </div>
        </ScrollArea>
      ) : null}

      {state === "ready" || state === "empty" ? (
        <div className="border-t border-line p-2">
          <CommentComposer
            onAttach={thread.onAttach}
            onMention={thread.onMention}
            onSubmit={onStartPageThread}
            placeholder="Comment on the whole page…"
            submitLabel="Send comment"
            viewerAccess={viewerAccess}
          />
        </div>
      ) : null}
    </aside>
  );
}

type ThreadRowProps = Omit<
  DiscussionsPanelProps,
  | "state" | "pageTitle" | "threads" | "filter" | "people" | "selectedThreadId" | "errorDetail"
  | "onFilterChange" | "onResolveAll" | "onSelectThread" | "onStartPageThread" | "onRetry" | "onClose" | "className"
> & {
  thread: CommentThreadRecord;
  selected: boolean;
  onSelect: (threadId: string) => void;
};

function ThreadRow({ thread, selected, onSelect, ...rest }: ThreadRowProps) {
  return (
    <div
      className={cn(
        "rounded-card border p-2.5 transition-colors",
        selected ? "border-accent bg-accent-soft/40" : "border-line bg-surface hover:bg-sidebar-hover/40",
      )}
    >
      <Button className="mb-1 h-auto px-0 text-tiny" onClick={() => onSelect(thread.id)} size="sm" variant="link">
        {thread.anchor.kind === "inline" && !thread.anchor.orphanedIn
          ? "Scroll to this anchor"
          : "Open this thread"}
      </Button>
      <CommentThread
        anchor={thread.anchor}
        collapseReplies
        comments={thread.comments}
        status={thread.status}
        threadId={thread.id}
        {...rest}
      />
    </div>
  );
}
