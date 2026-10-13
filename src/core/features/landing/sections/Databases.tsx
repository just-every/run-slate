import { copy } from "../copy";
import { CollectionDrawing } from "../drawings/CollectionDrawing";
import { Features } from "../parts/Features";
import { Section } from "../parts/Section";
import { Stage } from "../parts/Stage";

const { databases: c } = copy;

// The collection drawing is the widest on the page, so this section gives it the larger share of the row.
export function Databases() {
  return (
    <Section id="databases" eyebrow={c.eyebrow} title={c.title} body={c.body} className="sec--wide-art" extras={<Features items={[["grid", c.points[0]], ["doc", c.points[1]], ["sliders", c.points[2]]]} />}>
      <Stage label={c.label} wash="c"><CollectionDrawing /></Stage>
    </Section>
  );
}
