import { Lock } from "lucide-react";
import { knowledgeNoun } from "../../../shared/knowledge/vocabulary";
import { Button, cn } from "../../../ui";

export interface RequestAccessCardProps {
  /**
   * `LINK-004` — the card is content-free by construction: it takes no title,
   * snippet, icon or author, so there is nothing here that could leak one.
   */
  requestState?: "idle" | "sending" | "requested";
  onRequestAccess: () => void;
  className?: string;
}

export function RequestAccessCard({ requestState = "idle", onRequestAccess, className }: RequestAccessCardProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 rounded-card border border-line bg-sidebar px-3 py-2.5",
        className,
      )}
    >
      <Lock aria-hidden="true" className="size-4 shrink-0 text-ink-faint" />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-ui text-ink">A linked {knowledgeNoun("record")} is here</span>
        <span className="text-tiny text-ink-muted">
          {requestState === "requested"
            ? "Access requested. Someone who can grant it has been told."
            : "You need access before it will open."}
        </span>
      </div>
      {requestState === "requested" ? null : (
        <Button disabled={requestState === "sending"} onClick={onRequestAccess} size="sm" variant="secondary">
          {requestState === "sending" ? "Requesting…" : "Request access"}
        </Button>
      )}
    </div>
  );
}
