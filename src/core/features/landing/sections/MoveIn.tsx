import { DocsLink } from "../../docs/DocsLink";
import { copy } from "../copy";
import { ImportDrawing } from "../drawings/ImportDrawing";
import { installSlug } from "../links";
import { Section } from "../parts/Section";
import { Stage } from "../parts/Stage";

const { moveIn: c } = copy;

/** Copy and the import window, then the three steps as a plain timeline of dots (no numbers), all inside the one section. */
export function MoveIn() {
  const link = <DocsLink className="text-link" slug={installSlug}>{c.cta}</DocsLink>;
  const steps = (
    <ol className="timeline" aria-label="How to move in">
      {c.steps.map(step => <li key={step}><i aria-hidden="true" /><span>{step}</span></li>)}
    </ol>
  );
  return (
    <Section id="move-in" eyebrow={c.eyebrow} title={c.title} body={c.body} copySide="right" extras={link} after={steps}>
      <Stage label={c.label} wash="b"><ImportDrawing /></Stage>
    </Section>
  );
}
