import { useEffect, type RefObject } from "react";
import { useNavigate } from "@tanstack/react-router";
import { NEW_PAGE_PARAM } from "../../../../app/ui/pageDestination";

/**
 * A page opened straight after its creation selects its whole default title once, so typing
 * replaces it. The one-shot flag leaves the URL at once, so reload and Back never select again.
 */
export function useNewPageArrival(title: RefObject<HTMLTextAreaElement | null>, canEdit: boolean, onError: (cause: unknown) => void) {
  const navigate = useNavigate();
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(NEW_PAGE_PARAM)) return;
    url.searchParams.delete(NEW_PAGE_PARAM);
    void navigate({ href: `${url.pathname}${url.search}${url.hash}`, replace: true, resetScroll: false, hashScrollIntoView: false }).catch(onError);
    if (!canEdit || !title.current) return;
    title.current.focus();
    title.current.select();
  }, []);
}
