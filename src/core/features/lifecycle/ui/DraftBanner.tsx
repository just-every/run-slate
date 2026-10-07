import { PencilLine, UserPlus, X } from "lucide-react";
import { knowledgeNoun } from "../../../shared/knowledge/vocabulary";
import { Button } from "../../../ui";
import type { DraftAudienceEntry } from "./types";

function audienceSentence(authorName: string, sharedWith: readonly DraftAudienceEntry[]): string {
  if (sharedWith.length === 0) return `Only you, ${authorName}, can see it.`;
  const names = sharedWith.map((entry) => entry.name);
  if (names.length === 1) return `Only you and ${names[0]} can see it.`;
  if (names.length === 2) return `Only you, ${names[0]} and ${names[1]} can see it.`;
  return `Only you and ${names.length} people you have shared it with can see it.`;
}

/**
 * `LIFE-002` — a draft is private. Rendered only where `page.lifecycle.v1` is
 * `draft-then-publish`; under `always-live` no draft state arises and
 * `PageLifecycleControls` renders nothing from this family.
 */
export function DraftBanner({
  authorName,
  sharedWith,
  onShare,
  onDismiss,
}: {
  authorName: string;
  sharedWith: readonly DraftAudienceEntry[];
  onShare: () => void;
  onDismiss?: () => void;
}) {
  return (
    <div className="flex flex-wrap items-start gap-3 border-b border-line bg-draft-soft px-4 py-2.5 text-draft">
      <PencilLine aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-ui">
          <span className="font-semibold">This page is an unpublished draft.</span>{" "}
          {audienceSentence(authorName, sharedWith)} It stays out of search, out of content queries, out of the
          inbox, out of AI answers and out of every other tree until you publish it.
        </p>
        <p className="text-tiny text-ink-muted">
          Sharing a draft creates a grant in its own share list, exactly like any other grant — every{" "}
          {knowledgeNoun("member")} or guest you share it with still has to sign in, and revoking the grant ends
          their access. A draft has no general access and cannot be opened by the anonymous web.
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button onClick={onShare} size="sm" variant="secondary">
          <UserPlus aria-hidden="true" className="size-3.5" />
          Share draft
        </Button>
        {onDismiss ? (
          <Button aria-label="Hide this draft notice" onClick={onDismiss} size="iconSm" variant="ghost">
            <X aria-hidden="true" className="size-4" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}
