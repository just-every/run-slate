import { Link } from "@tanstack/react-router";
import { DocsLink } from "../../docs/DocsLink";
import { copy } from "../copy";
import { docsHomeSlug, sourceUrl } from "../links";
import { Brand } from "./Brand";
import { useRunSite } from "../site";
import { HomeBrand } from "./HomeBrand";

/**
 * The landing's header holds the page's one h1 (the owner's name); a docs page passes `page="docs"` and its title is the h1.
 * The run site leaves out the sign-in pill: it links to no instance-only route.
 */
export function SiteHeader({ page = "landing" }: { page?: "landing" | "docs" }) {
  const docs = page === "docs";
  const site = useRunSite();
  return (
    <header className="site-header">
      {docs ? <HomeBrand /> : <Brand heading />}
      <nav aria-label="Main navigation">
        <DocsLink slug={docsHomeSlug} aria-current={docs ? "page" : undefined}>{copy.nav.docs}</DocsLink>
        <a href={sourceUrl}>{copy.nav.source}</a>
        {site ? null : <Link className="pill pill--ink" to="/signin">{copy.nav.signIn}</Link>}
      </nav>
    </header>
  );
}
