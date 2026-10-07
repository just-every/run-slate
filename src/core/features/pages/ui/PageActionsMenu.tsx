import {
  Archive,
  BarChart3,
  Copy,
  CornerUpRight,
  Download,
  History,
  Link2,
  MonitorPlay,
  MoreHorizontal,
  Send,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Button, cn, DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from "../../../ui";
import type { KnowledgePolicyProfile } from "../../../shared/knowledge/policies";
import { pageTypefaces, type PageDisplaySettings, type PageTypeface } from "./types";

export interface PageActionsCallbacks {
  onCopyLink: () => void;
  onDuplicate: () => void;
  onMoveTo: () => void;
  onArchive: () => void;
  onMoveToTrash: () => void;
  onPresent: () => void;
  onImport: () => void;
  onExport: () => void;
  onAnalytics: () => void;
  onVersionHistory: () => void;
  onPublish?: () => void;
  onCloseDraft?: () => void;
  onDiscardDraft?: () => void;
}

/**
 * The page overflow menu.
 *
 * `LIFE-006` decides its top section. Under `always-live` the publish action and
 * its companions are absent entirely — not disabled, not hidden behind a tooltip.
 * Under `draft-then-publish` a draft page carries publish, close draft and
 * discard draft (`LIFE-007`), and discarding moves the page to trash.
 */
export function PageActionsMenu({
  lifecycleProfile,
  isDraft = false,
  display,
  canEdit = false,
  onTypefaceChange,
  onSmallTextChange,
  onFullWidthChange,
  actions,
  defaultOpen = false,
  className,
}: {
  lifecycleProfile: KnowledgePolicyProfile["page.lifecycle.v1"];
  isDraft?: boolean;
  display: PageDisplaySettings;
  canEdit?: boolean;
  onTypefaceChange: (typeface: PageTypeface) => void;
  onSmallTextChange: (next: boolean) => void;
  onFullWidthChange: (next: boolean) => void;
  actions: PageActionsCallbacks;
  /** Opens the menu on mount, for a surface that renders it already open. */
  defaultOpen?: boolean;
  className?: string;
}) {
  const draftActions = lifecycleProfile === "draft-then-publish" && isDraft;

  return (
    <DropdownMenu defaultOpen={defaultOpen}>
      <DropdownMenuTrigger asChild>
        <Button aria-label="Page actions" className={className} size="icon" variant="ghost">
          <MoreHorizontal aria-hidden="true" className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {draftActions ? (
          <>
            {actions.onPublish ? (
              <DropdownMenuItem onSelect={actions.onPublish}>
                <Send aria-hidden="true" className="size-4" />
                Publish
              </DropdownMenuItem>
            ) : null}
            {actions.onCloseDraft ? (
              <DropdownMenuItem onSelect={actions.onCloseDraft}>
                <X aria-hidden="true" className="size-4" />
                Close draft
              </DropdownMenuItem>
            ) : null}
            {actions.onDiscardDraft ? (
              <DropdownMenuItem onSelect={actions.onDiscardDraft}>
                <Trash2 aria-hidden="true" className="size-4" />
                Discard draft
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
          </>
        ) : null}

        <DropdownMenuLabel>Typeface</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          onValueChange={(value) => onTypefaceChange(value as PageTypeface)}
          value={display.typeface}
        >
          {pageTypefaces.map((typeface) => (
            <DropdownMenuRadioItem disabled={!canEdit} key={typeface.id} value={typeface.id}>
              <span aria-hidden="true" className={cn(typeface.className, "w-6 text-ui")}>
                {typeface.sample}
              </span>
              {typeface.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />

        <DropdownMenuCheckboxItem
          checked={display.smallText}
          disabled={!canEdit}
          onCheckedChange={onSmallTextChange}
        >
          Small text
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={display.fullWidth}
          disabled={!canEdit}
          onCheckedChange={onFullWidthChange}
        >
          Full width
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />

        <DropdownMenuItem onSelect={actions.onCopyLink} shortcut="⌘L">
          <Link2 aria-hidden="true" className="size-4" />
          Copy link
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={actions.onDuplicate} shortcut="⌘D">
          <Copy aria-hidden="true" className="size-4" />
          Duplicate
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={actions.onMoveTo}>
          <CornerUpRight aria-hidden="true" className="size-4" />
          Move to
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={actions.onPresent}>
          <MonitorPlay aria-hidden="true" className="size-4" />
          Present
        </DropdownMenuItem>
        <DropdownMenuSeparator />

        <DropdownMenuItem onSelect={actions.onVersionHistory}>
          <History aria-hidden="true" className="size-4" />
          Version history
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={actions.onAnalytics}>
          <BarChart3 aria-hidden="true" className="size-4" />
          Updates and analytics
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={actions.onImport}>
          <Upload aria-hidden="true" className="size-4" />
          Import
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={actions.onExport}>
          <Download aria-hidden="true" className="size-4" />
          Export
        </DropdownMenuItem>
        <DropdownMenuSeparator />

        <DropdownMenuItem onSelect={actions.onArchive}>
          <Archive aria-hidden="true" className="size-4" />
          Archive
        </DropdownMenuItem>
        <DropdownMenuItem className="text-danger" onSelect={actions.onMoveToTrash}>
          <Trash2 aria-hidden="true" className="size-4" />
          Move to trash
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
