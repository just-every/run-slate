import { Globe } from "lucide-react";
import type { KnowledgePolicyProfile } from "../../../shared/knowledge/policies";
import { Button, cn } from "../../../ui";

export interface LiveSiteBannerProps {
  /** `WEB-007` — the banner belongs to the `site` profile and nothing else. */
  publicAccessProfile: KnowledgePolicyProfile["page.public-access.v1"];
  url: string;
  onViewSite?: () => void;
  onOpenPublishSettings?: () => void;
  className?: string;
}

export function LiveSiteBanner({
  publicAccessProfile,
  url,
  onViewSite,
  onOpenPublishSettings,
  className,
}: LiveSiteBannerProps) {
  if (publicAccessProfile !== "site") return null;

  return (
    <div
      className={cn(
        "flex w-full flex-wrap items-center justify-center gap-x-2 gap-y-1 bg-accent-soft px-3 py-1.5 text-tiny text-accent",
        className,
      )}
      role="status"
    >
      <Globe aria-hidden="true" className="size-3.5" />
      <span className="text-ink-muted">
        This page is live on <span className="font-medium text-ink">{url}</span>
      </span>
      {onViewSite ? (
        <Button className="h-6 px-1.5" onClick={onViewSite} size="sm" variant="link">
          View site
        </Button>
      ) : null}
      {onOpenPublishSettings ? (
        <Button className="h-6 px-1.5" onClick={onOpenPublishSettings} size="sm" variant="link">
          Publishing settings
        </Button>
      ) : null}
    </div>
  );
}
