import { Lock } from "lucide-react";
import type { FormEvent } from "react";
import { knowledgeNoun } from "../../../shared/knowledge/vocabulary";
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  cn,
} from "../../../ui";
import { DecisionCitationsField } from "./DecisionCitationsField";
import { DecisionOptionsField } from "./DecisionOptionsField";
import type { DecisionDraft, DecisionPerson, DecisionState } from "./types";

/**
 * `DEC-006` — a proposed decision is editable; accepting ends that.
 *
 * Design decision: the two halves of the clause are made visible rather than
 * implied. Every change writes a revision, so the form says so; resubmitting an
 * unchanged proposal writes no revision, so an unchanged draft disables the save
 * button and the button itself says why. Once the decision is not Proposed the
 * form is not rendered at all — `DEC-003` governs from then on and there is
 * nothing here to disable.
 */
export interface DecisionEditorProps {
  /** Only `proposed` renders the form. */
  state: DecisionState;
  draft: DecisionDraft;
  onDraftChange: (draft: DecisionDraft) => void;
  /** The people who may own the decision. */
  owners: readonly DecisionPerson[];
  /** False when the draft matches the saved proposal. */
  dirty: boolean;
  onSubmit: () => void;
  onCancel?: () => void;
  onAddOption: () => void;
  onRemoveOption: (id: string) => void;
  onAddCitation: () => void;
  onRemoveCitation: (id: string) => void;
  busy?: boolean;
  className?: string;
}

export function DecisionEditor({
  state,
  draft,
  onDraftChange,
  owners,
  dirty,
  onSubmit,
  onCancel,
  onAddOption,
  onRemoveOption,
  onAddCitation,
  onRemoveCitation,
  busy = false,
  className,
}: DecisionEditorProps) {
  if (state !== "proposed") {
    return (
      <div className={cn("flex items-start gap-2 rounded-card border border-line bg-sidebar p-3", className)} role="note">
        <Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-ink-faint" />
        <p className="text-ui text-ink-muted">
          This decision is no longer editable. Its content and the revisions it cites are frozen; change it by
          superseding it with another decision.
        </p>
      </div>
    );
  }

  const patch = (next: Partial<DecisionDraft>) => onDraftChange({ ...draft, ...next });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <form className={cn("flex flex-col gap-4", className)} onSubmit={handleSubmit}>
      <p className="text-tiny text-ink-muted">
        Each change writes a revision that keeps the previous content with its actor and time. Resubmitting an unchanged
        proposal writes no revision.
      </p>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="decision-question">Question</Label>
        <Input
          id="decision-question"
          onChange={(event) => patch({ question: event.target.value })}
          value={draft.question}
        />
      </div>

      <DecisionOptionsField
        disabled={busy}
        onAddOption={onAddOption}
        onChangeOptionNote={(id, note) =>
          patch({ options: draft.options.map((option) => (option.id === id ? { ...option, note } : option)) })
        }
        onChangeOptionTitle={(id, title) =>
          patch({ options: draft.options.map((option) => (option.id === id ? { ...option, title } : option)) })
        }
        onChooseOption={(id) =>
          patch({ options: draft.options.map((option) => ({ ...option, chosen: option.id === id })) })
        }
        onRemoveOption={onRemoveOption}
        options={draft.options}
      />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="decision-outcome">Outcome</Label>
        <Input
          id="decision-outcome"
          onChange={(event) => patch({ outcome: event.target.value })}
          value={draft.outcome}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="decision-rationale">Rationale</Label>
        <Textarea
          className="min-h-28"
          id="decision-rationale"
          onChange={(event) => patch({ rationale: event.target.value })}
          value={draft.rationale}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="decision-owner">Owner</Label>
        <Select onValueChange={(ownerId) => patch({ ownerId })} value={draft.ownerId}>
          <SelectTrigger className="w-full" id="decision-owner">
            <SelectValue placeholder={`Choose the ${knowledgeNoun("member")} who owns this decision`} />
          </SelectTrigger>
          <SelectContent>
            {owners.map((owner) => (
              <SelectItem key={owner.id} value={owner.id}>
                {owner.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="decision-decided-at">Decided date</Label>
          <Input
            id="decision-decided-at"
            onChange={(event) => patch({ decidedAt: event.target.value })}
            type="date"
            value={draft.decidedAt}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="decision-review-at">Review date</Label>
          <Input
            id="decision-review-at"
            onChange={(event) => patch({ reviewAt: event.target.value })}
            type="date"
            value={draft.reviewAt}
          />
          <p className="text-tiny text-ink-faint">Optional. Leave it empty for no review.</p>
        </div>
      </div>

      <DecisionCitationsField
        citations={draft.citations}
        disabled={busy}
        onAddCitation={onAddCitation}
        onRemoveCitation={onRemoveCitation}
      />

      <p className="text-tiny text-ink-muted">
        Any {knowledgeNoun("member")} with edit access on this page can change a proposed decision. Accepting the
        decision ends editing.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={busy || !dirty} type="submit" variant="primary">
          {dirty ? (busy ? "Saving…" : "Save changes") : "No changes — nothing to save"}
        </Button>
        {onCancel ? (
          <Button disabled={busy} onClick={onCancel} variant="secondary">
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
