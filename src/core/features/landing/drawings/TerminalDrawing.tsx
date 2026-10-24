import { ownerIdentity } from "../../../app/ext-client";
import { Icon } from "../icons/Icon";
import { installerUrl, repository } from "../links";
import { Sketch, WindowDots } from "../sketch/Sketch";

// The one start line every Run Edit Run page shows, and the alternative for people who already have Node.
const start = `curl -fsSL ${installerUrl} | sh -s -- dev ${repository}`;
const alternative = `npx -y @runeditrun/rer dev ${repository}`;

/** A command that wraps only between words, keeping the installer's `install.sh | sh` together. */
function words(line: string) {
  return line.split(/(\S*install\.sh \| sh|\S+)/).map((part, index) => {
    const pipe = /^(.*\/)(install\.sh \| sh)$/.exec(part);
    if (pipe) return <span key={index}><span className="td-word">{pipe[1]}</span><wbr /><span className="td-word">{pipe[2]}</span></span>;
    return part.trim() ? <span key={index} className="td-word">{part}</span> : part;
  });
}

/**
 * A terminal that starts Slate on your own computer with one line, with the MIT licence tagged on its corner. Run Edit Run's
 * installer is named only while the credit is on (`ownerIdentity.showFooterCredit`); without it the npx line starts Slate.
 */
export function TerminalDrawing() {
  return (
    <div className="td">
      <Sketch w={560} h={300} r={16} seed={5} seam="bottom" className="td-window">
        <div className="td-bar"><WindowDots /></div>
        <div className="td-screen">
          {ownerIdentity.showFooterCredit ? <>
            <p><b>$</b> {words(start)}</p>
            <p className="td-comment"><b>#</b> {words(`Already have Node 22 or later? ${alternative}`)}</p>
          </> : <p><b>$</b> {words(alternative)}</p>}
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
