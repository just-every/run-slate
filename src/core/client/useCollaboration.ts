import { InitialResourcesContext } from "./InitialResources";
import { useContext, useEffect, useRef, useState } from "react";
import { request, mutate, operationKey } from "./transport";
import type { DocumentView } from "./content";
import type { Resource } from "./useResource";

/** Collaboration reads share the page's authoritative access and response ordering boundary. */
export function useCollaboration(pageId: string, read: Resource<DocumentView>["read"]) {
  const initial=useContext(InitialResourcesContext);
  const snapshot=useRef(initial[`/api/collaboration/${pageId}?after=0`] as {events:{sequence:number}[];presence:{id:string;displayName:string;initials:string}[]}|undefined);
  const opened=useRef(initial[`/api/pages/${pageId}/opened`] as {sessionId:string}|undefined);
  const [presence, setPresence] = useState<
    { id: string; displayName: string; initials: string }[]
  >([...new Map((snapshot.current?.presence??[]).map(person=>[person.id,person])).values()]);
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const sessionId = opened.current?.sessionId ?? operationKey();
    let sequence = Math.max(0,...(snapshot.current?.events.map(event=>event.sequence)??[])), lastPresence = opened.current ? Date.now() : 0;
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
    // The SSR snapshot already read the current document and presence. Start
    // the ordinary polling cadence from that read, rather than repeat it.
    if(snapshot.current)timer=setTimeout(update,3000);else void update();
    return () => { alive = false; clearTimeout(timer); };
  }, [pageId,read]);
  return { presence };
}
