// The hand-drawn outline behind every window and card on the landing page. One continuous ink stroke goes round a rounded
// rectangle: each edge bows a hair, each corner lands a little off, and the pen laps past where it started. Everything
// is a pure function of the box, a seed and a seam, so the server and the browser draw the same line.
import { SEAM_LAP, SEAM_LEAD, seamSpot, type Seam, type SeamSpot } from "./seam";

type Pt = [number, number];
type Segment = { control: Pt; end: Pt };

/** A repeatable number in [-1, 1] for a seed and a slot. */
function wobble(seed: number, slot: number): number {
  const x = Math.sin(seed * 12.9898 + slot * 78.233) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

const f = (n: number) => n.toFixed(1);

/**
 * The stroke as drawn from the top edge, clockwise, in a box cw x ch: the pen starts `s` along the top edge, goes round, and
 * ends a lap past where it started. Every other seam is this drawing turned onto the edge the seam is on.
 */
function strokeFromTopEdge(cw: number, ch: number, r: number, seed: number, s: number): { start: Pt; segments: Segment[] } {
  const j = (slot: number, amount: number) => wobble(seed, slot) * amount;
  const corner = r + SEAM_LEAD;
  const segments: Segment[] = [
    { control: [cw / 2 + Math.max(0, s - corner) / 2, j(2, 2.4)], end: [cw - r, j(3, 1)] },
    { control: [cw + j(4, 1.6), j(5, 1.4)], end: [cw + j(6, 1.4), r] },
    { control: [cw + j(7, 2.4), ch / 2], end: [cw - j(8, 1.2), ch - r] },
    { control: [cw + j(9, 1.4), ch + j(10, 1.6)], end: [cw - r, ch + j(11, 1)] },
    { control: [cw / 2, ch + j(12, 2.2)], end: [r, ch + j(13, 1)] },
    { control: [j(14, 1.6), ch + j(15, 1.6)], end: [j(16, 1.2), ch - r] },
    { control: [j(17, 2.2), ch / 2], end: [j(18, 1), r] },
  ];
  const lapEnd: Pt = [s + SEAM_LAP, j(21, 1.2) + 1.6];
  if (s <= corner) {
    segments.push({ control: [j(19, 1.4), j(20, 1.4)], end: lapEnd });
  } else {
    // The seam is out along the edge: the last corner lands on the edge, then the pen runs along it to the lap.
    segments.push({ control: [j(19, 1.4), j(20, 1.4)], end: [r, j(22, 1)] });
    segments.push({ control: [(r + lapEnd[0]) / 2, j(23, 1.4)], end: lapEnd });
  }
  return { start: [s, j(1, 1.2)], segments };
}

/** Turns a drawing made along the top edge onto edge 0..3 of a w x h box, keeping the pen's clockwise direction. */
function onEdge(edge: SeamSpot["edge"], w: number, h: number): (p: Pt) => Pt {
  switch (edge) {
    case 0: return ([x, y]) => [x, y];
    case 1: return ([x, y]) => [w - y, x];
    case 2: return ([x, y]) => [w - x, h - y];
    case 3: return ([x, y]) => [y, h - x];
  }
}

/** The main stroke, clockwise from the seam, in the box's own units (0..w, 0..h). */
export function framePath(w: number, h: number, r: number, seed: number, seam: Seam = "top-left"): string {
  const { edge, at } = seamSpot(w, h, r, seam);
  const sideways = edge % 2 === 1;
  const { start, segments } = strokeFromTopEdge(sideways ? h : w, sideways ? w : h, r, seed, at);
  const place = onEdge(edge, w, h);
  const pt = (p: Pt) => { const [x, y] = place(p); return `${f(x)} ${f(y)}`; };
  return [`M${pt(start)}`, ...segments.map(({ control, end }) => `Q${pt(control)} ${pt(end)}`)].join(" ");
}
