import { Link2 } from "lucide-react";
import type { ReactNode } from "react";
import type { AccessLevel } from "../../../shared/knowledge/model";
import type { KnowledgePolicyProfile } from "../../../shared/knowledge/policies";
import {
  Button,
  DeniedState,
  ErrorState,
  LoadingState,
  Separator,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  cn,
} from "../../../ui";
import { GrantInviteField, type GrantInviteFieldProps } from "./GrantInviteField";
import { GrantRow, type EffectiveGrant } from "./GrantRow";
import { GeneralAccessRow, type GeneralAccessRowProps } from "./GeneralAccessRow";

export type SharePanelTab = "share" | "publish";
export type SharePanelState = "ready" | "loading" | "error" | "denied";

export interface SharePanelProps {
  state?: SharePanelState;
  /** `SHARE-005` — which principal general access names. */
  accessProfile: KnowledgePolicyProfile["page.access.v1"];
  /** `SHARE-002` — `full` is the only level that may change access. */
  canChangeAccess: boolean;
  offeredLevels: readonly AccessLevel[];
  tab: SharePanelTab;
  onTabChange: (tab: SharePanelTab) => void;
  invite: Omit<GrantInviteFieldProps, "offeredLevels" | "disabled">;
  /** `SHARE-001` — every effective grant, in order. */
  grants: readonly EffectiveGrant[];
  onGrantLevelChange: (grantId: string, level: AccessLevel) => void;
  onGrantRemove?: (grantId: string) => void;
  onGrantRegrant?: (grantId: string) => void;
  generalAccess: Omit<GeneralAccessRowProps, "profile" | "offeredLevels" | "canChangeAccess">;
  /** A restriction notice or another panel-level message. */
  notice?: ReactNode;
  /** `LIFE-002` — a draft has no general access and cannot be published to the web. */
  isDraft?: boolean;
  /** `WEB-007` — the publishing surface, passed in whole. */
  publishSlot: ReactNode;
  onCopyLink?: () => void;
  errorDetail?: string;
  onRetry?: () => void;
  onRequestAccess?: () => void;
  className?: string;
}

export function SharePanel({
  state = "ready",
  accessProfile,
  canChangeAccess,
  offeredLevels,
  tab,
  onTabChange,
  invite,
  grants,
  onGrantLevelChange,
  onGrantRemove,
  onGrantRegrant,
  generalAccess,
  notice,
  isDraft = false,
  publishSlot,
  onCopyLink,
  errorDetail,
  onRetry,
  onRequestAccess,
  className,
}: SharePanelProps) {
  return (
    <div
      aria-label="Sharing and publishing"
      className={cn(
        "flex w-full flex-col rounded-card border border-line bg-surface shadow-[0_12px_32px_rgb(15_15_15/0.14)] sm:w-96",
        className,
      )}
      role="dialog"
    >
      {state === "loading" ? <LoadingState className="p-4" rows={5} /> : null}
      {state === "error" ? (
        <div className="p-3">
          <ErrorState
            detail={errorDetail}
            onRetry={onRetry}
            title="This page's access could not be loaded"
          />
        </div>
      ) : null}
      {state === "denied" ? (
        <DeniedState onRequestAccess={onRequestAccess} title="You need access to change who can open this" />
      ) : null}
      {state === "ready" ? (
        <Tabs onValueChange={(next) => onTabChange(next as SharePanelTab)} value={tab}>
          <TabsList className="px-3">
            <TabsTrigger value="share">Share</TabsTrigger>
            <TabsTrigger disabled={isDraft} value="publish">
              Publish
            </TabsTrigger>
          </TabsList>

          <TabsContent className="flex flex-col gap-3 p-3" value="share">
            <GrantInviteField {...invite} disabled={!canChangeAccess} offeredLevels={offeredLevels} />
            {notice}
            {isDraft ? (
              <p className="rounded-control bg-sidebar px-2 py-1.5 text-tiny text-ink-muted">
                This page is a draft. It is readable only by its author and the people listed here, sharing it adds a
                grant, and it carries no general access until it is published.
              </p>
            ) : null}
            {grants.length > 0 ? (
              <div className="flex flex-col">
                {grants.map((grant) => (
                  <GrantRow
                    canChangeAccess={canChangeAccess}
                    grant={grant}
                    key={grant.id}
                    offeredLevels={offeredLevels}
                    onLevelChange={onGrantLevelChange}
                    onRegrant={onGrantRegrant}
                    onRemove={onGrantRemove}
                  />
                ))}
              </div>
            ) : null}
            {isDraft ? null : (
              <>
                <Separator />
                <GeneralAccessRow
                  {...generalAccess}
                  canChangeAccess={canChangeAccess}
                  offeredLevels={offeredLevels}
                  profile={accessProfile}
                />
              </>
            )}
          </TabsContent>

          <TabsContent className="p-3" value="publish">
            {publishSlot}
          </TabsContent>
        </Tabs>
      ) : null}

      {state === "ready" && tab === "share" && onCopyLink ? (
        <div className="flex items-center justify-end border-t border-line px-3 py-2">
          <Button onClick={onCopyLink} size="sm" variant="secondary">
            <Link2 aria-hidden="true" className="size-3.5" />
            Copy link
          </Button>
        </div>
      ) : null}
    </div>
  );
}
