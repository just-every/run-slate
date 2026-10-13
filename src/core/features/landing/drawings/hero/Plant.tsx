// The potted plant at the window's left: a hand-inked pot and five curved green leaves on thin stems. Decoration only.
type Point = [number, number];

/**
 * A leaf from its base to its tip: an almond whose two edges bow by different amounts (`left` and `right`, in drawing units,
 * measured across the base-to-tip line), so each leaf leans and curves. Returns the outline and a bent centre vein.
 */
function leaf([bx, by]: Point, [tx, ty]: Point, left: number, right: number) {
  const dx = tx - bx;
  const dy = ty - by;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const at = (t: number, off: number): string => `${(bx + dx * t + nx * off).toFixed(1)} ${(by + dy * t + ny * off).toFixed(1)}`;
  const outline = `M${bx} ${by}C${at(0.12, left)} ${at(0.62, left * 1.05)} ${tx} ${ty}C${at(0.7, -right)} ${at(0.18, -right * 0.9)} ${bx} ${by}Z`;
  const vein = `M${bx} ${by}Q${at(0.5, (left - right) * 0.35)} ${at(0.86, (left - right) * 0.2)}`;
  return { outline, vein };
}

const leaves: { base: Point; tip: Point; left: number; right: number }[] = [
  { base: [80, 120], tip: [100, 8], left: 16, right: 7 },
  { base: [76, 152], tip: [6, 96], left: 14, right: 30 },
  { base: [92, 160], tip: [134, 58], left: 12, right: 20 },
  { base: [94, 172], tip: [156, 112], left: 8, right: 26 },
  { base: [74, 176], tip: [30, 140], left: 18, right: 8 },
];
const stems = ["M81 196C80 170 79 144 80 120", "M80 196C78 178 76 164 76 152", "M82 196C86 182 90 170 92 160", "M84 196C88 186 92 178 94 172", "M80 196C77 188 75 182 74 176"];

export function Plant() {
  return (
    <svg className="plant" viewBox="0 0 164 272" fill="none" aria-hidden="true" focusable="false">
      {stems.map(d => <path key={d} d={d} stroke="#1b1b18" strokeWidth="2.4" strokeLinecap="round" />)}
      {leaves.map(({ base, tip, left, right }) => {
        const { outline, vein } = leaf(base, tip, left, right);
        return (
          <g key={outline}>
            <path d={outline} fill="#62936a" stroke="#1b1b18" strokeWidth="2.8" strokeLinejoin="round" />
            <path d={vein} stroke="#1b1b18" strokeWidth="1.7" strokeLinecap="round" opacity="0.75" />
          </g>
        );
      })}
      <path d="M30 196C58 191 104 191 132 196L121 256C119 266 112 270 102 271L62 271C50 270 44 265 42 256Z" fill="#fbfaf3" stroke="#1b1b18" strokeWidth="3.2" strokeLinejoin="round" />
      <path d="M31 198C60 194 104 194 131 198" stroke="#1b1b18" strokeWidth="3.4" strokeLinecap="round" />
    </svg>
  );
}
