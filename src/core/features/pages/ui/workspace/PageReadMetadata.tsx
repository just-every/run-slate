import type { DocumentView } from "../../../../client/content";
import { displayDate } from "../../../../app/ui/displayDate";
import { PageStatusBadge } from "./PageStatusBadge";

const initialsOf = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]!.toUpperCase()).join("");

export function PageReadMetadata({ document, saveState }: { document: DocumentView; saveState?: string }) {
  const page = document as DocumentView & { authorDisplayName?: string; ownerDisplayName?: string | null; updatedAt?: string };
  return <p className="page-byline">
    {"ownerDisplayName" in page ? <span className="byline-owner">{page.ownerDisplayName ? <span className="byline-avatar" aria-hidden="true">{initialsOf(page.ownerDisplayName)}</span> : null}<span>Owner: {page.ownerDisplayName ?? "Unassigned"}</span></span> : page.authorDisplayName ? <span>By {page.authorDisplayName}</span> : null}
    {document.post?<span>Post by {document.post.displayName}{document.post.publishedAt?<> · <time dateTime={document.post.publishedAt}>{displayDate(document.post.publishedAt)}</time></>:" · Date unavailable"}</span>:null}
    {document.properties?.reviewDate?<time dateTime={document.properties.reviewDate}>Review due {displayDate(document.properties.reviewDate)}</time>:null}
    {page.updatedAt ? <time dateTime={page.updatedAt}>Updated {displayDate(page.updatedAt)}</time> : null}
    {document.policyProfile["page.status.v1"] === "open-vocabulary" ? <PageStatusBadge document={document} /> : <span className="byline-status-narrow"><PageStatusBadge document={document} /></span>}
    {saveState ? <span role="status" aria-live="polite">{saveState}</span> : null}
  </p>;
}
