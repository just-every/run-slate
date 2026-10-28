import { useState } from "react";
import { useWorkspace } from "../../../../app/ui/WorkspaceContext";
import { useResource } from "../../../../client/useResource";
import { RequestState } from "../../../../app/ui/RequestState";
import {
  mutate,
  operationKey,
  errorMessage,
} from "../../../../client/transport";
export interface Reaction {
  id: string;
  commentId: string | null;
  emoji: string;
  memberId: string;
  displayName: string;
}
export function ReactionControls({
  pageId,
  commentId,
  reactions,
  onChanged,
}: {
  pageId: string;
  commentId?: string;
  reactions: Reaction[];
  onChanged: () => void;
}) {
  const { member } = useWorkspace();
  const [emoji, setEmoji] = useState("👍"),
    [pending, setPending] = useState(false),
    [error, setError] = useState<unknown>();
  const current = reactions.filter(
      (reaction) => (reaction.commentId ?? undefined) === commentId,
    ),
    mine = current.some(
      (reaction) => reaction.memberId === member.id && reaction.emoji === emoji,
    );
  return (
    <>
      <ul aria-label="Reactions">
        {current.map((reaction) => (
          <li key={reaction.id}>
            {reaction.emoji} {reaction.displayName}
          </li>
        ))}
      </ul>
      <div className="reaction-controls">
        <label className="reaction-emoji" data-tooltip="Choose reaction">
          <span className="sr-only">Reaction emoji</span>
          <select
            value={emoji}
            onChange={(event) => setEmoji(event.target.value)}
          >
            {["👍", "❤️", "🎉", "💡", "👀", "✅"].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          aria-label={
            emoji === "👍" ? "React with thumbs up" : `React with ${emoji}`
          }
          aria-pressed={mine}
          disabled={pending}
          onClick={async () => {
            setPending(true);
            setError(undefined);
            try {
              await mutate(`/api/comments/page/${pageId}/reaction`, {
                operationKey: operationKey(),
                ...(commentId ? { commentId } : {}),
                emoji,
                remove: mine,
              });
              await onChanged();
            } catch (cause) {
              setError(cause);
            } finally {
              setPending(false);
            }
          }}
        >
          {mine ? "Remove" : "Add"} {emoji}
        </button>
      </div>
      {error ? <p role="alert">{errorMessage(error)}</p> : null}
    </>
  );
}
export function PageReactions({ pageId }: { pageId: string }) {
  const resource = useResource<{ reactions: Reaction[] }>(
    `/api/comments/page/${pageId}`,
  );
  return (
    <section aria-label="Page reactions">
      <RequestState loading={resource.loading} error={resource.error} retry={resource.reload}>
      {resource.data ? (
      <ReactionControls
        pageId={pageId}
        reactions={resource.data.reactions}
        onChanged={resource.reload}
      />
      ) : null}
      </RequestState>
    </section>
  );
}
