import { ChevronDown, CornerDownLeft, Sparkles } from "lucide-react";
import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Separator,
} from "../../../ui";
import { AiAnswerBoundaryNote } from "./AiAnswerBoundaryNote";
import { AiRunStatus } from "./AiRunStatus";
import {
  aiWritingActionIds,
  aiWritingActionLabel,
  type AiResultDisposition,
  type AiRunState,
  type AiWritingActionId,
} from "./types";

/**
 * `AI-017` — the surface that appears over a selection. Two things about it are
 * contract, not taste. The selection is shown beside the result rather than
 * replaced by it, so a member is comparing rather than trusting; and all four
 * dispositions are offered as equal buttons, because nothing changes until one
 * is chosen and the surface must not imply that replace is the expected answer.
 *
 * Translate and change tone need a second choice, and take it in a menu, the way
 * the reference nests them under a writing-actions submenu.
 */
const menuActions: readonly AiWritingActionId[] = ["translate", "change-tone"];
const plainActions = aiWritingActionIds.filter((id) => !menuActions.includes(id));

export interface AiWritingActionsProps {
  /** The text the member has selected. Always shown; never inferred. */
  selectionText: string;
  instruction: string;
  onInstructionChange: (value: string) => void;
  onRunInstruction: () => void;
  onRunAction: (action: AiWritingActionId) => void;
  /** Offered under Translate. */
  languages?: readonly string[];
  onTranslate?: (language: string) => void;
  /** Offered under Change tone. */
  tones?: readonly string[];
  onChangeTone?: (tone: string) => void;
  /** The run behind the result, so a member can cancel it. */
  runState?: AiRunState | null;
  onCancelRun?: () => void;
  /** Null until a run produces something. Nothing has changed while this is shown. */
  result?: string | null;
  /** What produced the result, for the header of the result block. */
  resultActionLabel?: string | null;
  onDisposition: (disposition: AiResultDisposition) => void;
  providerLabel?: string | null;
  className?: string;
}

export function AiWritingActions({
  selectionText,
  instruction,
  onInstructionChange,
  onRunInstruction,
  onRunAction,
  languages = [],
  onTranslate,
  tones = [],
  onChangeTone,
  runState = null,
  onCancelRun,
  result = null,
  resultActionLabel,
  onDisposition,
  providerLabel,
  className,
}: AiWritingActionsProps) {
  return (
    <section
      aria-labelledby="ai-writing-actions-heading"
      className={cn("w-full max-w-reading rounded-card border border-line bg-surface shadow-[0_16px_48px_rgb(15_15_15/0.12)]", className)}
    >
      <div className="border-b border-line px-3 py-2">
        <h2 className="flex items-center gap-1.5 text-ui font-medium text-ink" id="ai-writing-actions-heading">
          <Sparkles aria-hidden="true" className="size-4 text-ink-faint" />
          Write with AI
        </h2>
        <p className="mt-1 text-micro font-medium text-ink-faint">Your selection</p>
        <blockquote className="mt-0.5 border-l-2 border-line-strong pl-2 text-tiny whitespace-pre-wrap text-ink-muted">
          {selectionText}
        </blockquote>
      </div>

      {result === null ? (
        <div className="flex flex-col gap-3 p-3">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (instruction.trim().length > 0) onRunInstruction();
            }}
          >
            <label className="text-micro font-medium text-ink-faint" htmlFor="ai-writing-instruction">
              Or tell it what to do
            </label>
            <div className="mt-1 flex items-center gap-2">
              <Input
                id="ai-writing-instruction"
                onChange={(event) => onInstructionChange(event.target.value)}
                placeholder="Rewrite this for a new joiner"
                value={instruction}
              />
              <Button disabled={instruction.trim().length === 0} size="sm" type="submit">
                <CornerDownLeft aria-hidden="true" className="size-3.5" />
                Run
              </Button>
            </div>
          </form>

          <Separator />

          <div className="flex flex-wrap gap-1.5">
            {plainActions.map((action) => (
              <Button key={action} onClick={() => onRunAction(action)} size="sm" variant="secondary">
                {aiWritingActionLabel[action]}
              </Button>
            ))}
            {languages.length > 0 && onTranslate ? (
              <ChoiceMenu label={aiWritingActionLabel.translate} onSelect={onTranslate} options={languages} />
            ) : null}
            {tones.length > 0 && onChangeTone ? (
              <ChoiceMenu label={aiWritingActionLabel["change-tone"]} onSelect={onChangeTone} options={tones} />
            ) : null}
          </div>

          {runState && runState !== "completed" ? (
            <AiRunStatus onCancel={onCancelRun} state={runState} />
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-3 p-3">
          <div>
            <p className="text-micro font-medium text-ink-faint">
              {resultActionLabel ? `Result — ${resultActionLabel}` : "Result"}
            </p>
            <p className="mt-1 rounded-control bg-good-soft px-2.5 py-2 text-body whitespace-pre-wrap text-ink">
              {result}
            </p>
          </div>

          <p className="text-tiny font-medium text-ink">Nothing has changed yet. Choose one:</p>
          <div className="flex flex-wrap gap-1.5">
            <Button onClick={() => onDisposition("replace")} size="sm">
              Replace selection
            </Button>
            <Button onClick={() => onDisposition("insert-below")} size="sm" variant="secondary">
              Insert below
            </Button>
            <Button onClick={() => onDisposition("refine")} size="sm" variant="secondary">
              Refine
            </Button>
            <Button onClick={() => onDisposition("discard")} size="sm" variant="ghost">
              Discard
            </Button>
          </div>

          <AiAnswerBoundaryNote providerLabel={providerLabel} />
        </div>
      )}
    </section>
  );
}

function ChoiceMenu({
  label,
  options,
  onSelect,
}: {
  label: string;
  options: readonly string[];
  onSelect: (option: string) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`${label} — choose an option`}
        className="inline-flex h-7 items-center gap-1 rounded-control border border-line-strong bg-surface px-2 text-tiny font-medium text-ink transition-colors hover:bg-sidebar-hover"
      >
        {label}
        <ChevronDown aria-hidden="true" className="size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-44">
        {options.map((option) => (
          <DropdownMenuItem key={option} onSelect={() => onSelect(option)}>
            {option}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
