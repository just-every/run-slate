import { copy } from "../copy";
import { TerminalDrawing } from "../drawings/TerminalDrawing";
import { Icon } from "../icons/Icon";
import { sourceUrl } from "../links";
import { Features } from "../parts/Features";
import { Section } from "../parts/Section";
import { Stage } from "../parts/Stage";

const { openSource: c } = copy;

export function OpenSource() {
  const extras = (
    <>
      <Features items={[["tagOff", c.points[0]], ["lock", c.points[1]], ["code", c.points[2]]]} />
      <a className="pill pill--ink" href={sourceUrl}>{c.cta}<Icon name="external" className="ic ic--inline" /></a>
    </>
  );
  return (
    <Section id="open-source" eyebrow={c.eyebrow} title={c.title} body={c.body} extras={extras}>
      <Stage label={c.label} wash="a"><TerminalDrawing /></Stage>
    </Section>
  );
}
