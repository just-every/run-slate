import { copy } from "../copy";
import { ShareDrawing } from "../drawings/ShareDrawing";
import { Features } from "../parts/Features";
import { Section } from "../parts/Section";
import { Stage } from "../parts/Stage";

const { sharing: c } = copy;

// Sharing and History sit side by side on a wide screen (see Landing.tsx), so each is copy above its drawing.
export function Sharing() {
  return (
    <Section id="sharing" eyebrow={c.eyebrow} title={c.title} body={c.body} className="sec--half" extras={<Features items={[["people", c.points[0]], ["clock", c.points[1]], ["globe", c.points[2]]]} />}>
      <Stage label={c.label} wash="a"><ShareDrawing /></Stage>
    </Section>
  );
}
