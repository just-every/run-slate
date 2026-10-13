import { Icon } from "../icons/Icon";
import { Sketch, WindowDots } from "../sketch/Sketch";

const people: [initial: string, name: string, access: string, note?: string][] = [
  ["T", "Team", "Can edit"],
  ["D", "Design", "Can comment"],
  ["S", "Sam (guest)", "Can view", "until 30 Nov"],
];

/** A page with its share dialog open: three kinds of access and the publish toggle switched on. */
export function ShareDrawing() {
  return (
    <Sketch w={520} h={400} r={18} seed={29} seam="bottom" className="sh">
      <div className="sh-bar"><WindowDots /></div>
      <div className="sh-page">
        <p className="sh-title"><Icon name="doc" />Roadmap<b className="sh-button"><Icon name="link" />Share</b></p>
        <span className="skeleton" /><span className="skeleton skeleton--short" />
      </div>
      <div className="sh-dialog">
        <p className="sh-head">Share “Roadmap”<Icon name="x" /></p>
        {people.map(([initial, name, access, note]) => (
          <div key={name} className="sh-row">
            <b className="avatar">{initial}</b>
            <span className="sh-name">{name}</span>
            <span className="sh-access">{access}{note ? <small>{note}</small> : null}<Icon name="chevronDown" /></span>
          </div>
        ))}
        <div className="sh-publish">
          <Icon name="globe" />
          <span className="sh-name">Publish to the web<small>Anyone with the link can read this page</small></span>
          <i className="switch is-on" />
        </div>
      </div>
    </Sketch>
  );
}
