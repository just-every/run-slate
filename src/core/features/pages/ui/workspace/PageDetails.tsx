import {PageMetadata} from "./PageMetadata";
import type {PageSelection} from "./selection";
import type { DocumentView } from "../../../../client/content";
import { PageComments } from "./PageComments";
import { PageHistory } from "./PageHistory";
import { PageSharing } from "./PageSharing";
import { PageOptions } from "./PageOptions";
import { PageAsk } from "./PageAsk";
export function PageDetails({
  kind,
  unsaved,
  selection,
  document,
  revision,
  onClose,
  reload,
}: {
  kind: string;
  unsaved: boolean;
  selection?: PageSelection;
  document: DocumentView;
  revision: string;
  onClose: () => void;
  reload: () => void;
}) {
  return (
    <>
      <button className="detail-close" type="button" onClick={onClose}>
        Close details ×
      </button>
      {kind === "details" ? <PageMetadata document={document} revision={revision} reload={reload}/> : kind === "comments" ? (
        <PageComments document={document} selection={selection} />
      ) : kind === "history" ? (
        <PageHistory document={document} revision={revision} reload={reload} />
      ) : kind === "share" ? (
        <PageSharing document={document} />
      ) : kind === "ask" ? (
        <PageAsk document={document} selection={selection} />
      ) : (
        <PageOptions unsaved={unsaved} document={document} revision={revision} reload={reload} />
      )}
    </>
  );
}
