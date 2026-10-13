import { copy } from "../copy";
import { Icon } from "../icons/Icon";
import { SlateMark } from "../../../ui/brand/SlateMark";
import { Sketch, WindowDots } from "../sketch/Sketch";

/** An import window: the kinds of export Slate reads, as plain text chips, and a drop area for the files. */
export function ImportDrawing() {
  return (
    <>
      <Sketch w={640} h={300} r={18} seed={37} seam={0.2} className="im">
        <div className="im-bar"><WindowDots /></div>
        <p className="im-title"><Icon name="upload" />Import content</p>
        <p className="im-sub">Choose what you are bringing in</p>
        <div className="im-chips">
          {copy.moveIn.sources.map((source, index) => <span key={source} className={index === 0 ? "im-chip is-on" : "im-chip"}>{source}</span>)}
        </div>
        <p className="im-drop">Drop your export here, or choose files</p>
      </Sketch>
      <SlateMark className="im-mark" />
    </>
  );
}
