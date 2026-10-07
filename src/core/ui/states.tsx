import { AlertTriangle, Lock, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "./button";
import { cn } from "./cn";
import { Skeleton } from "./skeleton";

/**
 * The four states every surface in this product renders. `denied` is deliberately
 * content-free: nothing here may reveal that a record exists to a reader who may
 * not read it (`SEARCH-005`, `LINK-004`).
 */
export type SurfaceState = "ready" | "loading" | "empty" | "error" | "denied";

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 px-6 py-12 text-center", className)}>
      <p className="text-ui font-medium text-ink">{title}</p>
      {description ? <p className="max-w-md text-ui text-ink-muted">{description}</p> : null}
      {action ? <div className="mt-2 flex items-center gap-2">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title,
  detail,
  onRetry,
  retryLabel = "Try again",
  className,
}: {
  title: string;
  detail?: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-start gap-2 rounded-card border border-danger/30 bg-danger-soft p-3", className)} role="alert">
      <p className="flex items-center gap-1.5 text-ui font-medium text-danger">
        <AlertTriangle aria-hidden="true" className="size-4" />
        {title}
      </p>
      {detail ? <p className="text-ui text-ink-muted">{detail}</p> : null}
      {onRetry ? (
        <Button onClick={onRetry} size="sm" variant="secondary">
          <RefreshCw aria-hidden="true" className="size-3.5" />
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}

export function DeniedState({
  title = "You need access to open this",
  onRequestAccess,
  className,
}: {
  title?: string;
  onRequestAccess?: () => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 px-6 py-12 text-center", className)}>
      <Lock aria-hidden="true" className="size-5 text-ink-faint" />
      <p className="text-ui font-medium text-ink">{title}</p>
      {onRequestAccess ? (
        <Button onClick={onRequestAccess} size="sm" variant="secondary">
          Request access
        </Button>
      ) : null}
    </div>
  );
}

export function LoadingState({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div aria-busy="true" className={cn("flex flex-col gap-2 p-3", className)}>
      <span className="sr-only">Loading</span>
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton className={cn("h-4", index % 3 === 2 ? "w-1/2" : "w-full")} key={index} />
      ))}
    </div>
  );
}
