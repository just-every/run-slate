import { useEffect, useState } from "react";
import { request, mutate, operationKey } from "./transport";
import type { DocumentView } from "./content";
import type { Resource } from "./useResource";

/** Collaboration reads share the page's authoritative access and response ordering boundary. */
export function useCollaboration(pageId: string, read: Resource<DocumentView>["read"]) {
  const [presence, setPresence] = useState<
    { id: string; displayName: string; initials: string }[]
  >([]);
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const sessionId = operationKey();
    let sequence = 0, lastPresence = 0;
    async function update() {
      await read(async signal => {
        if (Date.now() - lastPresence > 10000) {
          await mutate(`/api/collaboration/${pageId}/presence`, { sessionId, cursor: null }, "POST", signal);
          lastPresence = Date.now();
        }
        const result = await request<{
          document: DocumentView;
          events: { sequence: number }[];
          presence: typeof presence;
        }>(`/api/collaboration/${pageId}?after=${sequence}`, { signal });
        if (alive && !signal.aborted) {
          setPresence([...new Map(result.presence.map(person=>[person.id,person])).values()]);
          sequence = Math.max(sequence, ...result.events.map(event=>event.sequence));
        }
        return result.document;
      });
      if (alive) timer = setTimeout(update, 3000);
    }
    void update();
    return () => { alive = false; clearTimeout(timer); };
  }, [pageId,read]);
  return { presence };
}
