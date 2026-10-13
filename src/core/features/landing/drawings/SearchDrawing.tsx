import { Icon, type IconName } from "../icons/Icon";
import { Sketch, WindowDots } from "../sketch/Sketch";

type Result = [icon: IconName, title: string, where: string];
const readers: { name: string; role: string; results: Result[] }[] = [
  { name: "Dana", role: "editor", results: [["doc", "Onboarding checklist", "Page in People"], ["doc", "Engineering onboarding", "Page in Engineering"], ["table", "Onboarding plan, Q4 hires", "Record in Hiring"]] },
  { name: "Sam", role: "guest", results: [["doc", "Onboarding checklist", "Page in People"]] },
];

/** One search box and what two different readers get back from it. */
export function SearchDrawing() {
  return (
    <Sketch w={640} h={360} r={18} seed={23} seam="top-left" className="sd">
      <div className="sd-bar"><WindowDots /></div>
      <div className="sd-field"><Icon name="search" /><span>onboarding</span></div>
      <div className="sd-readers">
        {readers.map(({ name, role, results }) => (
          <div key={name} className="sd-reader">
            <p className="sd-who"><b className="avatar">{name[0]}</b>As {name}, {role}</p>
            <ul>
              {results.map(([icon, title, where]) => (
                <li key={title + where}><Icon name={icon} /><span><b>{title}</b><small>{where}</small></span></li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Sketch>
  );
}
