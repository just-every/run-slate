import { Icon } from "../../icons/Icon";
import { HeroProjects } from "./HeroProjects";

/** The Roadmap page: a title, a paragraph with an @mention, a finished task and the Projects database. */
export function HeroPage() {
  return (
    <div className="hw-page">
      <p className="hw-title"><Icon name="doc" />Roadmap</p>
      <p className="hw-text">
        <span>Our product roadmap is split across</span>
        <span><b className="mention">@product</b> and engineering. Keep</span>
        <span>this page up to date as we ship.</span>
      </p>
      <div className="hw-task">
        <span className="check"><Icon name="check" /></span>
        <span>Ship the new search experience</span>
        <time>Apr 28</time>
      </div>
      <HeroProjects />
    </div>
  );
}
