import { AlertTriangle, Loader2, Lock, Pencil } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "../../../ui";
import { knowledgeNoun } from "../../../shared/knowledge/vocabulary";
import { PublishPreviewCard } from "./PublishPreviewCard";
import type { PublishAsOption, PublishPreview, SubmitState, VersionProfile } from "./types";

export interface PublishDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Where the page will sit once published, as a readable path. */
  location: string;
  onEditLocation: () => void;
  generalAccessLabel: string;
  generalAccessDescription: string;
  onEditGeneralAccess: () => void;
  /** `REV-007`: the version-comment field exists only under `labelled`. */
  versionProfile: VersionProfile;
  versionComment: string;
  onVersionCommentChange: (value: string) => void;
  /** A local datetime value, or null to publish immediately. */
  schedule: string | null;
  onScheduleChange: (value: string | null) => void;
  publishAsOptions: readonly PublishAsOption[];
  publishAs: string | null;
  onPublishAsChange: (value: string | null) => void;
  preview: PublishPreview;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  state: SubmitState;
  errorMessage?: string;
  onPublish: () => void;
}

/** `LIFE-003` — publish takes a location, a general access setting, an optional version
 * comment, an optional schedule and an optional publish-as attribution, and shows a
 * preview of what readers will see before confirmation. */
export function PublishDialog(props: PublishDialogProps) {
  const { state, expanded, schedule, versionProfile } = props;
  const submitting = state === "submitting";
  const scheduled = schedule !== null;

  return (
    <Dialog onOpenChange={props.onOpenChange} open={props.open}>
      <DialogContent aria-describedby="publish-dialog-description" className="w-[min(34rem,calc(100vw-2rem))]">
        <DialogHeader>
          <DialogTitle>Publish page</DialogTitle>
          <DialogDescription id="publish-dialog-description">
            Publishing puts this page in its {knowledgeNoun("container")} tree, in search and in content
            queries, and writes one version.
          </DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto px-4 py-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="publish-location">Location</Label>
            <div className="flex items-center gap-1">
              <Input
                className="flex-1"
                id="publish-location"
                readOnly
                value={props.location}
              />
              <Button
                aria-label="Change the location"
                onClick={props.onEditLocation}
                size="icon"
                variant="ghost"
              >
                <Pencil aria-hidden="true" className="size-4" />
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <p className="text-tiny font-medium text-ink-muted" id="publish-general-access-label">
              General access
            </p>
            <div className="flex items-center gap-2 rounded-control border border-line px-2.5 py-2">
              <Lock aria-hidden="true" className="size-4 shrink-0 text-ink-faint" />
              <div className="min-w-0 flex-1">
                <p className="text-ui font-medium text-ink">{props.generalAccessLabel}</p>
                <p className="text-tiny text-ink-muted">{props.generalAccessDescription}</p>
              </div>
              <Button
                aria-label="Change general access"
                onClick={props.onEditGeneralAccess}
                size="iconSm"
                variant="ghost"
              >
                <Pencil aria-hidden="true" className="size-4" />
              </Button>
            </div>
          </div>

          {expanded ? (
            <>
              {versionProfile === "labelled" ? (
                <div className="flex flex-col gap-1">
                  <Label htmlFor="publish-version-comment">Version comment</Label>
                  <Textarea
                    id="publish-version-comment"
                    onChange={(event) => props.onVersionCommentChange(event.target.value)}
                    placeholder="Describe this version"
                    value={props.versionComment}
                  />
                </div>
              ) : null}

              <fieldset className="flex flex-col gap-1.5">
                <legend className="text-tiny font-medium text-ink-muted">Schedule publish</legend>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-1.5 text-ui text-ink">
                    <input
                      checked={!scheduled}
                      name="publish-schedule"
                      onChange={() => props.onScheduleChange(null)}
                      type="radio"
                    />
                    Immediately
                  </label>
                  <label className="flex items-center gap-1.5 text-ui text-ink">
                    <input
                      checked={scheduled}
                      name="publish-schedule"
                      onChange={() => props.onScheduleChange(props.schedule ?? "")}
                      type="radio"
                    />
                    At a chosen time
                  </label>
                </div>
                {scheduled ? (
                  <>
                    <Label className="sr-only" htmlFor="publish-schedule-at">
                      Publish at
                    </Label>
                    <Input
                      className="max-w-60"
                      id="publish-schedule-at"
                      onChange={(event) => props.onScheduleChange(event.target.value)}
                      type="datetime-local"
                      value={props.schedule ?? ""}
                    />
                    <p className="text-tiny text-ink-muted">
                      The page stays a draft until then, and nobody else can see it in the meantime.
                    </p>
                  </>
                ) : null}
              </fieldset>

              <div className="flex flex-col gap-1">
                <p className="text-tiny font-medium text-ink-muted" id="publish-as-label">
                  Publish as
                </p>
                <Select
                  onValueChange={(value) => props.onPublishAsChange(value === "__self" ? null : value)}
                  value={props.publishAs ?? "__self"}
                >
                  <SelectTrigger aria-labelledby="publish-as-label" className="max-w-60">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__self">Yourself</SelectItem>
                    {props.publishAsOptions.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          ) : null}

          <PublishPreviewCard preview={props.preview} />

          {state === "error" && props.errorMessage ? (
            <p
              className="flex items-start gap-1.5 rounded-card border border-danger/30 bg-danger-soft p-2.5 text-ui text-danger"
              role="alert"
            >
              <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              {props.errorMessage}
            </p>
          ) : null}
        </div>

        <DialogFooter className="justify-between">
          <Button
            aria-expanded={expanded}
            onClick={() => props.onExpandedChange(!expanded)}
            size="sm"
            variant="ghost"
          >
            {expanded ? "Fewer options" : "More options"}
          </Button>
          <div className="flex items-center gap-2">
            <Button disabled={submitting} onClick={() => props.onOpenChange(false)} variant="secondary">
              Cancel
            </Button>
            <Button disabled={submitting} onClick={props.onPublish}>
              {submitting ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : null}
              {submitting ? "Publishing" : scheduled ? "Schedule publish" : "Publish"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
