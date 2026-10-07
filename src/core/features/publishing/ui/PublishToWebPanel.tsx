import type { ReactNode } from "react";
import type { KnowledgePolicyProfile } from "../../../shared/knowledge/policies";
import { Button, DeniedState, ErrorState, LoadingState, cn } from "../../../ui";
import { IndexingSwitch } from "./IndexingSwitch";
import { PublishLinkFields } from "./PublishLinkFields";
import { PublishSiteFields } from "./PublishSiteFields";
import type { PublicExposure, PublishSurfaceState, PublishedTheme } from "./types";

export interface PublishToWebPanelProps {
  state?: PublishSurfaceState;
  /** `WEB-007` — `site` shows the whole site surface, `link` a single toggle. */
  publicAccessProfile: KnowledgePolicyProfile["page.public-access.v1"];
  published: boolean;
  exposure: PublicExposure;
  hosts: readonly { id: string; name: string }[];
  slugError?: string | null;
  /**
   * `WEB-001` — a `PublishBlockedNotice` when the container vetoes an act.
   * While it is present the publishing controls are inert.
   */
  blocked?: ReactNode;
  /** `WEB-001` — only `full` access may publish. */
  canPublish: boolean;
  onPublish: () => void;
  onUnpublish: () => void;
  onViewSite?: () => void;
  onCopyUrl?: () => void;
  onHostChange: (host: string) => void;
  onSlugChange: (slug: string) => void;
  onThemeChange: (theme: PublishedTheme) => void;
  onHeaderControlChange: (controlId: string, enabled: boolean) => void;
  onDuplicateAsTemplateChange: (next: boolean) => void;
  onIndexingChange: (next: boolean) => void;
  onOpenEmbed?: () => void;
  onShareViaSocial?: () => void;
  errorDetail?: string;
  onRetry?: () => void;
  onRequestAccess?: () => void;
  className?: string;
}

export function PublishToWebPanel(props: PublishToWebPanelProps) {
  const { state = "ready", className } = props;

  if (state === "loading") return <LoadingState className="p-1" rows={4} />;
  if (state === "error") {
    return (
      <ErrorState
        detail={props.errorDetail}
        onRetry={props.onRetry}
        title="This page's public link could not be loaded"
      />
    );
  }
  if (state === "denied") {
    return (
      <DeniedState
        onRequestAccess={props.onRequestAccess}
        title="Full access is needed to publish this page"
      />
    );
  }

  const inert = !props.canPublish || Boolean(props.blocked);

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {props.blocked}
      {props.publicAccessProfile === "site" ? (
        <SiteProfile {...props} inert={inert} />
      ) : (
        <LinkProfile {...props} inert={inert} />
      )}
    </div>
  );
}

function SiteProfile({ inert, ...props }: PublishToWebPanelProps & { inert: boolean }) {
  return (
    <>
      <PublishSiteFields
        disabled={inert}
        exposure={props.exposure}
        hosts={props.hosts}
        onCopyUrl={props.published ? props.onCopyUrl : undefined}
        onDuplicateAsTemplateChange={props.onDuplicateAsTemplateChange}
        onHeaderControlChange={props.onHeaderControlChange}
        onHostChange={props.onHostChange}
        onOpenEmbed={props.published ? props.onOpenEmbed : undefined}
        onShareViaSocial={props.published ? props.onShareViaSocial : undefined}
        onSlugChange={props.onSlugChange}
        onThemeChange={props.onThemeChange}
        slugError={props.slugError}
      />
      <IndexingSwitch
        checked={props.exposure.indexing}
        disabled={inert || !props.published}
        onCheckedChange={props.onIndexingChange}
      />
      <div className="flex items-center gap-2 border-t border-line pt-2">
        {props.published ? (
          <>
            <Button className="flex-1" disabled={inert} onClick={props.onUnpublish} size="md" variant="secondary">
              Unpublish
            </Button>
            {props.onViewSite ? (
              <Button className="flex-1" onClick={props.onViewSite} size="md">
                View site
              </Button>
            ) : null}
          </>
        ) : (
          <Button className="flex-1" disabled={inert} onClick={props.onPublish} size="md">
            Publish to web
          </Button>
        )}
      </div>
    </>
  );
}

function LinkProfile({ inert, ...props }: PublishToWebPanelProps & { inert: boolean }) {
  return (
    <>
      <PublishLinkFields
        disabled={inert}
        exposure={props.exposure}
        onCopyUrl={props.onCopyUrl}
        onOpenUrl={props.onViewSite}
        onToggle={(next) => (next ? props.onPublish() : props.onUnpublish())}
        published={props.published}
      />
      {props.published ? (
        <>
          <IndexingSwitch
            checked={props.exposure.indexing}
            disabled={inert}
            onCheckedChange={props.onIndexingChange}
          />
          <div className="flex border-t border-line pt-2">
            <Button disabled={inert} onClick={props.onUnpublish} size="sm" variant="secondary">
              Unpublish
            </Button>
          </div>
        </>
      ) : null}
    </>
  );
}
