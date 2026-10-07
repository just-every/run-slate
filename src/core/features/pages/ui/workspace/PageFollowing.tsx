import { useState } from "react";
import { useResource } from "../../../../client/useResource";
import {
  mutate,
  operationKey,
  errorMessage,
} from "../../../../client/transport";
export function PageFollowing({ pageId }: { pageId: string }) {
  const resource = useResource<{
    watches: string[];
    favourites: { kind: string; id: string }[];
  }>("/api/navigation");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>();
  async function toggle(kind: "watch" | "favourite", enabled: boolean) {
    setPending(true);
    setError(undefined);
    try {
      await mutate(
        `/api/navigation/${kind === "watch" ? "watches" : "favourites"}`,
        {
          operationKey: operationKey(),
          ...(kind === "watch" ? { pageId } : { id: pageId, kind: "page" }),
          enabled,
        },
        "PUT",
      );
      await resource.reload();window.dispatchEvent(new Event("slate:navigation-changed"));
    } catch (cause) {
      setError(cause);
    } finally {
      setPending(false);
    }
  }
  const favourite =
    resource.data?.favourites.some(
      (item) => item.kind === "page" && item.id === pageId,
    ) ?? false;
  const watched = resource.data?.watches.includes(pageId) ?? false;
  return (
    <section>
      <h3>Keep this close</h3>
      <button
        disabled={pending || !resource.data}
        aria-pressed={favourite}
        onClick={() => void toggle("favourite", !favourite)}
      >
        {favourite ? "Remove from favourites" : "Add to favourites"}
      </button>
      <button
        disabled={pending || !resource.data}
        aria-pressed={watched}
        onClick={() => void toggle("watch", !watched)}
      >
        {watched ? "Stop watching" : "Watch this page"}
      </button>
      {error || resource.error ? (
        <p role="alert">{errorMessage(error || resource.error)}</p>
      ) : null}
    </section>
  );
}
