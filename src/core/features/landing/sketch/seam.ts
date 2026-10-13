// Where a hand-drawn frame's stroke starts and ends: the "seam" where the pen laps past its own beginning. A seam is a
// position on the frame's outline, given as a corner, the middle of an edge, or a fraction of the way round the perimeter.

/** Positions in turns clockwise from the top-left corner, or a named corner or edge middle. */
export type Seam =
  | "top-left" | "top-right" | "bottom-right" | "bottom-left"
  | "top" | "right" | "bottom" | "left"
  | number;

/** Edge 0 is the top and the rest follow clockwise; `at` is the distance along that edge from its clockwise start. */
export type SeamSpot = { edge: 0 | 1 | 2 | 3; at: number };

const named: Record<string, { edge: SeamSpot["edge"]; middle: boolean }> = {
  "top-left": { edge: 0, middle: false },
  "top-right": { edge: 1, middle: false },
  "bottom-right": { edge: 2, middle: false },
  "bottom-left": { edge: 3, middle: false },
  top: { edge: 0, middle: true },
  right: { edge: 1, middle: true },
  bottom: { edge: 2, middle: true },
  left: { edge: 3, middle: true },
};

/** How far past a corner the pen starts, and how far the stroke laps back over its own start. */
export const SEAM_LEAD = 6;
export const SEAM_LAP = 18;

/**
 * The edge and distance a seam names on a w x h box with corner radius r. A seam always lies on a straight run: a fraction
 * that lands in a corner moves to the nearest point where the pen can start and still lap before the next corner.
 */
export function seamSpot(w: number, h: number, r: number, seam: Seam): SeamSpot {
  const lengths = [w, h, w, h];
  let edge: SeamSpot["edge"] = 0;
  let at = r + SEAM_LEAD;
  if (typeof seam === "number") {
    let distance = (((seam % 1) + 1) % 1) * 2 * (w + h);
    while (edge < 3 && distance >= lengths[edge]) {
      distance -= lengths[edge];
      edge = (edge + 1) as SeamSpot["edge"];
    }
    at = distance;
  } else {
    const spot = named[seam];
    edge = spot.edge;
    if (spot.middle) at = lengths[edge] / 2;
  }
  const first = r + SEAM_LEAD;
  const last = Math.max(first, lengths[edge] - r - SEAM_LAP - 12);
  return { edge, at: Math.min(Math.max(at, first), last) };
}
