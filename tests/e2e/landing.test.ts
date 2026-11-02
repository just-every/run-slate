import { SELF, env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { ownerIdentity } from "../../src/core/app/ext-client";
import { Landing } from "../../src/core/features/landing/Landing";
import { seedWorkspace, seedMember, seedContainer, seedPage, sessionFor } from "./setup/fixtures";
import worker from "../../src/server";
import type { AppBindings } from "../../src/core/app/types";
import { identity } from "../../src/identity";

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
  test("installed lobby and public landing preserve owner configuration, navigation and privacy", async () => {
  // Each row retains its original fixture and every assertion.
  const cases = [
    { name: "installed root: the Worker answers / with the Lobby, which offers setup until the owner finishes first-run setup and sign-in after", run: async () => {
    // Observe the real entry point and native D1, including reads that return no rows.
    const reads: { sql: string; fields: string[] }[] = [];
    const statement = (native: D1PreparedStatement, read: { sql: string; fields: string[] }): D1PreparedStatement => new Proxy(native, {
      get(target, key) {
        if (key === "bind") return (...values: unknown[]) => statement(target.bind(...values), read);
        const value = Reflect.get(target, key);
        if (typeof value !== "function") return value;
        return async (...args: unknown[]) => {
          const result = await value.apply(target, args);
          const rows = key === "all" || key === "run" ? result.results : result === null ? [] : [result];
          read.fields = [...new Set(rows.flatMap((row: object) => Object.keys(row)))] as string[];
          return result;
        };
      },
    });
    const DB = new Proxy(env.DB, {
      get(target, key) {
        if (key === "prepare") return (sql: string) => {
          const read = { sql, fields: [] as string[] };
          reads.push(read);
          return statement(target.prepare(sql), read);
        };
        const value = Reflect.get(target, key);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const native = async (path: string, headers: HeadersInit = {}, method = "GET", origin = "https://slate.test") => {
      reads.length = 0;
      const execution = createExecutionContext();
      const response = await worker.fetch!(new Request(origin + path, { headers, method }) as Request<unknown, IncomingRequestCfProperties>, { ...env, DB } as AppBindings, execution);
      await waitOnExecutionContext(execution);
      return response;
    };
    const privateName = "synthetic-slate-private-workspace";
    const { workspaceId } = await seedWorkspace({ name: privateName, description: "synthetic-slate-private-description" });
    const { memberId } = await seedMember(workspaceId, { role: "owner", email: ["synthetic-slate-1", "example.test"].join("@"), displayName: "synthetic-slate-private-member" });
    const { containerId } = await seedContainer(workspaceId, { ownerMemberId: memberId, visibility: "private", name: "synthetic-slate-private-container" });
    await seedPage(containerId, { authorMemberId: memberId, title: "synthetic-slate-private-page" });
    const cookie = await sessionFor(memberId, { freshProof: true });
    const assertReads = (path: string, admitted = true) => {
      const stateReads = reads.filter(read => /\bFROM\s+workspaces\b/i.test(read.sql));
      expect(stateReads, `${path}: a fresh state read per request`).toHaveLength(admitted ? 1 : 0);
      for (const read of reads) {
        const tables = [...read.sql.matchAll(/\b(?:FROM|JOIN|INTO)\s+(\w+)/gi)].map(match => match[1]);
        expect(tables.length, read.sql).toBeGreaterThan(0);
        expect(tables.every(table => ["workspaces", "request_limits"].includes(table)), read.sql).toBe(true);
        expect(read.fields.every(field => ["1", "count"].includes(field)), read.sql).toBe(true);
        if (tables.includes("workspaces")) expect(read.sql).not.toMatch(/\*|\b(?:name|description|id|email|display_name)\b/i);
      }
    };
    const state = async (expected: string, headers: HeadersInit = {}) => {
      const response = await native("/setup/state", headers);
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toContain("no-store");
      expect(response.headers.get("set-cookie")).toBeNull();
      expect(await response.json()).toEqual({ state: expected });
      assertReads("/setup/state");
    };
    const lobby = async (expected: string, headers: HeadersInit = {}) => {
      const response = await native("/", headers);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toMatch(/text\/html/);
      const cacheDirectives = response.headers.get("cache-control")?.split(",").map(directive => directive.trim().toLowerCase()) ?? [];
      expect(cacheDirectives).toEqual(expect.arrayContaining(["no-store", "no-transform"]));
      expect(response.headers.get("set-cookie")).toBeNull();
      const html = await response.text();
      expect(html).toContain(`data-state="${expected}"`);
      expect(html).toContain('synthetic-slate-deployment &amp; &lt;owner&gt;');
      expect(html).not.toContain('<owner>');
      expect(html).toContain(`src="${identity.mark}"`);
      expect(html).toContain(`src="${identity.band}"`);
      expect(html.match(/class="btn"/g)).toHaveLength(1);
      expect(html).not.toContain(privateName);
      expect(html).not.toMatch(/synthetic-slate-private|example\.test|<script[\s>]/);
      assertReads("/");
      return html;
    };
    const originalDeployment = identity.deployment;
    identity.deployment = "synthetic-slate-deployment & <owner>";
    try {
    for (const expected of ["unclaimed", "claimed", "unclaimed"] as const) {
      await env.DB.prepare("UPDATE workspaces SET first_run_completed_at = ? WHERE id = ?").bind(expected === "claimed" ? "2026-10-31T00:00:00.000Z" : null, workspaceId).run();
      await state(expected);
      const html = await lobby(expected);
      expect(html).toContain(`class="btn" href="${expected === "claimed" ? "/signin" : "/setup"}"`);
      expect(html).not.toContain(`href="${expected === "claimed" ? "/setup" : "/signin"}"`);
      await state(expected, { cookie });
      expect(await lobby(expected, { cookie })).toBe(html);
      // Both the URL origin and Host fence run before any installation read.
      for (const path of ["/", "/setup/state"]) {
        for (const [origin, headers] of [["https://foreign.test", {}], ["https://slate.test", { host: "foreign.test", cookie }]] as const) {
          const refused = await native(path, headers, "GET", origin);
          expect(refused.status).toBe(404);
          expect(refused.headers.get("set-cookie")).toBeNull();
          expect(await refused.text()).not.toMatch(/synthetic-slate-private|claimed|example\.test/);
          assertReads(path, false);
          expect(reads).toEqual([]);
        }
        const head = await native(path, { cookie }, "HEAD");
        expect(head.status).toBe(200);
        expect(head.headers.get("cache-control")).toContain("no-store");
        expect(await head.text()).toBe("");
        assertReads(path);
      }
    }
    } finally { identity.deployment = originalDeployment; }
    // The deployed SELF door uses the same completed native marker.
    await env.DB.prepare("UPDATE workspaces SET first_run_completed_at = ? WHERE id = ?").bind("2026-10-31T00:00:00.000Z", workspaceId).run();
    expect(await (await SELF.fetch("https://slate.test/setup/state")).json()).toEqual({ state: "claimed" });
    expect(await (await SELF.fetch("https://slate.test/")).text()).toContain('class="btn" href="/signin"');

  } },
    { name: "landing page: owner identity, description and the credit toggle are read from the owner configuration", run: async () => {
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
  } },
    { name: "landing page: sections, the Run page link and outbound addresses are the static product description only", run: async () => {
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
  } },
    { name: "landing page: source loads nothing off-origin, sets no cookies and tracks no one", run: () => {
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
  } }
  ];
  for (const scenario of cases) {
    try {  await scenario.run(); }
    catch (cause) { throw new Error(`Case ${scenario.name} failed`, { cause }); }
  }
});





  const sources = import.meta.glob("../../src/core/features/landing/**/*.{ts,tsx,css}", { query: "?raw", import: "default", eager: true }) as Record<string, string>;


});
