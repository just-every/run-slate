import { MoreHorizontal } from "lucide-react";
import type { PageLifecycle } from "../../../shared/knowledge/model";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../../ui";
import { LifecycleChip } from "./LifecycleChip";
import type { LifecycleProfile } from "./types";

/**
 * `LIFE-006` — the whole lifecycle family is gated on one policy value. Every surface in
 * this feature (the draft banner, the draft chip in the tree, the publish dialog, the
 * scheduled notice, the unpublished-changes bar, the version-comment field and the
 * publish-as selector) is rendered only when this returns true.
 */
export function lifecycleFamilyVisible(lifecycleProfile: LifecycleProfile): boolean {
  return lifecycleProfile === "draft-then-publish";
}

export interface PageLifecycleControlsProps {
  lifecycleProfile: LifecycleProfile;
  state: PageLifecycle;
  /** The save state as the editor reports it, written out. */
  savedLabel: string;
  /** Only meaningful in the `scheduled` state; written out for the reader. */
  scheduledFor?: string | null;
  onPublish: () => void;
  onCloseDraft: () => void;
  onDiscardDraft: () => void;
  onRepublish: () => void;
  onDiscardChanges: () => void;
  onCancelSchedule: () => void;
  onRestoreFromArchive?: () => void;
}

/**
 * The lifecycle cluster in the page header. Under `always-live` it renders nothing at
 * all: no publish action, no modal, no close or discard draft, no draft state and no
 * unpublished-changes state. Under `draft-then-publish` it renders the working path of
 * `LIFE-003` to `LIFE-005`.
 */
export function PageLifecycleControls(props: PageLifecycleControlsProps) {
  if (!lifecycleFamilyVisible(props.lifecycleProfile)) return null;

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <span className="text-tiny text-ink-faint">{props.savedLabel}</span>
      <LifecycleChip
        detail={props.state === "scheduled" ? (props.scheduledFor ?? undefined) : undefined}
        state={props.state}
      />
      <LifecycleActions {...props} />
    </div>
  );
}

function LifecycleActions({
  state,
  onPublish,
  onCloseDraft,
  onDiscardDraft,
  onRepublish,
  onDiscardChanges,
  onCancelSchedule,
  onRestoreFromArchive,
}: PageLifecycleControlsProps) {
  if (state === "draft") {
    return (
      <>
        <Button onClick={onPublish} size="sm">
          Publish…
        </Button>
        <Button onClick={onCloseDraft} size="sm" variant="ghost">
          Close draft
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button aria-label="More draft actions" size="iconSm" variant="ghost">
              <MoreHorizontal aria-hidden="true" className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onDiscardDraft}>Discard draft…</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </>
    );
  }

  if (state === "scheduled") {
    return (
      <Button onClick={onCancelSchedule} size="sm" variant="secondary">
        Cancel schedule
      </Button>
    );
  }

  if (state === "live-with-unpublished-changes") {
    return (
      <>
        <Button onClick={onDiscardChanges} size="sm" variant="ghost">
          Discard changes
        </Button>
        <Button onClick={onRepublish} size="sm">
          Republish
        </Button>
      </>
    );
  }

  if (state === "archived" && onRestoreFromArchive) {
    return (
      <Button onClick={onRestoreFromArchive} size="sm" variant="secondary">
        Restore from archive
      </Button>
    );
  }

  return null;
}
