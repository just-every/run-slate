import { CircleCheck, CloudOff, LoaderCircle, Pencil, TriangleAlert } from "lucide-react";
import { Button, cn } from "../../../ui";

/** `SAVE-001`, `SAVE-002`, `SAVE-004`. */
export type SaveStatusState = "saving" | "saved" | "failed" | "offline" | "unsaved";

export interface SaveStatusProps {
  state: SaveStatusState;
  /** Shown beside Saved once the write and its activity entry are committed. */
  savedAtLabel?: string;
  /** Names the failure. Required by `SAVE-002` when the state is failed. */
  failureMessage?: string;
  onRetry?: () => void;
  /** `SAVE-004` — a draft recovered from browser storage is labelled unsaved. */
  recoveredDraft?: boolean;
  className?: string;
}

const iconClass = "size-3.5 shrink-0";

export function SaveStatus({
  state,
  savedAtLabel,
  failureMessage,
  onRetry,
  recoveredDraft = false,
  className,
}: SaveStatusProps) {
  return (
    <div
      aria-live="polite"
      className={cn("flex flex-wrap items-center gap-2 text-tiny", className)}
      role="status"
    >
      {state === "saving" ? (
        <span className="flex items-center gap-1.5 text-ink-muted">
          <LoaderCircle aria-hidden="true" className={cn(iconClass, "animate-spin")} />
          Saving
        </span>
      ) : null}

      {state === "saved" ? (
        <span className="flex items-center gap-1.5 text-ink-muted">
          <CircleCheck aria-hidden="true" className={cn(iconClass, "text-good")} />
          Saved{savedAtLabel ? ` ${savedAtLabel}` : ""}
        </span>
      ) : null}

      {state === "unsaved" ? (
        <span className="flex items-center gap-1.5 text-ink-muted">
          <Pencil aria-hidden="true" className={iconClass} />
          {recoveredDraft ? "Unsaved — a draft was recovered on this device" : "Unsaved changes"}
          {onRetry ? <Button onClick={onRetry} size="sm" variant="secondary">Try saving again</Button> : null}
        </span>
      ) : null}

      {state === "offline" ? (
        <span className="flex items-center gap-1.5 text-warn">
          <CloudOff aria-hidden="true" className={iconClass} />
          Offline — your unsent changes are kept on this device and labelled unsaved
          {onRetry ? <Button onClick={onRetry} size="sm" variant="secondary">Try saving again</Button> : null}
        </span>
      ) : null}

      {state === "failed" ? (
        <>
          <span className="flex items-center gap-1.5 text-danger">
            <TriangleAlert aria-hidden="true" className={iconClass} />
            Not saved — {failureMessage ?? "the write was rejected"}. Your text is kept here.
          </span>
          {onRetry ? (
            <Button onClick={onRetry} size="sm" variant="secondary">
              Try saving again
            </Button>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
