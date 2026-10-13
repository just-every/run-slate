import { Icon } from "../../icons/Icon";
import projects from "../sample/projects.json";

type Tone = "progress" | "todo" | "blocked" | "done";

// The sample records live beside the other drawings' samples, as data.
const rows = projects.hero as { name: string; owner: string; status: string; tone: Tone; target: string }[];

/** The Projects database drawn as a small table: name, owner, status chip and target date. */
export function HeroProjects() {
  return (
    <>
      <p className="hw-section"><Icon name="db" />Projects</p>
      <div className="hw-table">
        <div className="hw-row hw-row--head"><span>Name</span><span>Owner</span><span>Status</span><span>Target</span></div>
        {rows.map(({ name, owner, status, tone, target }) => (
          <div className="hw-row" key={name}>
            <span>{name}</span><span>{owner}</span>
            <span><b className={`chip chip--${tone}`}>{status}</b></span>
            <span>{target}</span>
          </div>
        ))}
      </div>
    </>
  );
}
