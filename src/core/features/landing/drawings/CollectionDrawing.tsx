import { Icon, type IconName } from "../icons/Icon";
import projects from "./sample/projects.json";
import { Sketch, WindowDots } from "../sketch/Sketch";

type Tone = "progress" | "todo" | "done";
const rows = projects.collection as { name: string; owner: string; status: string; tone: Tone }[];
const columns: [status: string, tone: Tone][] = [["Todo", "todo"], ["In progress", "progress"], ["Done", "done"]];

function ViewLabel({ icon, children }: { icon: IconName; children: string }) {
  return <p className="cd-view"><Icon name={icon} />{children}</p>;
}

/** One Projects collection as a table and as a board, side by side, with its first row opened as a full page over the corner. */
export function CollectionDrawing() {
  return (
    <div className="cd-wrap">
      <Sketch w={780} h={380} r={18} seed={17} seam="top" className="cd">
        <div className="cd-bar"><WindowDots /></div>
        <div className="cd-head">
          <p className="cd-name"><Icon name="db" />Projects</p>
          <b className="cd-new">New record</b>
        </div>
        <div className="cd-body">
          <div className="cd-pane">
            <ViewLabel icon="table">Table</ViewLabel>
            <div className="cd-table">
              <div className="cd-row cd-row--head"><span>Name</span><span>Owner</span><span>Status</span></div>
              {rows.map(({ name, owner, status, tone }, i) => (
                <div key={name} className={i === 0 ? "cd-row is-open" : "cd-row"}>
                  <span>{name}</span><span>{owner}</span><span><b className={`chip chip--${tone}`}>{status}</b></span>
                </div>
              ))}
            </div>
          </div>
          <div className="cd-pane">
            <ViewLabel icon="board">Board</ViewLabel>
            <div className="cd-board">
              {columns.map(([status, tone]) => (
                <div key={status} className="cd-col">
                  <p className="cd-col-head"><b className={`chip chip--${tone}`}>{status}</b></p>
                  {rows.filter(row => row.status === status).map(({ name }) => (
                    <p key={name} className={name === "Search" ? "cd-card is-open" : "cd-card"}>{name}<span className="skeleton skeleton--short" /></p>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </Sketch>
      <Sketch w={250} h={190} r={14} seed={19} seam="right" className="cd-page">
        <div className="cd-page-body">
          <p className="cd-crumb">Projects</p>
          <p className="cd-title"><Icon name="doc" />Search</p>
          <p className="cd-field"><span>Owner</span>Alice</p>
          <p className="cd-field"><span>Status</span><b className="chip chip--progress">In progress</b></p>
          <p className="cd-field"><span>Target</span>Apr 28</p>
          <p className="cd-links"><span>Comments</span><span>History</span></p>
        </div>
      </Sketch>
    </div>
  );
}
