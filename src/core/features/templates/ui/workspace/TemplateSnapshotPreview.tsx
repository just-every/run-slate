import { useState } from "react";
import { editorBlocks } from "../../../../client/content";
import { BlockView } from "../../../editor/ui/blocks/BlockView";
import { galleries } from "../../../pages/ui/workspace/PageAppearance";
import type { BlockView as StoredBlock } from "../../../../shared/api/content";
export interface TemplatePreviewSnapshot {
  title: string;
  blocks: Omit<StoredBlock, "pageId" | "revisionId">[];
  children: TemplatePreviewSnapshot[];
  coverUrl?: string;
  properties: {
    icon?: string | null;
    cover?:
      { kind: "gallery"; id: string } | { kind: "link"; url: string } | null;
    labels?: string[];
    typeface?: string;
    smallText?: boolean;
    fullWidth?: boolean;
    databaseFields?: Record<string, unknown>;
  };
  fieldDefinitions?: { id: string; name: string }[];
}
export function TemplateSnapshotPreview({
  snapshot,
  templateId,
  revisionId,
}: {
  snapshot: TemplatePreviewSnapshot;
  templateId: string;
  revisionId: string;
}) {
  const [loadCover, setLoadCover] = useState(false),
    p = snapshot.properties;
  const cover = p.cover;
  return (
    <section
      className="template-snapshot"
      aria-label={`Page preview: ${snapshot.title}`}
      data-typeface={p.typeface}
      data-small-text={p.smallText}
      data-full-width={p.fullWidth}
    >
      {snapshot.coverUrl ? (
        <img
          className="page-cover-image"
          src={snapshot.coverUrl}
          alt="Template cover"
        />
      ) : cover?.kind === "gallery" ? (
        <div
          className="page-cover-image"
          role="img"
          aria-label={`${cover.id} gallery cover`}
          style={{ background: galleries[cover.id] }}
        />
      ) : cover?.kind === "link" ? (
        loadCover ? (
          <img
            className="page-cover-image"
            src={cover.url}
            alt="Linked template cover"
          />
        ) : (
          <button onClick={() => setLoadCover(true)}>
            Load cover from {new URL(cover.url).hostname}
          </button>
        )
      ) : null}
      {p.icon?.startsWith("file:") ? (
        <img
          className="stored-page-icon"
          src={`/api/templates/${templateId}/assets/${encodeURIComponent(p.icon.slice(5))}`}
          alt="Template icon"
        />
      ) : p.icon ? (
        <span aria-hidden="true">{p.icon}</span>
      ) : null}
      <h3>{snapshot.title}</h3>
      {p.labels?.length ? <p>Labels: {p.labels.join(", ")}</p> : null}
      {p.databaseFields ? (
        <dl>
          {Object.entries(p.databaseFields).map(([id, value]) => (
            <div key={id}>
              <dt>
                {snapshot.fieldDefinitions?.find((field) => field.id === id)
                  ?.name ?? id}
              </dt>
              <dd>
                {typeof value === "object"
                  ? JSON.stringify(value)
                  : String(value ?? "Empty")}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      {editorBlocks(
        snapshot.blocks.map((block) => ({
          ...block,
          pageId: templateId,
          revisionId,
        })),
      ).map((block) => (
        <BlockView
          key={block.id}
          block={block}
          canEdit={false}
          onChange={() => {}}
        />
      ))}
      {snapshot.children.map((child, index) => (
        <TemplateSnapshotPreview
          key={index}
          snapshot={child}
          templateId={templateId}
          revisionId={revisionId}
        />
      ))}
    </section>
  );
}
