import { Link } from "@tanstack/react-router";
import { ownerIdentity } from "../../../app/ext-client";
import { DocsLink } from "../../docs/DocsLink";
import { copy } from "../copy";
import { contractPath, creditUrl, docsHomeSlug, sourceUrl } from "../links";
import { useRunSite } from "../site";
import { Brand } from "./Brand";

/**
 * The footer. The credit is the buyer's to switch off (`ownerIdentity.showFooterCredit`); the owner's description sits beside it.
 * The run site leaves out Sign in.
 */
export function SiteFooter() {
  const site = useRunSite();
  return (
    <footer className="site-footer" id="colophon">
      <div className="footer-row">
        <div className="footer-id">
          <Brand />
          <p className="footer-tagline">{copy.footer.tagline}</p>
        </div>
        <nav aria-label="Footer navigation">
          <DocsLink slug={docsHomeSlug}>{copy.nav.docs}</DocsLink>
          {site ? <a href={contractPath}>{copy.nav.contract}</a> : null}
          <a href={sourceUrl}>{copy.nav.source}</a>
          {site ? null : <Link to="/signin">{copy.nav.signInShort}</Link>}
        </nav>
        {ownerIdentity.showFooterCredit ? <p className="footer-credit">{copy.footer.credit}<a href={creditUrl}>runeditrun.com</a></p> : null}
      </div>
      <p className="footer-about">{ownerIdentity.description}</p>
    </footer>
  );
}
