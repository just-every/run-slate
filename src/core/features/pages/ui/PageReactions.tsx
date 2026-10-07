import { SmilePlus } from "lucide-react";
import { Button, cn, Popover, PopoverContent, PopoverTrigger } from "../../../ui";
import type { PageReaction } from "./types";

/**
 * `PAGE-014` — emoji reactions on a page. A reaction shows who reacted, is not a
 * notification and is not counted in analytics, so nothing here reports a count
 * anywhere but on the chip itself.
 */
const reactionChoices = ["👍", "🎉", "👀", "✅", "❤️", "🙏", "🔥", "💡"] as const;

export function PageReactions({
  reactions,
  canReact = false,
  onToggleReaction,
  className,
}: {
  reactions: readonly PageReaction[];
  canReact?: boolean;
  onToggleReaction?: (emoji: string) => void;
  className?: string;
}) {
  if (reactions.length === 0 && !canReact) return null;

  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)}>
      {reactions.map((reaction) => {
        const names = reaction.people.map((person) => person.name).join(", ");
        return (
          <button
            aria-label={`${reaction.emoji} — ${names}. ${reaction.reactedByViewer ? "Remove your reaction" : "Add your reaction"}`}
            aria-pressed={reaction.reactedByViewer}
            className={cn(
              "inline-flex h-6 items-center gap-1 rounded-control border px-1.5 text-tiny transition-colors",
              reaction.reactedByViewer
                ? "border-accent bg-accent-soft text-accent"
                : "border-line-strong bg-surface text-ink-muted hover:bg-sidebar-hover",
            )}
            disabled={!canReact}
            key={reaction.emoji}
            onClick={() => onToggleReaction?.(reaction.emoji)}
            title={names}
            type="button"
          >
            <span aria-hidden="true">{reaction.emoji}</span>
            {reaction.people.length}
          </button>
        );
      })}

      {canReact ? (
        <Popover>
          <PopoverTrigger asChild>
            <Button aria-label="Add a reaction" size="sm" variant="ghost">
              <SmilePlus aria-hidden="true" className="size-3.5" />
              <span className={reactions.length > 0 ? "sr-only" : undefined}>Add a reaction</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent aria-label="Choose a reaction" className="w-auto p-2">
            <div className="flex gap-1">
              {reactionChoices.map((emoji) => (
                <button
                  aria-label={`React with ${emoji}`}
                  className="inline-flex size-8 items-center justify-center rounded-control text-body hover:bg-sidebar-hover"
                  key={emoji}
                  onClick={() => onToggleReaction?.(emoji)}
                  type="button"
                >
                  <span aria-hidden="true">{emoji}</span>
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
  );
}
