import type { InlineSpan, RichText } from "./types";

/** Apply one format to the selected range, retaining every untouched span's metadata. */
export function formatSelection(
  value: RichText,
  anchor: number,
  focus: number,
  update: (span: InlineSpan) => InlineSpan,
): RichText {
  const start = Math.max(0, Math.min(anchor, focus));
  const end = Math.max(start, Math.max(anchor, focus));
  if (start === end) return value;
  let offset = 0;
  return value.flatMap((span) => {
    const length = span.mention?.label.length ?? span.text.length;
    const from = Math.max(0, start - offset);
    const to = Math.min(length, end - offset);
    offset += length;
    if (from >= to || span.mention) return [span];
    const pieces: InlineSpan[] = [];
    if (from) pieces.push({ ...span, text: span.text.slice(0, from) });
    pieces.push(update({ ...span, text: span.text.slice(from, to) }));
    if (to < length) pieces.push({ ...span, text: span.text.slice(to) });
    return pieces;
  });
}
