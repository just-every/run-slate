import { Icon } from "../../icons/Icon";
import { Sketch, WindowDots } from "../../sketch/Sketch";
import { HeroPage } from "./HeroPage";
import { HeroRecent } from "./HeroRecent";
import { HeroSidebar } from "./HeroSidebar";

/** The approved hero's workspace window, drawn at 836 x 472 and scaled as one piece (hero.css). */
export function HeroWindow() {
  return (
    <Sketch w={836} h={472} r={22} seed={3} seam="top-right" className="hw">
      <div className="hw-bar"><WindowDots /></div>
      <div className="hw-search"><Icon name="search" /><span>Search this workspace…</span></div>
      <div className="hw-body">
        <HeroSidebar />
        <HeroPage />
        <HeroRecent />
      </div>
    </Sketch>
  );
}
