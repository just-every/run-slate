import { Minus, Pencil, Plus } from "lucide-react";
import type { ComponentType } from "react";
import { cn } from "../../../ui";
import type { CompareBlock, CompareBlockKind, CompareSide } from "./types";

const kinds: Record<
  Exclude<CompareBlockKind, "unchanged">,
  { label: string; Icon: ComponentType<{ className?: string }>; tint: string; text: string }
> = {
  added: { label: "Added", Icon: Plus, tint: "bg-hl-green", text: "text-good" },
  removed: { label: "Removed", Icon: Minus, tint: "bg-hl-red", text: "text-danger" },
  changed: { label: "Changed", Icon: Pencil, tint: "bg-hl-yellow", text: "text-warn" },
};

/**
 * `REV-004` — two revisions side by side, showing added, removed and changed blocks in
 * place. Available under every value of `page.version.v1`, so this view takes no
 * profile. The two-at-a-time rule is stated where the selection is made, in
 * `VersionHistoryPanel`.
 */
export function VersionCompareView({
  left,
  right,
  blocks,
  summary,
}: {
  /** The older revision. */
  left: CompareSide;
  /** The newer revision. */
  right: CompareSide;
  blocks: readonly CompareBlock[];
  /** A difference summary, written out; omit when none has been asked for. */
  summary?: string | null;
}) {
  return (
    <section aria-labelledby="version-compare-heading" className="flex flex-col gap-3 p-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-h3 font-semibold text-ink" id="version-compare-heading">
          Comparing two revisions
        </h2>
        {summary ? <p className="text-ui text-ink-muted">{summary}</p> : null}
        <p className="flex flex-wrap items-center gap-3 text-tiny text-ink-faint">
          {(["added", "removed", "changed"] as const).map((kind) => (
            <span className="flex items-center gap-1" key={kind}>
              <span aria-hidden="true" className={cn("size-2.5 rounded-full", kinds[kind].tint)} />
              {kinds[kind].label}
            </span>
          ))}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <CompareColumn blocks={blocks} side="before" summary={left} />
        <CompareColumn blocks={blocks} side="after" summary={right} />
      </div>
    </section>
  );
}

function CompareColumn({
  summary,
  blocks,
  side,
}: {
  summary: CompareSide;
  blocks: readonly CompareBlock[];
  side: "before" | "after";
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <header className="border-b border-line pb-1.5">
        <p className="text-ui font-medium text-ink">{summary.label}</p>
        <p className="text-tiny text-ink-muted">
          {summary.at} · {summary.actorName}
        </p>
      </header>
      <ol className="flex flex-col gap-1.5">
        {blocks.map((block) => (
          <CompareBlockRow block={block} key={block.id} side={side} />
        ))}
      </ol>
    </div>
  );
}

function CompareBlockRow({ block, side }: { block: CompareBlock; side: "before" | "after" }) {
  const text = side === "before" ? block.before : block.after;
  const shown =
    block.kind === "unchanged" ||
    (side === "before" && block.kind !== "added") ||
    (side === "after" && block.kind !== "removed");

  if (!shown || text === null) {
    return (
      <li className="rounded-control border border-dashed border-line px-2.5 py-2 text-tiny text-ink-faint">
        Not present in this revision
      </li>
    );
  }

  if (block.kind === "unchanged") {
    return <li className="px-2.5 py-2 text-body text-ink">{text}</li>;
  }

  const kind = kinds[block.kind];
  return (
    <li className={cn("rounded-control px-2.5 py-2", kind.tint)}>
      <span className={cn("mb-0.5 flex items-center gap-1 text-micro font-medium uppercase", kind.text)}>
        <kind.Icon aria-hidden="true" className="size-3" />
        {kind.label}
      </span>
      <span className="block text-body text-ink">{text}</span>
    </li>
  );
}
