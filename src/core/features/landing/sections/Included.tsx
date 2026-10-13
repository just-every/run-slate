import { copy } from "../copy";
import { Icon } from "../icons/Icon";
import { Eyebrow } from "../parts/Eyebrow";

const { included: c } = copy;

/** The six smaller capabilities: a heading on the left and a grid of line icons in pale green circles on the right. */
export function Included() {
  return (
    <section className="included" id="included" aria-labelledby="included-title">
      <div className="included-head">
        <Eyebrow>{c.eyebrow}</Eyebrow>
        <h2 id="included-title">{c.title}</h2>
      </div>
      <ul className="included-grid">
        {c.items.map(item => (
          <li key={item.title}>
            <span className="included-icon"><Icon name={item.icon} className="ic ic--included" /></span>
            <div><h3>{item.title}</h3><p>{item.text}</p></div>
          </li>
        ))}
      </ul>
    </section>
  );
}
