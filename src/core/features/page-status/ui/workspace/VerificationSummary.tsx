import { DateStamp } from "../../../../app/ui/displayDate";

export interface VerificationView {
  state: "current" | "changed" | "lapsed" | null;
  status_key: string;
  revision_id: string;
  created_at: string;
  expires_at: string | null;
  lapsed: boolean;
  changedSince: boolean;
  workingRevisionId: string;
  revisionCreatedAt: string | null;
  verifier: { id: string; displayName: string; active: boolean };
  revisionsSince: number;
  editorsSince: string[];
  openedCurrent: boolean;
}

const people = (names: string[]) => names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;

export function historyHref(pageId: string, revision: string, compare?: string) {
  const params = new URLSearchParams({ detail: "history", revision });
  if (compare) params.set("compare", compare);
  return `/app/pages/${encodeURIComponent(pageId)}?${params}`;
}

/** STAT-003/STAT-004: who verified which revision, until when, and whether it still holds. */
export function VerificationSummary({ pageId, verification: v, canEdit }: { pageId: string; verification: VerificationView; canEdit: boolean }) {
  const attested = <>{v.verifier.displayName} verified the revision of <DateStamp value={v.revisionCreatedAt ?? v.created_at} /> on <DateStamp value={v.created_at} />.</>;
  const expiry = v.expires_at ? <>{v.lapsed ? "It lapsed on" : "It expires on"} <DateStamp value={v.expires_at} />.</> : "It has no expiry.";
  const changes = v.changedSince
    ? `The verified revision is not the current one${v.revisionsSince ? `: ${v.revisionsSince} ${v.revisionsSince === 1 ? "revision" : "revisions"} since${v.editorsSince.length ? ` by ${people(v.editorsSince)}` : ""}` : ""}.`
    : "The verified revision is the current one.";
  return (
    <div className="verification-summary" data-state={v.state ?? "superseded"}>
      <p>
        <strong>
          {v.state === "current" ? "Verified" : v.state === "lapsed" ? "Verification lapsed" : v.state === "changed" ? "Changed since verification" : "No current verification"}
        </strong>
      </p>
      {v.state === null ? (
        <p>The page's status changed after its last verification on <DateStamp value={v.created_at} />.</p>
      ) : (
        <>
          <p>{attested} {expiry}</p>
          <p>{changes}</p>
          {v.state !== "current" ? <p className="muted">Nothing renews a verification automatically. Review the page, then verify it again.</p> : null}
        </>
      )}
      {!v.verifier.active ? <p>{v.verifier.displayName} is no longer an active member. Workspace owners see this page under Needs review.</p> : null}
      {v.changedSince && canEdit ? (
        <p className="verification-links">
          <a href={historyHref(pageId, v.revision_id, v.workingRevisionId)}>See what changed</a>
          <a href={historyHref(pageId, v.revision_id)}>Open the verified revision</a>
        </p>
      ) : null}
    </div>
  );
}
