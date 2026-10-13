import { copy } from "../copy";
import { runPath } from "../links";
import { Wash } from "../sketch/Wash";

const { start: c } = copy;

/** The closing call to action, centred on a soft wash. */
export function Start() {
  return (
    <section className="start" id="start" aria-labelledby="start-title">
      <Wash shape="d" />
      <h2 id="start-title">{c.title}</h2>
      <p className="start-sub">{c.sub}</p>
      <div className="actions">
        <a className="pill pill--ink pill--large" href={runPath}>{c.primary}</a>
      </div>
      <p className="fine">{c.free}</p>
    </section>
  );
}
