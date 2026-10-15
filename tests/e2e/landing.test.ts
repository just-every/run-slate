import { SELF, env } from "cloudflare:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { ownerIdentity } from "../../src/core/app/ext-client";
import { Landing } from "../../src/core/features/landing/Landing";
import { seedWorkspace } from "./setup/fixtures";

/**
 * Supporting regressions for the amended HOME-001: an installed Slate answers `/` with the Lobby, and the landing page is
 * the run site's homepage (src/site/pages.tsx, built by `rer build --site`, which refuses instance-only links, other
 * origins and installation data itself). They register exactly in tests/requirements/test-evidence.json as supporting
 * evidence: they cover what the Lobby answers and what the landing renders and may load, not the requirement's full
 * acceptance. Vitest replaces stylesheets with empty modules, so the landing's style rules are checked from disk by
 * tests/e2e/landing-styles.test.mjs.
 */

const sections = ["top", "open-source", "pages", "databases", "search", "sharing", "history", "included", "move-in", "start", "colophon"];
// Every absolute address the landing may link to. All are navigation targets: the page loads nothing from them.
const navigationTargets = new Set([
  "https://demo.run-slate.com/",
  "https://github.com/just-every/run-slate",
  "https://github.com/just-every/run-slate#readme",
  "https://runeditrun.com",
]);

/** Renders the landing as the run site's entry does: static markup, with no router. */
async function renderLanding(): Promise<string> {
  return renderToStaticMarkup(createElement(Landing));
}

async function withIdentity<T>(change: Partial<typeof ownerIdentity>, run: () => Promise<T>): Promise<T> {
  const original = { ...ownerIdentity };
  Object.assign(ownerIdentity, change);
  try {
    return await run();
  } finally {
    Object.assign(ownerIdentity, original);
  }
}

/** The visible text of rendered markup: tags and React's text separators removed, entities for apostrophes and quotes decoded. */
const plain = (html: string) => html.replace(/<!-- -->/g, "").replace(/<\/?strong>/g, "").replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ");

describe("HOME-001 landing page supporting regressions", () => {
  test("installed root: the Worker answers / with the Lobby, which offers setup until the owner finishes first-run setup and sign-in after", async () => {
    const state = async () => (await SELF.fetch("https://slate.test/setup/state")).json();
    const lobby = async () => {
      const response = await SELF.fetch("https://slate.test/");
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toMatch(/text\/html/);
      const cacheDirectives = response.headers.get("cache-control")?.split(",").map(directive => directive.trim().toLowerCase()) ?? [];
      expect(cacheDirectives).toEqual(expect.arrayContaining(["no-store", "no-transform"]));
      expect(response.headers.get("set-cookie")).toBeNull();
      return response.text();
    };
    expect(await state()).toEqual({ state: "unclaimed" });
    const unclaimed = await lobby();
    expect(unclaimed).toContain('class="btn" href="/setup"');
    expect(unclaimed).not.toContain('href="/signin"');

    const { workspaceId } = await seedWorkspace({ name: "Aurora private workspace" });
    await env.DB.prepare("UPDATE workspaces SET first_run_completed_at = ? WHERE id = ?").bind(new Date().toISOString(), workspaceId).run();
    expect(await state()).toEqual({ state: "claimed" });
    const claimed = await lobby();
    expect(claimed).toContain('class="btn" href="/signin"');
    expect(claimed).not.toContain('href="/setup"');
    // The Lobby reveals the claim and nothing else about the installation.
    expect(claimed).not.toContain("Aurora private workspace");
    expect(claimed).not.toMatch(/<script[\s>]/);
  });

  test("landing page: owner identity, description and the credit toggle are read from the owner configuration", async () => {
    const withCredit = await withIdentity({ name: "Qualified owner", description: "Owner sentence.", showFooterCredit: true }, renderLanding);
    expect(withCredit).toContain('<h1 class="brand-name">Qualified owner</h1>');
    // The brand mark is Slate's card logo: a decorative drawing with no text, so a configured mark such as "Q" never reaches the landing.
    const brandMarks = [...withCredit.matchAll(/<span class="brand-mark" aria-hidden="true">([\s\S]*?)<\/svg><\/span>/g)].map((match) => match[1]);
    expect(brandMarks.length).toBeGreaterThan(0);
    for (const mark of brandMarks) expect(plain(mark).trim()).toBe("");
    expect(withCredit).not.toContain("<text");
    expect(plain(withCredit)).not.toMatch(/(^|\s)Q(\s|$)/);
    expect(withCredit).toContain("Owner sentence.");
    expect(withCredit).toContain('href="https://runeditrun.com"');

    const withoutCredit = await withIdentity({ name: "Qualified owner", showFooterCredit: false }, renderLanding);
    expect(withoutCredit).toContain('<h1 class="brand-name">Qualified owner</h1>');
    expect(withoutCredit).not.toContain("runeditrun.com");
  });

  test("landing page: sections, the Run page link and outbound addresses are the static product description only", async () => {
    const html = await withIdentity({ showFooterCredit: true }, renderLanding);
    for (const id of sections) expect(html).toContain(`id="${id}"`);
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
    const hrefs = [...html.matchAll(/<a [^>]*href="([^"]+)"/g)].map((match) => match[1]);
    // The hero and the closing section open the Run page; the run site links to no instance-only route.
    expect(hrefs.filter((href) => href === "/run")).toHaveLength(2);
    for (const href of hrefs) expect(href, href).not.toMatch(/^\/(?:signin|login|sign-in|setup|app|auth)(?:[/?#]|$)/);
    // DOCS-001: the setup-guide links open the first-party documentation.
    for (const href of ["https://github.com/just-every/run-slate", "/docs/install", "/docs"]) expect(hrefs).toContain(href);
    for (const link of [...html.matchAll(/(?:href|src)="(https?:\/\/[^"]+)"/g)].map((match) => match[1])) {
      expect(navigationTargets.has(link), link).toBe(true);
    }
    expect(html).not.toMatch(/<(script|img|iframe|video|audio|object|embed|link|form|input|style)[\s>]/i);
    expect(html).not.toMatch(/url\(|data:|@import|srcset/i);
  });

  const sources = import.meta.glob("../../src/core/features/landing/**/*.{ts,tsx,css}", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

  test("landing page: source loads nothing off-origin, sets no cookies and tracks no one", () => {
    const files = Object.entries(sources);
    expect(files.length).toBeGreaterThan(0);
    for (const [file, source] of files) {
      const withoutXmlns = source.replaceAll("http://www.w3.org/2000/svg", "");
      // Authorized navigation never loads a resource until the visitor follows it.
      const withoutNavigation = withoutXmlns.replace(/<a\b[^>]*\bhref="([^"]+)"[^>]*>/g,
        (tag, href: string) => navigationTargets.has(href) ? "" : tag);
      const urls = withoutNavigation.match(/https?:\/\/[^\s"'`)<>]+/g) ?? [];
      if (!file.endsWith("/links.ts")) expect(urls, file).toEqual([]);
      expect(source, file).not.toMatch(/@import|url\(\s*["']?(?:https?:)?\/\/|url\(\s*["']?data:/);
      expect(source, file).not.toMatch(/document\.cookie|localStorage|sessionStorage|sendBeacon|XMLHttpRequest|\bfetch\(|<img|<script|<iframe|navigator\.|gtag|analytics/i);
    }
    const links = Object.entries(sources).find(([file]) => file.endsWith("/links.ts"))?.[1] ?? "";
    for (const url of links.match(/https?:\/\/[^\s"'`;)]+/g) ?? []) expect(navigationTargets.has(url), url).toBe(true);
  });
});
