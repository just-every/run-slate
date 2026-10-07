import { AlertTriangle, Check } from "lucide-react";
import { Badge, Button } from "../../../ui";
import { SettingsSection } from "./SettingsSection";
import { memberNoun } from "./nouns";
import type { IdentityProviderStatus } from "./types";

/**
 * `WORK-015` — magic-link sign-in always works; an identity provider is an
 * optional second way in. An unconfigured or failing provider leaves the magic
 * link working and says which is unavailable.
 *
 * There is no password, no security question and no recovery path, because no
 * password is stored: the mailbox is the credential. This pane states that
 * rather than offering a recovery link that could not exist.
 */
export function IdentityProviderSection({
  status,
  onConfigure,
  onRemove,
  canAdminister,
  className,
}: {
  status: IdentityProviderStatus;
  onConfigure: () => void;
  onRemove: () => void;
  canAdminister: boolean;
  className?: string;
}) {
  return (
    <SettingsSection
      className={className}
      description="How people get into this workspace."
      title="Sign-in"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-card border border-line bg-sidebar p-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-ui font-medium text-ink">
            <Check aria-hidden="true" className="size-4 text-good" />
            Magic link
            <Badge tone="good">Always available</Badge>
          </p>
          <p className="mt-0.5 max-w-reading text-ui text-ink-muted">
            A sign-in link is sent to the address on the invitation. This never switches off, whatever else is
            configured.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3 rounded-card border border-line p-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-ui font-medium text-ink">
            {status.state === "failing" ? (
              <AlertTriangle aria-hidden="true" className="size-4 text-warn" />
            ) : null}
            {status.providerName ?? "Identity provider"}
            <Badge tone={status.state === "working" ? "good" : status.state === "failing" ? "warn" : "neutral"}>
              {status.state === "working"
                ? "Available"
                : status.state === "failing"
                  ? "Unavailable"
                  : "Not configured"}
            </Badge>
          </p>
          <p className="mt-0.5 max-w-reading text-ui text-ink-muted">
            {status.state === "not-configured"
              ? "No identity provider is configured. Everyone signs in by magic link, which is working."
              : status.state === "failing"
                ? `${status.failureReason ?? "The provider is not answering."} Magic-link sign-in is working, so no one is locked out.`
                : `Signing in through ${status.providerName ?? "the provider"} creates no ${memberNoun} who was not invited or allow-listed.`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button disabled={!canAdminister} onClick={onConfigure} variant="secondary">
            {status.state === "not-configured" ? "Configure a provider" : "Reconfigure"}
          </Button>
          {status.state === "not-configured" ? null : (
            <Button disabled={!canAdminister} onClick={onRemove} variant="ghost">
              Remove
            </Button>
          )}
        </div>
      </div>

      <div className="max-w-reading rounded-card border border-line bg-sidebar px-3 py-2">
        <p className="text-ui font-medium text-ink">There is no password to recover</p>
        <p className="mt-0.5 text-ui text-ink-muted">
          Slate stores no password and asks no security question, so there is no recovery path to offer. Access to the
          mailbox is the credential, and an identity provider is the only alternative to it. A {memberNoun} who has
          lost their mailbox is invited again at a new address; that is a new invitation, not a recovery, and it
          restores none of their old sessions.
        </p>
      </div>
    </SettingsSection>
  );
}
