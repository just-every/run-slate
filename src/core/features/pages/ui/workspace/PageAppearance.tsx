import { useState } from "react";
import type { DocumentView } from "../../../../client/content";

export type PageCover = { kind: "gallery"; id: string } | { kind: "link"; url: string };

export const galleries: Record<string, string> = {
  sand: "linear-gradient(120deg,#ead3b0,#b07c55)",
  ocean: "linear-gradient(120deg,#87bfce,#275c77)",
  forest: "linear-gradient(120deg,#a6bb98,#36553b)",
  sunset: "linear-gradient(120deg,#e6b875,#a74b5c)",
  lavender: "linear-gradient(120deg,#d5c7e8,#7b6a9a)",
  slate: "linear-gradient(120deg,#bbc3cb,#4e5967)",
};

export function StoredIcon({ icon }: { icon: unknown }) {
  if (typeof icon !== "string" || !icon) return null;
  return icon.startsWith("file:") ? (
    <img className="stored-page-icon" src={`/api/media/${encodeURIComponent(icon.slice(5))}?display=inline`} alt="Page icon" />
  ) : (
    <span className="stored-page-icon" aria-hidden="true">
      {icon}
    </span>
  );
}

/** The page's cover and icon as they sit above the title. They are changed from the page's More menu. */
export function PageAppearance({ document }: { document: DocumentView }) {
  const props = document.properties as (NonNullable<DocumentView["properties"]> & { cover?: PageCover | null }) | undefined;
  const [remote, setRemote] = useState(false);
  const cover = props?.cover;
  return (
    <div className="page-appearance">
      {props?.coverFileId ? (
        <img className="page-cover-image" src={`/api/media/${encodeURIComponent(props.coverFileId)}?display=inline`} alt="Page cover" />
      ) : cover?.kind === "gallery" ? (
        <div className="page-cover-image" role="img" aria-label={`${cover.id} gallery cover`} style={{ background: galleries[cover.id] }} />
      ) : cover?.kind === "link" ? (
        remote ? (
          <img className="page-cover-image" src={cover.url} alt="Linked page cover" />
        ) : (
          <button onClick={() => setRemote(true)}>Load cover from {new URL(cover.url).hostname}</button>
        )
      ) : null}
      <StoredIcon icon={props?.icon} />
    </div>
  );
}
