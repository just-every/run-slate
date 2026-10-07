import { Button, cn, Label } from "../../../ui";
import { useId } from "react";

/**
 * `PAGE-006` — the cover strip. A page with no cover renders no strip at all,
 * not a placeholder: neither icon nor cover is ever required. A gallery cover is
 * one of a fixed set of stored swatches; an uploaded or linked cover arrives as
 * a stored URL.
 */
export const pageCoverSwatches = {
  sand: "bg-gradient-to-br from-hl-yellow to-hl-red",
  sky: "bg-gradient-to-br from-hl-blue to-hl-purple",
  moss: "bg-gradient-to-br from-hl-green to-hl-blue",
  dusk: "bg-gradient-to-br from-hl-purple to-hl-red",
} as const;

export type PageCoverSwatch = keyof typeof pageCoverSwatches;

export function PageCover({
  coverUrl,
  coverSwatch = null,
  position = 50,
  canEdit = false,
  repositioning = false,
  onStartReposition,
  onPositionChange,
  onSaveReposition,
  onCancelReposition,
  onChangeCover,
  onRemoveCover,
  className,
}: {
  coverUrl: string | null;
  coverSwatch?: PageCoverSwatch | null;
  /** Vertical focal point, 0–100, stored on the page. */
  position?: number;
  canEdit?: boolean;
  repositioning?: boolean;
  onStartReposition?: () => void;
  onPositionChange?: (next: number) => void;
  onSaveReposition?: () => void;
  onCancelReposition?: () => void;
  onChangeCover?: () => void;
  onRemoveCover?: () => void;
  className?: string;
}) {
  const sliderId = useId();
  if (coverUrl === null && coverSwatch === null) return null;

  return (
    <div className={cn("group/cover relative h-36 w-full overflow-hidden sm:h-56", className)}>
      {coverUrl === null ? (
        <div aria-hidden="true" className={cn("size-full", pageCoverSwatches[coverSwatch as PageCoverSwatch])} />
      ) : (
        <img
          alt=""
          className="size-full object-cover"
          src={coverUrl}
          style={{ objectPosition: `50% ${position}%` }}
        />
      )}

      {canEdit && repositioning ? (
        <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-center gap-2 bg-surface/95 px-3 py-2">
          <Label className="text-tiny text-ink-muted" htmlFor={sliderId}>
            Cover position
          </Label>
          <input
            className="h-1 flex-1 min-w-32 accent-accent"
            id={sliderId}
            max={100}
            min={0}
            onChange={(event) => onPositionChange?.(Number(event.target.value))}
            step={1}
            type="range"
            value={position}
          />
          <Button onClick={onCancelReposition} size="sm" variant="ghost">
            Cancel
          </Button>
          <Button onClick={onSaveReposition} size="sm" variant="primary">
            Save position
          </Button>
        </div>
      ) : null}

      {canEdit && !repositioning ? (
        <div className="absolute right-3 bottom-3 flex items-center gap-1 rounded-control bg-surface/90 p-0.5 opacity-0 transition-opacity group-hover/cover:opacity-100 focus-within:opacity-100">
          {onStartReposition ? (
            <Button onClick={onStartReposition} size="sm" variant="ghost">
              Reposition
            </Button>
          ) : null}
          {onChangeCover ? (
            <Button onClick={onChangeCover} size="sm" variant="ghost">
              Change cover
            </Button>
          ) : null}
          {onRemoveCover ? (
            <Button onClick={onRemoveCover} size="sm" variant="ghost">
              Remove
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
