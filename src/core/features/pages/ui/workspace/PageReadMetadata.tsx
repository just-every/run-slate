import type { DocumentView } from "../../../../client/content";
import { useResource } from "../../../../client/useResource";
import { displayDate } from "../../../../app/ui/displayDate";
import { PageStatusBadge } from "./PageStatusBadge";

const initialsOf = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]!.toUpperCase()).join("");

export function PageReadMetadata({ document, saveState }: { document: DocumentView; saveState?: string }) {
  const details = useResource<{ owner: { displayName: string } | null }>(`/api/pages/${document.page.id}/details`);
  const page = document as DocumentView & { authorDisplayName?: string; updatedAt?: string };
  return <p className="page-byline">
    {details.data ? <span className="byline-owner">{details.data.owner ? <span className="byline-avatar" aria-hidden="true">{initialsOf(details.data.owner.displayName)}</span> : null}<span>Owner: {details.data.owner?.displayName ?? "Unassigned"}</span></span> : page.authorDisplayName ? <span>By {page.authorDisplayName}</span> : null}
    {page.updatedAt ? <time dateTime={page.updatedAt}>Updated {displayDate(page.updatedAt)}</time> : null}
    {document.policyProfile["page.status.v1"] === "open-vocabulary" ? <PageStatusBadge document={document} /> : <span className="byline-status-narrow"><PageStatusBadge document={document} /></span>}
    {saveState ? <span role="status" aria-live="polite">{saveState}</span> : null}
  </p>;
}
