import { DocsLink } from "../../docs/DocsLink";
import { copy } from "../copy";
import { HeroStage } from "../drawings/hero/HeroStage";
import { docsHomeSlug, runPath } from "../links";

const { hero } = copy;

// The replaces line with each company it names in <strong>; the rest of the sentence keeps the normal weight.
const boldNames = new RegExp(`(${hero.replacesBold.join("|")})`);
const replacesLine = hero.replaces.split(boldNames).map((part, i) => (i % 2 ? <strong key={part}>{part}</strong> : part));

// The page's one h1 is the owner's name in the header, so the headline here is an h2 set at display size.
export function Hero() {
  return (
    <section className="hero" id="top" aria-labelledby="hero-title">
      <HeroStage />
      <div className="hero-copy">
        <h2 id="hero-title">{hero.title}</h2>
        <p className="hero-sub">{hero.sub}</p>
        <p className="fine hero-replaces">{replacesLine}</p>
        <div className="actions">
          <a className="pill pill--ink pill--large" href={runPath}>{hero.primary}</a>
          <DocsLink className="text-link" slug={docsHomeSlug}>{hero.secondary}</DocsLink>
        </div>
      </div>
    </section>
  );
}
