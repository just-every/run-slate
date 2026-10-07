import {
  AudioLines,
  Download,
  Image as ImageIcon,
  Paperclip,
  Video,
} from "lucide-react";
import { useId } from "react";
import { Button, Input, Label } from "../../../../ui";
import type {
  BlockRenderProps,
  MediaBlockData,
  MediaKind,
  MediaSource,
} from "../types";
import { EditableLine } from "./Editable";

const kindLabel: Record<MediaKind, string> = {
  image: "Image",
  video: "Video",
  audio: "Audio",
  file: "File attachment",
};

const kindIcon = {
  image: ImageIcon,
  video: Video,
  audio: AudioLines,
  file: Paperclip,
};

function Prompt({
  block,
  actions,
}: {
  block: MediaBlockData;
  actions?: BlockRenderProps<MediaBlockData>["actions"];
}) {
  const Icon = kindIcon[block.kind];
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-card border border-dashed border-line-strong bg-sidebar px-3 py-4">
      <Icon aria-hidden="true" className="size-4 text-ink-faint" />
      <p className="text-ui text-ink-muted">
        No file yet for this {kindLabel[block.kind].toLowerCase()}.
      </p>
      <div className="ml-auto flex items-center gap-2">
        <Button
          onClick={() => actions?.onChooseFile?.(block.id)}
          size="sm"
          variant="secondary"
        >
          Upload
        </Button>
        <Button
          onClick={() => actions?.onAddFileLink?.(block.id)}
          size="sm"
          variant="ghost"
        >
          Add a link
        </Button>
      </div>
    </div>
  );
}

/**
 * `BLOCK-008` — an image, video or audio block renders inline; a file attachment
 * renders as a download row, because every stored file other than a displayed
 * image, video or audio is served with a download disposition.
 */
function Rendered({
  block,
  source,
}: {
  block: MediaBlockData;
  source: MediaSource;
}) {
  if (block.kind === "image") {
    return (
      <img
        alt={block.alt}
        className="w-full rounded-card border border-line"
        src={
          source.fileId
            ? `${source.url}?display=${encodeURIComponent(block.id)}`
            : source.url
        }
      />
    );
  }
  if (block.kind === "video") {
    return (
      <video
        aria-label={block.alt.length > 0 ? block.alt : source.name}
        className="w-full rounded-card border border-line"
        controls
        src={
          source.fileId
            ? `${source.url}?display=${encodeURIComponent(block.id)}`
            : source.url
        }
      />
    );
  }
  if (block.kind === "audio") {
    return (
      <audio
        aria-label={block.alt.length > 0 ? block.alt : source.name}
        className="w-full"
        controls
        src={
          source.fileId
            ? `${source.url}?display=${encodeURIComponent(block.id)}`
            : source.url
        }
      />
    );
  }
  return null;
}

function DownloadRow({
  block,
  source,
  actions,
}: {
  block: MediaBlockData;
  source: MediaSource;
  actions?: BlockRenderProps<MediaBlockData>["actions"];
}) {
  return (
    <div className="flex items-center gap-3 rounded-card border border-line bg-surface px-3 py-2">
      <Paperclip
        aria-hidden="true"
        className="size-4 shrink-0 text-ink-muted"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-ui text-ink">{source.name}</p>
        <p className="text-tiny text-ink-faint">
          {[source.sizeLabel, source.contentType].filter(Boolean).join(" · ")}
        </p>
      </div>
      <Button
        onClick={() => actions?.onDownloadFile?.(block.id)}
        size="sm"
        variant="secondary"
      >
        <Download aria-hidden="true" className="size-3.5" />
        Download
      </Button>
    </div>
  );
}

export function MediaBlock({
  block,
  canEdit,
  onChange,
  actions,
}: BlockRenderProps<MediaBlockData>) {
  const altId = useId();
  const describesDisplay = block.kind !== "file";

  return (
    <figure className="my-2 flex flex-col gap-2">
      {block.source === null ? (
        <Prompt actions={actions} block={block} />
      ) : block.kind === "file" ? (
        <DownloadRow actions={actions} block={block} source={block.source} />
      ) : (
        <Rendered block={block} source={block.source} />
      )}

      <figcaption>
        <EditableLine
          canEdit={canEdit}
          className="text-small text-ink-muted"
          label={`${kindLabel[block.kind]} caption`}
          onTextChange={(caption) => onChange({ ...block, caption })}
          placeholder="Write a caption"
          value={block.caption}
        />
      </figcaption>

      {canEdit && describesDisplay ? (
        <div className="flex flex-col gap-1">
          <Label htmlFor={altId}>Alt text</Label>
          <Input
            aria-describedby={`${altId}-hint`}
            id={altId}
            onChange={(event) =>
              onChange({ ...block, alt: event.target.value })
            }
            placeholder="Describe this for someone who cannot see it"
            value={block.alt}
          />
          <p className="text-tiny text-ink-faint" id={`${altId}-hint`}>
            Read out in place of the {kindLabel[block.kind].toLowerCase()}.
          </p>
        </div>
      ) : null}
    </figure>
  );
}
