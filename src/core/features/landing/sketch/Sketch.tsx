import type { CSSProperties, ReactNode } from "react";
import { framePath } from "./framePath";
import type { Seam } from "./seam";

type SketchProps = {
  /** The box's nominal width and height. They fix the aspect ratio of the ink and the scale of the content (see sketch.css). */
  w: number;
  h: number;
  /** Corner radius in nominal units. */
  r?: number;
  /** Changes the wobble, so two frames of the same size do not repeat each other. */
  seed?: number;
  /** Where the pen starts and laps over itself: a corner, an edge's middle, or a fraction round the outline (see seam.ts). Give each frame on a page its own. */
  seam?: Seam;
  className?: string;
  children: ReactNode;
};

/**
 * The page's one sketch primitive: a paper-filled box with a hand-drawn ink outline. The outline is an SVG stretched over
 * the box with a non-scaling stroke, so its weight is the same at any size and only its wobble scales. The content sits
 * inside `.sk-body`, whose font size follows the box's width, so a drawing shrinks as a whole.
 */
export function Sketch({ w, h, r = 18, seed = 1, seam = "top-left", className = "", children }: SketchProps) {
  return (
    <div className={`sk ${className}`.trim()} style={{ "--sk-w": w, "--sk-h": h, "--sk-r": `${r}px` } as CSSProperties}>
      <div className="sk-body">{children}</div>
      <svg className="sk-ink" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <path d={framePath(w, h, r, seed, seam)} />
      </svg>
    </div>
  );
}

/** The three dots of a window's title bar. */
export function WindowDots() {
  return <span className="sk-dots" aria-hidden="true"><i /><i /><i /></span>;
}
