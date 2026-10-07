import { cn } from "../../../ui";
import type { PublishedTheme } from "./types";

export interface UnavailablePageViewProps {
  /**
   * `WEB-006` — content-free by construction. It takes no title, no owner and
   * no reason, because there is nothing here it would be safe to say.
   */
  theme?: PublishedTheme;
  className?: string;
}

export function UnavailablePageView({ theme = "light", className }: UnavailablePageViewProps) {
  return (
    <div
      className={cn("flex min-h-screen items-center justify-center bg-canvas px-6", className)}
      data-theme={theme}
    >
      <main className="flex max-w-reading flex-col items-center gap-2 text-center">
        <h1 className="text-h3 font-semibold text-ink">This link is no longer available</h1>
        <p className="text-ui text-ink-muted">Nothing is published at this address.</p>
      </main>
    </div>
  );
}
