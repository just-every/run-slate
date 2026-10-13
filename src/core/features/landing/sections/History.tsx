import { copy } from "../copy";
import { RevisionDrawing } from "../drawings/RevisionDrawing";
import { Section } from "../parts/Section";
import { Stage } from "../parts/Stage";

const { history: c } = copy;

export function History() {
  return (
    <Section id="history" eyebrow={c.eyebrow} title={c.title} body={c.body} className="sec--half">
      <Stage label={c.label} wash="c"><RevisionDrawing /></Stage>
    </Section>
  );
}
