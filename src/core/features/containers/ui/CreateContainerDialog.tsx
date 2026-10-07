import { useId, useState } from "react";
import type { ContainerVisibility } from "../../../shared/knowledge/model";
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
import { ContainerVisibilitySelect } from "./ContainerVisibilitySelect";
import { containerNoun, sentenceCase } from "./nouns";
import type { ContainerPurpose } from "./types";

export interface CreateContainerDraft {
  icon: string;
  name: string;
  description: string;
  key: string;
  visibility: ContainerVisibility;
  purposeId: string | null;
}

export interface CreateContainerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** CONT-002 — a purpose supplies default values only. */
  purposes: readonly ContainerPurpose[];
  iconChoices: readonly string[];
  submitting?: boolean;
  onSubmit: (draft: CreateContainerDraft) => void;
}

const emptyDraft: CreateContainerDraft = {
  icon: "",
  name: "",
  description: "",
  key: "",
  visibility: "default",
  purposeId: null,
};

/** CONT-002 — icon, name, description, an optional key, a visibility and a purpose. */
export function CreateContainerDialog({
  open,
  onOpenChange,
  purposes,
  iconChoices,
  submitting = false,
  onSubmit,
}: CreateContainerDialogProps) {
  const ids = useId();
  const [draft, setDraft] = useState<CreateContainerDraft>({ ...emptyDraft, icon: iconChoices[0] ?? "" });

  function applyPurpose(purposeId: string) {
    const purpose = purposes.find((candidate) => candidate.id === purposeId);
    if (!purpose) return;
    setDraft((current) => ({
      ...current,
      purposeId,
      visibility: purpose.visibility,
      description: current.description || purpose.description,
    }));
  }

  const selectedPurpose = purposes.find((candidate) => candidate.id === draft.purposeId) ?? null;

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>New {containerNoun}</DialogTitle>
          <DialogDescription>
            A {containerNoun} holds one page tree and the grants every page in it inherits.
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit({ ...draft, name: draft.name.trim(), key: draft.key.trim() });
          }}
        >
          <fieldset className="flex flex-col gap-1.5">
            <Label htmlFor={`${ids}-name`}>Icon and name</Label>
            <div className="flex gap-1.5">
              <label className="sr-only" htmlFor={`${ids}-icon`}>
                Icon
              </label>
              <select
                className="h-8 rounded-control border border-line-strong bg-surface px-2 text-ui text-ink"
                id={`${ids}-icon`}
                onChange={(event) => setDraft({ ...draft, icon: event.target.value })}
                value={draft.icon}
              >
                {iconChoices.map((icon) => (
                  <option key={icon} value={icon}>
                    {icon}
                  </option>
                ))}
              </select>
              <Input
                className="flex-1"
                id={`${ids}-name`}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                placeholder={`Name this ${containerNoun}`}
                required
                value={draft.name}
              />
            </div>
          </fieldset>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${ids}-description`}>Description</Label>
            <Textarea
              id={`${ids}-description`}
              onChange={(event) => setDraft({ ...draft, description: event.target.value })}
              placeholder="What the team keeps here"
              rows={3}
              value={draft.description}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${ids}-key`}>Key (optional)</Label>
            <Input
              aria-describedby={`${ids}-key-help`}
              id={`${ids}-key`}
              onChange={(event) => setDraft({ ...draft, key: event.target.value.toUpperCase() })}
              placeholder="ENG"
              value={draft.key}
            />
            <p className="text-tiny text-ink-muted" id={`${ids}-key-help`}>
              A short prefix for readable addresses. Leave it empty and one is not used.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${ids}-purpose`}>Purpose</Label>
            <Select onValueChange={applyPurpose} value={draft.purposeId ?? ""}>
              <SelectTrigger id={`${ids}-purpose`}>
                <SelectValue placeholder="Start from scratch" />
              </SelectTrigger>
              <SelectContent>
                {purposes.map((purpose) => (
                  <SelectItem key={purpose.id} value={purpose.id}>
                    {purpose.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-tiny text-ink-muted">
              A purpose only sets this form&rsquo;s defaults. It creates no second kind of {containerNoun}, and
              everything it filled in stays editable here and afterwards.
              {selectedPurpose ? ` ${sentenceCase(selectedPurpose.defaultsSummary)}` : ""}
            </p>
          </div>

          <ContainerVisibilitySelect
            id={`${ids}-visibility`}
            onChange={(visibility) => setDraft({ ...draft, visibility })}
            value={draft.visibility}
            values={["default", "open", "closed", "private"]}
          />

          <DialogFooter>
            <Button onClick={() => onOpenChange(false)} type="button" variant="ghost">
              Cancel
            </Button>
            <Button disabled={submitting || !draft.name.trim()} type="submit">
              {submitting ? "Creating…" : `Create ${containerNoun}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
