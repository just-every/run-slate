import { copy } from "../copy";
import { SearchDrawing } from "../drawings/SearchDrawing";
import { Features } from "../parts/Features";
import { Section } from "../parts/Section";
import { Stage } from "../parts/Stage";

const { search: c } = copy;

export function Search() {
  return (
    <Section id="search" eyebrow={c.eyebrow} title={c.title} body={c.body} copySide="right" extras={<Features items={[["eye", c.points[0]], ["layers", c.points[1]], ["toggle", c.points[2]]]} />}>
      <Stage label={c.label} wash="d"><SearchDrawing /></Stage>
    </Section>
  );
}
