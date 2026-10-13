import { copy } from "./copy";
import { SiteFooter } from "./parts/SiteFooter";
import { SiteHeader } from "./parts/SiteHeader";
import { Databases } from "./sections/Databases";
import { Hero } from "./sections/Hero";
import { History } from "./sections/History";
import { Included } from "./sections/Included";
import { MoveIn } from "./sections/MoveIn";
import { OpenSource } from "./sections/OpenSource";
import { Pages } from "./sections/Pages";
import { Search } from "./sections/Search";
import { Sharing } from "./sections/Sharing";
import { Start } from "./sections/Start";
import { RunSite } from "./site";
import "./styles";

/**
 * HOME-001. The run site's homepage (run-slate.com `/`, built by `rer build --site`): the owner's identity in the header and
 * footer, a static description of the product and Run Slate, which opens `/run`. It links to no instance-only route, reads no
 * workspace data, loads only same-origin resources and sets no cookies. An installed Slate answers `/` with the Lobby.
 */
export function Landing() {
  return (
    <RunSite.Provider value={true}>
      <div className="slate-landing">
        <a className="skip-link" href="#top">{copy.skip}</a>
        <SiteHeader />
        <main>
          <Hero />
          <OpenSource />
          <Pages />
          <Databases />
          <Search />
          <div className="pair">
            <Sharing />
            <History />
          </div>
          <Included />
          <MoveIn />
          <Start />
        </main>
        <SiteFooter />
      </div>
    </RunSite.Provider>
  );
}
