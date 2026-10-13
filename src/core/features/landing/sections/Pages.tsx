import { copy } from "../copy";
import { EditorDrawing } from "../drawings/EditorDrawing";
import { Features } from "../parts/Features";
import { Section } from "../parts/Section";
import { Stage } from "../parts/Stage";

const { pages: c } = copy;

export function Pages() {
  return (
    <Section id="pages" eyebrow={c.eyebrow} title={c.title} body={c.body} copySide="right" extras={<Features items={[["hash", c.points[0]], ["tree", c.points[1]], ["at", c.points[2]]]} />}>
      <Stage label={c.label} wash="b"><EditorDrawing /></Stage>
    </Section>
  );
}
