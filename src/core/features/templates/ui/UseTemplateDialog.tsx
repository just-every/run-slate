import { useId } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  ErrorState,
  Input,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "../../../ui";
import { containerNoun } from "./nouns";
import type { TemplateDestination } from "./types";

/**
 * `TMPL-003` — using a template creates a page in the destination the member
 * chose, holding a copy of the template's body, properties and children.
 *
 * The copy is a snapshot: this dialog says so before the member commits,
 * because nothing later in the product will.
 */
export function UseTemplateDialog({
  open,
  onOpenChange,
  templateTitle,
  destinations,
  destinationId,
  onDestinationChange,
  pageTitle,
  onPageTitleChange,
  onConfirm,
  submitting = false,
  failure,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateTitle: string;
  destinations: readonly TemplateDestination[];
  destinationId: string | null;
  onDestinationChange: (destinationId: string) => void;
  /** The title of the page about to be created. */
  pageTitle: string;
  onPageTitleChange: (next: string) => void;
  onConfirm: () => void;
  submitting?: boolean;
  failure?: string | null;
}) {
  const titleId = useId();
  const destinationLabelId = `${titleId}-destination`;
  const groups = groupByContainer(destinations);

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent aria-describedby={`${titleId}-description`}>
        <DialogHeader>
          <DialogTitle>Use &ldquo;{templateTitle}&rdquo;</DialogTitle>
          <DialogDescription id={`${titleId}-description`}>
            Slate copies this template&rsquo;s body, its properties and its child pages into the destination you
            choose.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 px-4 py-3">
          <div className="flex flex-col gap-1">
            <label className="text-tiny font-medium text-ink-muted" htmlFor={titleId}>
              Page title
            </label>
            <Input
              id={titleId}
              onChange={(event) => onPageTitleChange(event.target.value)}
              placeholder={templateTitle}
              value={pageTitle}
            />
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-tiny font-medium text-ink-muted" id={destinationLabelId}>
              Destination
            </span>
            <Select onValueChange={onDestinationChange} value={destinationId ?? undefined}>
              <SelectTrigger aria-labelledby={destinationLabelId}>
                <SelectValue placeholder="Choose where the page is created" />
              </SelectTrigger>
              <SelectContent>
                {groups.map((group) => (
                  <SelectGroup key={group.containerName}>
                    <SelectLabel>
                      {group.containerName} {containerNoun}
                    </SelectLabel>
                    {group.destinations.map((destination) => (
                      <SelectItem key={destination.id} value={destination.id}>
                        {destination.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>

          <p className="rounded-card border border-line bg-sidebar px-3 py-2 text-ui text-ink-muted">
            The new page is a snapshot taken now. Editing, archiving or deleting this template afterwards changes
            nothing about the page you are creating.
          </p>

          {failure ? <ErrorState detail={failure} title="Slate could not create the page." /> : null}
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant="secondary">
            Cancel
          </Button>
          <Button disabled={submitting || destinationId === null} onClick={onConfirm}>
            {submitting ? "Creating the page…" : "Create the page"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function groupByContainer(
  destinations: readonly TemplateDestination[],
): Array<{ containerName: string; destinations: TemplateDestination[] }> {
  const groups: Array<{ containerName: string; destinations: TemplateDestination[] }> = [];
  for (const destination of destinations) {
    const existing = groups.find((group) => group.containerName === destination.containerName);
    if (existing) existing.destinations.push(destination);
    else groups.push({ containerName: destination.containerName, destinations: [destination] });
  }
  return groups;
}
