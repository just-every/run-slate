import { Eye, Users } from "lucide-react";
import type { ReactNode } from "react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  cn,
  DeniedState,
  ErrorState,
  LoadingState,
  Separator,
  type SurfaceState,
} from "../../../ui";
import type { KnowledgePolicyProfile } from "../../../shared/knowledge/policies";
import { PageStatusChip } from "./PageStatusChip";
import type { PagePerson, PageStatusEntry } from "./types";

/** `PAGE-007` plus the figures `PAGE-013` records. */
export interface PageDetails {
  owner: PagePerson;
  creator: PagePerson;
  contributors: readonly PagePerson[];
  createdLabel: string;
  updatedLabel: string;
  lengthLabel: string;
  status: PageStatusEntry | null;
  labels: readonly string[];
  totalViews: number;
  uniqueViewers: number;
  ownViewsLabel?: string;
  linkedFrom: readonly { id: string; title: string }[];
}

/**
 * `PAGE-007` — a page's details. Everything here is already visible to a reader
 * who can read the page, so nothing is gated; `PAGE-013` adds total views and
 * unique viewers to the same panel and neither figure is behind a plan or a role
 * beyond read access.
 */
export function PageDetailsPanel({
  state,
  details,
  statusProfile,
  canReassignOwner = false,
  onReassignOwner,
  onOpenPage,
  onRetry,
  onRequestAccess,
  className,
}: {
  state: SurfaceState;
  details: PageDetails | null;
  statusProfile: KnowledgePolicyProfile["page.status.v1"];
  canReassignOwner?: boolean;
  onReassignOwner?: () => void;
  onOpenPage?: (pageId: string) => void;
  onRetry?: () => void;
  onRequestAccess?: () => void;
  className?: string;
}) {
  return (
    <section
      aria-labelledby="page-details-heading"
      className={cn("flex w-full flex-col gap-3 rounded-card border border-line bg-surface p-4 sm:w-panel", className)}
    >
      <h2 className="text-ui font-semibold text-ink" id="page-details-heading">
        Page details
      </h2>

      {state === "loading" ? <LoadingState rows={6} /> : null}
      {state === "denied" ? <DeniedState onRequestAccess={onRequestAccess} /> : null}
      {state === "error" ? (
        <ErrorState
          detail="The details did not load. Nothing about the page has changed."
          onRetry={onRetry}
          title="Could not load page details"
        />
      ) : null}

      {state === "ready" && details !== null ? (
        <div className="flex flex-col gap-3">
          <dl className="flex flex-col gap-2.5">
            <Row label="Owner">
              <div className="flex items-center justify-between gap-2">
                <Person person={details.owner} />
                {canReassignOwner && onReassignOwner ? (
                  <Button onClick={onReassignOwner} size="sm" variant="secondary">
                    Reassign
                  </Button>
                ) : null}
              </div>
            </Row>
            <Row label="Created by">
              <Person person={details.creator} />
            </Row>
            <Row label="Contributors">
              {details.contributors.length === 0 ? (
                <span className="text-ink-muted">No one else has edited this page.</span>
              ) : (
                <ul className="flex flex-col gap-1">
                  {details.contributors.map((person) => (
                    <li key={person.id}>
                      <Person person={person} />
                    </li>
                  ))}
                </ul>
              )}
            </Row>
            <Row label="Created">{details.createdLabel}</Row>
            <Row label="Last updated">{details.updatedLabel}</Row>
            <Row label="Length">{details.lengthLabel}</Row>
            <Row label="Status">
              {details.status === null ? (
                <span className="text-ink-muted">No status</span>
              ) : (
                <PageStatusChip status={details.status} statusProfile={statusProfile} />
              )}
            </Row>
            <Row label="Labels">
              {details.labels.length === 0 ? (
                <span className="text-ink-muted">No labels</span>
              ) : (
                <ul className="flex flex-wrap gap-1">
                  {details.labels.map((label) => (
                    <li className="rounded-control bg-sidebar-hover px-1.5 py-0.5 text-tiny text-ink-muted" key={label}>
                      {label}
                    </li>
                  ))}
                </ul>
              )}
            </Row>
          </dl>

          <Separator />

          <div className="flex gap-4">
            <Figure icon={<Eye aria-hidden="true" className="size-4" />} label="Total views" value={details.totalViews} />
            <Figure
              icon={<Users aria-hidden="true" className="size-4" />}
              label="Unique viewers"
              value={details.uniqueViewers}
            />
          </div>
          {details.ownViewsLabel ? <p className="text-tiny text-ink-faint">{details.ownViewsLabel}</p> : null}

          <Separator />

          <div className="flex flex-col gap-1">
            <h3 className="text-tiny font-medium text-ink-muted">Linked from</h3>
            {details.linkedFrom.length === 0 ? (
              <p className="text-ui text-ink-muted">No page links here yet.</p>
            ) : (
              <ul className="flex flex-col">
                {details.linkedFrom.map((link) => (
                  <li key={link.id}>
                    <button
                      className="w-full truncate rounded-control px-1 py-1 text-left text-ui text-ink hover:bg-sidebar-hover"
                      onClick={() => onOpenPage?.(link.id)}
                      type="button"
                    >
                      {link.title}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[7rem_1fr] items-start gap-2 text-ui">
      <dt className="pt-0.5 text-tiny text-ink-muted">{label}</dt>
      <dd className="min-w-0 text-ink">{children}</dd>
    </div>
  );
}

function Person({ person }: { person: PagePerson }) {
  return (
    <span className="flex items-center gap-1.5">
      <Avatar className="size-5">
        {person.imageUrl ? <AvatarImage alt="" src={person.imageUrl} /> : null}
        <AvatarFallback>{person.name.slice(0, 1).toUpperCase()}</AvatarFallback>
      </Avatar>
      {person.name}
    </span>
  );
}

function Figure({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="flex items-center gap-1 text-tiny text-ink-muted">
        {icon}
        {label}
      </span>
      <span className="text-h3 font-semibold text-ink">{value.toLocaleString()}</span>
    </div>
  );
}
