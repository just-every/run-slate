import { DateStamp } from "../../../../app/ui/displayDate";
import type { DocumentView } from "../../../../client/content";
import { PageStatusBadge } from "./PageStatusBadge";
import { personInitials } from "../../../../shared/person-identity";

export function PageReadMetadata({ document, saveState }: { document: DocumentView; saveState?: string }) {
  const page = document as DocumentView & { authorDisplayName?: string; ownerDisplayName?: string | null; updatedAt?: string };
  return <p className="page-byline">
    {"ownerDisplayName" in page ? <span className="byline-owner">{page.ownerDisplayName ? <span className="byline-avatar" aria-hidden="true">{personInitials(page.ownerDisplayName)}</span> : null}<span>Owner: {page.ownerDisplayName ?? "Unassigned"}</span></span> : page.authorDisplayName ? <span>By {page.authorDisplayName}</span> : null}
    {page.updatedAt ? <span>Updated <DateStamp value={page.updatedAt} /></span> : null}
    {document.policyProfile["page.status.v1"] === "open-vocabulary" ? <PageStatusBadge document={document} /> : <span className="byline-status-narrow"><PageStatusBadge document={document} /></span>}
    {saveState ? <span role="status" aria-live="polite">{saveState}</span> : null}
  </p>;
}
