import { useEffect, type RefObject } from "react";
import { NEW_PAGE_PARAM } from "../../../../app/ui/pageDestination";

/**
 * A page opened straight after its creation selects its whole default title once, so typing
 * replaces it. The one-shot flag leaves the URL at once, so reload and Back never select again.
 */
export function useNewPageArrival(title: RefObject<HTMLTextAreaElement | null>, canEdit: boolean) {
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(NEW_PAGE_PARAM)) return;
    url.searchParams.delete(NEW_PAGE_PARAM);
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    if (!canEdit || !title.current) return;
    title.current.focus();
    title.current.select();
  }, []);
}
