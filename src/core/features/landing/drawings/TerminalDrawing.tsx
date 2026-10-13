import { cloneUrl } from "../links";
import { Icon } from "../icons/Icon";
import { Sketch, WindowDots } from "../sketch/Sketch";

const commands = ["cd run-slate", "rer install", "rer setup", "rer dev"];

/** A terminal that takes Slate from clone to local development, with the MIT licence tagged on its corner. */
export function TerminalDrawing() {
  return (
    <div className="td">
      <Sketch w={560} h={300} r={16} seed={5} seam="bottom" className="td-window">
        <div className="td-bar"><WindowDots /></div>
        <div className="td-screen">
          <p><b>$</b> git clone {cloneUrl}</p>
          {commands.map(command => <p key={command}><b>$</b> {command}</p>)}
          <p className="td-ok">✓ Ready on your computer</p>
        </div>
      </Sketch>
      <Sketch w={190} h={92} r={12} seed={9} seam="left" className="td-licence">
        <p className="td-licence-title"><Icon name="doc" />MIT licence</p>
        <span className="skeleton" /><span className="skeleton skeleton--short" />
      </Sketch>
    </div>
  );
}
