import { useState } from "react";
import { useResource } from "../../../client/useResource";
import { RequestState } from "../../../app/ui/RequestState";
import { editorBlocks } from "../../../client/content";
import type { BlockView as StoredBlock } from "../../../shared/api/content";
import { BlockView } from "../../editor/ui/blocks/BlockView";
export interface CitationReference {
  kind?: "page" | "source";
  sourceId: string;
  sourceRevisionId: string;
  passageId?: string;
  freshness: string;
  authorityState: string;
}
interface Source {
  state: "available" | "unavailable";
  title?: string;
  text?: string;
  reason?: string;
  observedAt?: string;
  freshness?: string;
  scope?: string[];
}
interface Snapshot {
  blocks?: StoredBlock[];
  properties?: { title?: string };
  deleted?: boolean;
  createdAt?: string;
  newerRevisionExists?: boolean;
}
export function EvidenceReference({
  reference,
  index,
  forceOpen = false,
  idPrefix = "evidence",
}: {
  reference: CitationReference;
  index: number;
  forceOpen?: boolean;
  idPrefix?: string;
}) {
  const [open, setOpen] = useState(forceOpen);
  const source = useResource<Source>(
    open && reference.kind === "source"
      ? `/api/sources/${encodeURIComponent(reference.sourceId)}/revisions/${encodeURIComponent(reference.sourceRevisionId)}${reference.passageId ? `?passageId=${encodeURIComponent(reference.passageId)}` : ""}`
      : null,
  );
  const page = useResource<Snapshot>(
    open && reference.kind === "page"
      ? `/api/revisions/${encodeURIComponent(reference.sourceId)}/${encodeURIComponent(reference.sourceRevisionId)}`
      : null,
  );
  return (
    <details
      id={`${idPrefix}-${index + 1}`}
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      className="evidence-reference"
    >
      <summary>
        Source {index + 1}
        {source.data?.title
          ? ` · ${source.data.title}`
          : page.data?.properties?.title
            ? ` · ${page.data.properties.title}`
            : ""}
      </summary>
      {!reference.kind ? (
        <p>
          Reference details are unavailable. This reference is retained without
          guessing its content.
        </p>
      ) : (
        <RequestState
          loading={source.loading || page.loading}
          error={source.error ?? page.error}
          retry={() => {
            source.reload();
            page.reload();
          }}
        >
          {source.data?.state === "unavailable" || page.data?.deleted ? (
            <p className="request-notice">
              This exact evidence is unavailable.{" "}
              {source.data?.reason === "access"
                ? "Your current access does not permit this source."
                : source.data?.reason === "deleted" || page.data?.deleted
                  ? "The referenced content has been deleted."
                  : "The provider or retained revision is unavailable."}{" "}
              No replacement content is shown.
            </p>
          ) : (
            <>
              {source.data?.text ? (
                <blockquote>{source.data.text}</blockquote>
              ) : null}
              {page.data?.blocks
                ? editorBlocks(page.data.blocks).map((block) => (
                    <BlockView
                      key={block.id}
                      block={block}
                      canEdit={false}
                      onChange={() => {}}
                    />
                  ))
                : null}
              {page.data?.newerRevisionExists ? (
                <p>
                  A newer page revision exists. This is the exact cited version.
                </p>
              ) : null}
              {source.data?.observedAt ? (
                <p>
                  Observed {new Date(source.data.observedAt).toLocaleString()} ·{" "}
                  {source.data.freshness}
                </p>
              ) : null}
              {reference.kind === "page" && page.data?.blocks ? (
                <a href={`/app/pages/${reference.sourceId}`}>
                  Open current page
                </a>
              ) : null}
            </>
          )}
        </RequestState>
      )}
      <p className="muted">
        Evidence supports a statement; it does not authorize an action.
      </p>
      <details>
        <summary>Reference details</summary>
        <p style={{overflowWrap:"anywhere"}}>Revision {reference.sourceRevisionId}</p>
        {reference.passageId ? <p style={{overflowWrap:"anywhere"}}>Passage {reference.passageId}</p> : null}
      </details>
    </details>
  );
}
