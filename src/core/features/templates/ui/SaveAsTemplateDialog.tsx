import { useId } from "react";
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  ErrorState,
  Input,
  Textarea,
} from "../../../ui";
import { containerNoun, pageBodyNoun } from "./nouns";

/** `TMPL-005` — everything saving a page as a template leaves behind. */
const notCopied = [
  "comments",
  "versions",
  "grants",
  "watchers",
  "analytics figures",
  "the status",
  "the public link",
] as const;

/**
 * `TMPL-005` — saving a page as a template copies its body, its properties and,
 * on request, its children. It copies nothing else, and the list of what it
 * leaves behind is on screen before the member commits.
 *
 * `TMPL-006` — the template belongs either to the workspace or to one container.
 */
export function SaveAsTemplateDialog({
  open,
  onOpenChange,
  sourcePageTitle,
  containerName,
  title,
  onTitleChange,
  description,
  onDescriptionChange,
  home,
  onHomeChange,
  childPageCount,
  includeChildren,
  onIncludeChildrenChange,
  onConfirm,
  submitting = false,
  failure,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourcePageTitle: string;
  /** The container the source page sits in — one of the two homes on offer. */
  containerName: string;
  title: string;
  onTitleChange: (next: string) => void;
  description: string;
  onDescriptionChange: (next: string) => void;
  home: "workspace" | "container";
  onHomeChange: (next: "workspace" | "container") => void;
  childPageCount: number;
  includeChildren: boolean;
  onIncludeChildrenChange: (next: boolean) => void;
  onConfirm: () => void;
  submitting?: boolean;
  failure?: string | null;
}) {
  const fieldId = useId();

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent aria-describedby={`${fieldId}-description`}>
        <DialogHeader>
          <DialogTitle>Save as a template</DialogTitle>
          <DialogDescription id={`${fieldId}-description`}>
            Slate copies the {pageBodyNoun} and the properties of &ldquo;{sourcePageTitle}&rdquo;.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 px-4 py-3">
          <div className="flex flex-col gap-1">
            <label className="text-tiny font-medium text-ink-muted" htmlFor={`${fieldId}-title`}>
              Template title
            </label>
            <Input
              id={`${fieldId}-title`}
              onChange={(event) => onTitleChange(event.target.value)}
              placeholder={sourcePageTitle}
              value={title}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-tiny font-medium text-ink-muted" htmlFor={`${fieldId}-description`}>
              Description
            </label>
            <Textarea
              id={`${fieldId}-description`}
              onChange={(event) => onDescriptionChange(event.target.value)}
              placeholder="What this template is for, in a line."
              value={description}
            />
          </div>

          <fieldset className="flex flex-col gap-1.5">
            <legend className="text-tiny font-medium text-ink-muted">Where it lives</legend>
            <label className="flex items-start gap-2 text-ui text-ink">
              <input
                checked={home === "workspace"}
                className="mt-1 accent-accent"
                name={`${fieldId}-home`}
                onChange={() => onHomeChange("workspace")}
                type="radio"
              />
              <span>
                This workspace
                <span className="block text-tiny text-ink-muted">Offered in every {containerNoun}.</span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-ui text-ink">
              <input
                checked={home === "container"}
                className="mt-1 accent-accent"
                name={`${fieldId}-home`}
                onChange={() => onHomeChange("container")}
                type="radio"
              />
              <span>
                {containerName}
                <span className="block text-tiny text-ink-muted">
                  Offered first inside this {containerNoun} and offered nowhere else.
                </span>
              </span>
            </label>
          </fieldset>

          {childPageCount > 0 ? (
            <label className="flex items-start gap-2 text-ui text-ink">
              <Checkbox
                checked={includeChildren}
                className="mt-0.5"
                id={`${fieldId}-children`}
                onCheckedChange={(next) => onIncludeChildrenChange(next === true)}
              />
              <span>
                Copy the {childPageCount} child {childPageCount === 1 ? "page" : "pages"} too
              </span>
            </label>
          ) : (
            <p className="text-ui text-ink-muted">This page has no child pages to copy.</p>
          )}

          <div className="rounded-card border border-line bg-sidebar px-3 py-2">
            <p className="text-ui font-medium text-ink">What the template does not carry</p>
            <p className="mt-1 text-ui text-ink-muted">
              A template holds no {listPhrase(notCopied)}. A page created from it starts with none of them.
            </p>
          </div>

          {failure ? <ErrorState detail={failure} title="Slate could not save the template." /> : null}
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant="secondary">
            Cancel
          </Button>
          <Button disabled={submitting || title.trim().length === 0} onClick={onConfirm}>
            {submitting ? "Saving the template…" : "Save the template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function listPhrase(items: readonly string[]): string {
  if (items.length < 2) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
