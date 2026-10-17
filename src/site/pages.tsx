import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { contractPageHtml } from "../base/runtime/contract-page";
import { runPageHtml, siteNotFoundHtml, type SiteBuild, type SiteContext } from "../base/runtime/run-site";
import "../core/app/styles.css";
import { fontLinks } from "../core/app/font-head";
import { ownerIdentity } from "../ext/config";
import { DocsPage } from "../core/features/docs/DocsPage";
import { docsHead } from "../core/features/docs/head";
import { loadDocsPage } from "../core/features/docs/load";
import { Landing } from "../core/features/landing/Landing";
import { copy } from "../core/features/landing/copy";
import { RunSite } from "../core/features/landing/site";
import { identity } from "../identity";
import { run } from "./run";

// The public files these pages use, copied from public/ to the run site.
const icons = ["favicon.svg", "favicon-32.png", "favicon.ico", "apple-touch-icon.png"];

/**
 * The run site (run-slate.com), written by `rer build --site`: the approved landing at `/`, whose Run Slate opens the Run
 * page at `/run`; the docs at `/docs` and `/docs/<slug>`, rendered by the same components and docs module as an installed
 * Slate's docs routes; and the not-found page. Every page is static and links to no instance-only route.
 */
export async function sitePages({ styles, contract }: SiteContext): Promise<SiteBuild> {
  const document = (title: string, description: string, body: ReactElement) => "<!doctype html>" + renderToStaticMarkup(
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {fontLinks.map(link => <link key={link.href} {...link} />)}
        {styles.map(href => <link key={href} rel="stylesheet" href={href} />)}
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta name="theme-color" content="#f6f3e8" />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
        <link rel="shortcut icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
      </head>
      <body>{body}</body>
    </html>,
  );
  const { sections } = await import("virtual:slate-docs");
  const docs = await Promise.all(sections.flatMap(section => section.pages).map(async ({ slug }) => {
    const view = await loadDocsPage(slug);
    const meta = docsHead(view.page).meta ?? [];
    const title = meta.find(row => "title" in row)?.title ?? "Slate docs";
    return { path: slug ? `/docs/${slug}` : "/docs", html: document(title, view.page.description, <RunSite.Provider value={true}><DocsPage {...view} /></RunSite.Provider>) };
  }));
  return {
    pages: [
      { path: "/", html: document(ownerIdentity.name, `${ownerIdentity.description} ${copy.hero.replaces}.`, <Landing />) },
      { path: "/run", html: runPageHtml(identity, run, contract) },
      ...(contract ? [{ path: "/contract", html: contractPageHtml(identity, run, contract) }] : []),
      ...docs,
      { path: "/404", html: siteNotFoundHtml(identity, run, contract) },
    ],
    assets: ["rer-theme.css", "slate-mark.svg", "brand", "fonts", ...icons],
  };
}
