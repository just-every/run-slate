// The soft green shape each drawing rests on. Decoration only. Each shape is a hand-placed blob in a 100 x 100 box that
// stretches to its drawing, so one outline fits any card; the drawing's padding decides which way it swells.
const shapes = {
  a: "M6 38C9 18 26 5 48 4 70 3 90 9 96 28 101 44 99 64 94 80 89 95 70 99 48 98 28 97 8 92 3 74 0 62 3 50 6 38Z",
  b: "M3 44C2 24 14 8 36 4 56 1 78 4 90 16 100 26 101 46 98 64 95 82 84 96 62 99 42 101 18 97 8 82 4 72 4 58 3 44Z",
  c: "M12 20C24 6 46 1 64 4 82 7 96 20 98 40 100 58 96 76 84 88 70 99 46 100 28 95 12 90 2 74 2 56 2 40 4 28 12 20Z",
  d: "M5 30C14 12 36 3 58 6 80 9 98 20 99 42 100 62 94 84 74 93 54 102 28 98 14 84 2 72 1 46 5 30Z",
} as const;

export type WashShape = keyof typeof shapes;

export function Wash({ shape }: { shape: WashShape }) {
  return (
    <svg className="wash" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <path d={shapes[shape]} />
    </svg>
  );
}
