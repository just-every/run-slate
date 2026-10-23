import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { mutate, operationKey } from "../../client/transport";
import { NEW_PAGE_PARAM } from "./pageDestination";
import { NewSpacePrompt } from "./NewSpacePrompt";

export interface NewPage {
  pageKind?:"card";
  /** Null when the member has no space that accepts pages; a space name is then asked for. */
  containerId: string | null;
  title: string;
  parentPageId?: string;
}

/**
 * Creates a page immediately and opens it. One request runs at a time, and a retry of the same
 * payload reuses its operation key so the server replays the page it already made.
 */
export function useCreatePage(): {
  create: (resolve: () => Promise<NewPage>) => Promise<void>;
  pending: boolean;
  error: unknown;
  prompt: ReactNode;
} {
  const inFlight = useRef(false);
  const attempt = useRef<{ signature: string; key: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>();
  const [needsSpace, setNeedsSpace] = useState<Omit<NewPage, "containerId"> | null>(null);
  // A page restored from the back/forward cache must accept a new create after the earlier one opened.
  useEffect(() => {
    const restored = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      inFlight.current = false;
      setPending(false);
      setNeedsSpace(null);
    };
    window.addEventListener("pageshow", restored);
    return () => window.removeEventListener("pageshow", restored);
  }, []);
  const submit = useCallback(async (page: NewPage & { containerId: string }) => {
    const payload = { ...(page.pageKind?{pageKind:page.pageKind}:{}), containerId: page.containerId, title: page.title, ...(page.parentPageId ? { parentPageId: page.parentPageId } : {}) };
    const signature = JSON.stringify(payload);
    if (attempt.current?.signature !== signature) attempt.current = { signature, key: operationKey() };
    const result = await mutate<{ value: { pageId: string } }>("/api/pages", { ...payload, operationKey: attempt.current.key });
    attempt.current = null;
    window.location.assign(`/app/pages/${encodeURIComponent(result.value.pageId)}?${NEW_PAGE_PARAM}=1`);
  }, []);
  const create = useCallback(async (resolve: () => Promise<NewPage>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setError(undefined);
    try {
      const page = await resolve();
      if (page.containerId === null) {
        setNeedsSpace({ pageKind:page.pageKind,title: page.title, parentPageId: page.parentPageId });
        inFlight.current = false;
        setPending(false);
        return;
      }
      // The flag stays set while the browser leaves for the new page.
      await submit({ ...page, containerId: page.containerId });
    } catch (cause) {
      setError(cause);
      inFlight.current = false;
      setPending(false);
    }
  }, [submit]);
  // The prompt shares the same guard: once its page is made the flag stays set, so a further
  // submit while the browser leaves cannot make a second page. Failures surface in the prompt.
  const createInSpace = useCallback(async (page: NewPage & { containerId: string }) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    try {
      await submit(page);
    } catch (cause) {
      inFlight.current = false;
      setPending(false);
      throw cause;
    }
  }, [submit]);
  const prompt = needsSpace ? (
    <NewSpacePrompt
      busy={pending}
      onClose={() => setNeedsSpace(null)}
      onSpace={(containerId) => createInSpace({ ...needsSpace, containerId })}
    />
  ) : null;
  return { create, pending, error, prompt };
}
