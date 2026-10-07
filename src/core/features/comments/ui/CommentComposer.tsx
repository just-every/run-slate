import { AtSign, Lock, Paperclip, SendHorizontal } from "lucide-react";
import { useId, useState } from "react";
import type { AccessLevel } from "../../../shared/knowledge/model";
import { Button, Textarea, cn } from "../../../ui";
import { memberNoun, sentenceCase } from "./nouns";
import { canComment } from "./types";

export interface CommentComposerProps {
  /** SHARE-002 — the acting member's level on the page. */
  viewerAccess: AccessLevel;
  placeholder: string;
  submitLabel?: string;
  onSubmit: (body: string) => void | Promise<void>;
  /** COMM-003 — mentioning opens the member picker; it never lists anyone who cannot read the page. */
  onMention: () => void;
  onAttach: () => void;
  autoFocus?: boolean;
  className?: string;
}

/**
 * The composer at the foot of a thread and of the discussions panel. With less than
 * `comment` access it is disabled and says why (`SHARE-002`, `COMM-001`).
 */
export function CommentComposer({
  viewerAccess,
  placeholder,
  submitLabel = "Send comment",
  onSubmit,
  onMention,
  onAttach,
  autoFocus,
  className,
}: CommentComposerProps) {
  const fieldId = useId();
  const explanationId = `${fieldId}-explanation`;
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const allowed = canComment(viewerAccess);

  if (!allowed) {
    return (
      <p
        className={cn(
          "flex items-start gap-2 rounded-control border border-line bg-sidebar px-3 py-2 text-tiny text-ink-muted",
          className,
        )}
        id={explanationId}
      >
        <Lock aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-ink-faint" />
        <span>
          You have view access to this page, so you can read the discussion but not add to it.{" "}
          {sentenceCase(memberNoun)}s need comment access or more to reply, react or open a thread. Ask
          someone with full access to change your access.
        </span>
      </p>
    );
  }

  return (
    <form
      className={cn("rounded-control border border-line bg-surface focus-within:border-accent", className)}
      onSubmit={async (event) => {
        event.preventDefault();
        const trimmed = body.trim();
        if (!trimmed || sending) return;
        setSending(true);
        setFailure(null);
        try {
          await onSubmit(trimmed);
          setBody("");
        } catch (error) {
          setFailure(error instanceof Error ? error.message : "The comment could not be sent");
        } finally {
          setSending(false);
        }
      }}
    >
      <label className="sr-only" htmlFor={fieldId}>
        {placeholder}
      </label>
      <Textarea
        autoFocus={autoFocus}
        disabled={sending}
        className="min-h-9 resize-none border-0 bg-transparent px-2.5 py-2 focus-visible:outline-none"
        id={fieldId}
        onChange={(event) => setBody(event.target.value)}
        placeholder={placeholder}
        rows={2}
        value={body}
      />
      {failure ? <p role="alert" className="px-2.5 py-2 text-tiny text-danger">Not sent: {failure}. Your draft is kept here; send again to retry.</p> : null}
      <div className="flex items-center gap-1 border-t border-line px-1.5 py-1">
        <Button aria-label={`Mention a ${memberNoun}`} onClick={onMention} size="iconSm" type="button" variant="ghost">
          <AtSign aria-hidden="true" className="size-4" />
        </Button>
        <Button aria-label="Attach a file" onClick={onAttach} size="iconSm" type="button" variant="ghost">
          <Paperclip aria-hidden="true" className="size-4" />
        </Button>
        <Button
          aria-label={sending ? "Sending comment" : submitLabel}
          className="ml-auto"
          disabled={sending || !body.trim()}
          size="iconSm"
          type="submit"
          variant="primary"
        >
          <SendHorizontal aria-hidden="true" className="size-3.5" />
        </Button>
      </div>
    </form>
  );
}
