import type { ReactNode } from "react";
import { Eyebrow } from "./Eyebrow";

type SectionProps = {
  id: string;
  eyebrow: string;
  title: string;
  body?: string;
  /** Which side the copy takes on a wide screen; the drawing takes the other. */
  copySide?: "left" | "right";
  className?: string;
  /** Extra copy below the body: the features and the call to action. */
  extras?: ReactNode;
  /** Full-width content after the copy and the drawing, still inside the section. */
  after?: ReactNode;
  /** The section's drawing, already framed. */
  children: ReactNode;
};

/** One section: copy on one side and a drawing on the other (stacked on a narrow screen, copy first). */
export function Section({ id, eyebrow, title, body, copySide = "left", className = "", extras, after, children }: SectionProps) {
  return (
    <section className={`sec sec--${copySide} ${className}`.trim()} id={id} aria-labelledby={`${id}-title`}>
      <div className="sec-copy">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h2 id={`${id}-title`}>{title}</h2>
        {body ? <p className="sec-body">{body}</p> : null}
        {extras}
      </div>
      <div className="sec-art">{children}</div>
      {after}
    </section>
  );
}
