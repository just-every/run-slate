import type { DocumentView } from "../../../../client/content";
import { displayDate } from "../../../../app/ui/displayDate";
import { PageStatusBadge } from "./PageStatusBadge";
import { personInitials } from "../../../../shared/person-identity";

export function PageReadMetadata({ document }: { document: DocumentView }) {
  const page = document as DocumentView & { authorDisplayName?: string; ownerDisplayName?: string | null; updatedAt?: string };
  return <p className="page-byline">
    {"ownerDisplayName" in page ? <span className="byline-owner">{page.ownerDisplayName ? <span className="byline-avatar" aria-hidden="true">{personInitials(page.ownerDisplayName)}</span> : null}<span>Owner: {page.ownerDisplayName ?? "Unassigned"}</span></span> : page.authorDisplayName ? <span>By {page.authorDisplayName}</span> : null}
    {page.updatedAt ? <time dateTime={page.updatedAt}>Updated {displayDate(page.updatedAt)}</time> : null}
    {document.policyProfile["page.status.v1"] === "open-vocabulary" ? <PageStatusBadge document={document} /> : <span className="byline-status-narrow"><PageStatusBadge document={document} /></span>}
  </p>;
}
