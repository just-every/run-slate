import type { ReactNode } from "react";
import { Wash, type WashShape } from "../sketch/Wash";

type StageProps = {
  /** The accessible description of the drawing; its inner text is sample content, hidden from assistive technology. */
  label: string;
  wash: WashShape;
  className?: string;
  children: ReactNode;
};

/** A drawing resting on its soft green wash. */
export function Stage({ label, wash, className = "", children }: StageProps) {
  return (
    <div className={`stage ${className}`.trim()} role="img" aria-label={label}>
      <Wash shape={wash} />
      <div className="stage-art" aria-hidden="true">{children}</div>
    </div>
  );
}
