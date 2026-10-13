import { Icon } from "../icons/Icon";
import { Sketch, WindowDots } from "../sketch/Sketch";

const revisions = [
  { who: "Priya", when: "Oct 9, 15:18", picked: true },
  { who: "Dana", when: "Oct 8, 10:24", picked: true },
  { who: "Sam", when: "Oct 7, 09:02", picked: false },
];

/** The revision list with two picked, then those two revisions of one sentence side by side: one word struck out, its replacement highlighted, and a restore button. */
export function RevisionDrawing() {
  return (
    <Sketch w={560} h={420} r={18} seed={31} seam={0.83} className="rv">
      <div className="rv-bar"><WindowDots /></div>
      <div className="rv-head">
        <p className="rv-title"><Icon name="history" />Revision comparison</p>
        <b className="rv-restore">Restore this version</b>
      </div>
      <ul className="rv-list">
        {revisions.map(r => (
          <li key={r.when} className={r.picked ? "is-picked" : undefined}>
            <i aria-hidden="true" /><b>{r.who}</b><small>{r.when}</small>
          </li>
        ))}
      </ul>
      <div className="rv-panes">
        <div className="rv-pane">
          <p className="rv-meta"><b className="avatar">D</b>Dana<small>Oct 8, 10:24</small></p>
          <p className="rv-text">The beta opens to <del>ten</del> teams in March, with a weekly check-in.</p>
        </div>
        <div className="rv-pane">
          <p className="rv-meta"><b className="avatar">P</b>Priya<small>Oct 9, 15:18</small></p>
          <p className="rv-text">The beta opens to <ins>twenty</ins> teams in March, with a weekly check-in.</p>
        </div>
      </div>
    </Sketch>
  );
}
