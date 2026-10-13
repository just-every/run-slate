import type { CSSProperties } from "react";
import { copy } from "../../copy";
import { HeroWindow } from "./HeroWindow";
import { Mug } from "./Mug";
import { Plant } from "./Plant";

// The stage is drawn in the approved hero's own coordinates: 1536 wide, from y = 90 to y = 640. `at` turns a position in
// that grid into percentages (as custom properties hero.css reads), so the whole scene scales as one piece, and the
// compact layout can place the same parts differently.
const WIDTH = 1536;
const TOP = 90;
const HEIGHT = 550;
const at = (x: number, y: number, w: number) => ({ "--l": `${(x / WIDTH) * 100}%`, "--t": `${((y - TOP) / HEIGHT) * 100}%`, "--w": `${(w / WIDTH) * 100}%` }) as CSSProperties;

const wash = "M340 104C300 112 262 140 246 190 234 230 238 280 226 330 214 380 206 430 200 480 198 530 222 575 290 598 420 628 640 636 820 636 1000 636 1200 632 1320 612 1385 600 1396 570 1392 520 1388 470 1368 430 1352 390 1336 350 1352 310 1344 270 1330 210 1290 160 1230 128 1190 106 1100 100 1000 100L600 100C500 100 400 98 340 104Z";
const ground = "M190 559H206M350 559H394M541 600H574M1127 606H1141M1148 607H1285M1286 586H1331M1312 571H1378";

/** The hero's drawing: the workspace window on a soft green wash, with a plant and a mug. */
export function HeroStage() {
  return (
    <div className="hs" role="img" aria-label={copy.hero.label}>
      <svg className="hs-wash" viewBox={`0 ${TOP} ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d={wash} /></svg>
      <svg className="hs-ground" viewBox={`0 ${TOP} ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d={ground} /></svg>
      <div className="hs-window" style={at(367, 111, 836)} aria-hidden="true"><HeroWindow /></div>
      <div className="hs-plant" style={at(214, 322, 156)}><Plant /></div>
      <div className="hs-mug" style={at(1178, 492, 130)}><Mug /></div>
    </div>
  );
}
