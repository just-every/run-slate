import { Icon, type IconName } from "../icons/Icon";
import { Sketch, WindowDots } from "../sketch/Sketch";

const tree: [string, string[]][] = [["Product", ["Launch plan", "Specs"]], ["Engineering", ["Architecture"]]];
const menu: [IconName, string][] = [["heading", "Heading"], ["todo", "To-do list"], ["db", "Database"]];

/** A page being written: the page tree, a heading, a mention, a task, and the "/" insert menu open on a new line. */
export function EditorDrawing() {
  return (
    <Sketch w={640} h={400} r={18} seed={11} seam="bottom-left" className="ed">
      <div className="ed-bar"><WindowDots /></div>
      <div className="ed-body">
        <div className="ed-tree">
          {tree.map(([folder, pages]) => (
            <div key={folder}>
              <p className="ed-folder"><Icon name="folder" />{folder}</p>
              {pages.map(page => <p key={page} className={page === "Launch plan" ? "ed-leaf is-current" : "ed-leaf"}><Icon name="doc" />{page}</p>)}
            </div>
          ))}
        </div>
        <div className="ed-page">
          <p className="ed-title">Launch plan</p>
          <p className="ed-text">Owner <b className="mention">@Priya</b>, with review from Dana before we ship.</p>
          <p className="ed-h"><span># </span>Checklist</p>
          <p className="ed-task is-done"><span className="check"><Icon name="check" /></span>Write the announcement</p>
          <p className="ed-slash">/<i className="caret" /></p>
          <div className="ed-menu">
            {menu.map(([icon, label], index) => <p key={label} className={index === 0 ? "is-hot" : undefined}><Icon name={icon} />{label}</p>)}
          </div>
        </div>
      </div>
    </Sketch>
  );
}
