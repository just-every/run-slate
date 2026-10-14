import { SELF } from "cloudflare:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { isHonoRequest } from "../../src/core/app/hono";
import { Landing } from "../../src/core/features/landing/Landing";

/**
 * Supporting regressions for DOCS-001. They register exactly in tests/requirements/test-evidence.json as supporting
 * evidence: they cover what the documentation routes render and which requests they refuse, not the requirement's full
 * acceptance. The manifest, link and content rules are checked from the tree by tests/docs-site.mjs, and the emitted
 * artifact by tests/e2e/production-artifact.test.mjs.
 */

const published = ["", "install", "moving-in", "backup", "email-delivery", "cloudflare-footprint"];
const get = (path: string) => SELF.fetch(`https://slate.test${path}`);
const links = (html: string) => [...html.matchAll(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map((match) => [match[1], match[2].replace(/<[^>]+>/g, "").trim()]);

describe("DOCS-001 public documentation supporting regressions", () => {
  test("docs: the Worker serves /docs and each published page with one h1, the landing frame and the section navigation", async () => {
    for (const slug of published) {
      const path = slug ? `/docs/${slug}` : "/docs";
      const response = await get(path);
      expect(response.status, path).toBe(200);
      expect(response.headers.get("content-type"), path).toMatch(/text\/html/);
      expect(response.headers.get("set-cookie"), path).toBeNull();
      const html = await response.text();
      expect(html.match(/<h1[\s>]/g), path).toHaveLength(1);
      expect(html, path).toContain('<h1 id="');
      expect(html, path).toContain('class="slate-landing slate-docs"');
      expect(html, path).toContain('<main id="docs-content"');
      expect(html, path).toContain("Edit this page on GitHub");
      for (const target of ["/docs", "/docs/install", "/docs/moving-in", "/docs/backup", "/docs/email-delivery", "/docs/cloudflare-footprint"]) expect(html, `${path} nav ${target}`).toContain(`href="${target}"`);
      expect(html, path).not.toMatch(/Jamie Park|aurora\.example/);
      // Nothing is loaded from another origin; the only outbound links are GitHub, the credit and, on the footprint page, Cloudflare's pricing pages.
      expect(html, path).not.toMatch(/\ssrc="https?:/);
      for (const link of [...html.matchAll(/href="(https?:\/\/[^"]+)"/g)].map((match) => match[1])) {
        const allowed = slug === "cloudflare-footprint" ? /^https:\/\/(github\.com\/just-every\/(?:run-)?slate|runeditrun\.com|developers\.cloudflare\.com\/)/ : /^https:\/\/(github\.com\/just-every\/(?:run-)?slate|runeditrun\.com)/;
        expect(link, `${path} ${link}`).toMatch(allowed);
      }
    }
    const install = await (await get("/docs/install")).text();
    expect(install).toContain("<title>Install and deploy · Slate docs</title>");
    expect(install).toContain('href="https://github.com/just-every/run-slate/edit/main/docs/INSTALL.md"');
    expect(install).toContain('rel="next"');
    expect(install).toContain('rel="prev"');
    // The current page alone is marked in the section navigation.
    expect(install.match(/aria-current="page"[^>]*href="\/docs\/install"/g)).toHaveLength(2);
    expect(install).not.toMatch(/<(img|iframe|video|audio|object|embed|form|input)[\s>]/i);
    // The document head contains the trusted hydration intro guard's stylesheet;
    // documentation content must still introduce no media, forms or styles.
    const body = install.slice(install.indexOf("<body"));
    expect(body).toMatch(/^<body[\s>]/i);
    expect(body).not.toMatch(/<(img|iframe|video|audio|object|embed|form|input|style)[\s>]/i);
    expect(install).not.toMatch(/\sstyle="|\son[a-z]+="/);
  });

  test("docs: an unknown, miscased or nested slug is a real 404 and /docs is not a Hono or operator route", async () => {
    for (const path of ["/docs/does-not-exist", "/docs/Install", "/docs/install/extra", "/docs/index", "/docs/__proto__", "/docs/constructor"]) {
      const response = await get(path);
      expect(response.status, path).toBe(404);
      expect(await response.text(), path).toContain("Not found");
    }
    for (const path of ["/docs", "/docs/", "/docs/install"]) expect(isHonoRequest(path), path).toBe(false);
    // /docs/ is the docs home, not a redirect.
    expect((await get("/docs/")).status).toBe(200);
    // Anonymous /app is untouched.
    const app = await SELF.fetch("https://slate.test/app", { redirect: "manual" });
    expect(app.status).toBe(302);
    expect(app.headers.get("location")).toBe("/signin?next=%2Fapp");
  });

  test("docs: the landing links to /docs and /docs/install and the docs header has no brand h1", async () => {
    // The landing is the run site's homepage (src/site/pages.tsx renders it the same way).
    const landing = renderToStaticMarkup(createElement(Landing));
    const landingHrefs = links(landing).map(([href]) => href);
    // Header, footer and the hero's guide link open the docs home; the moving-in section opens the setup guide.
    expect(landingHrefs.filter((href) => href === "/docs")).toHaveLength(3);
    expect(landingHrefs).toContain("/docs/install");
    // Neither marks the landing as a docs page.
    expect(landing).not.toMatch(/href="\/docs"[^>]*aria-current|aria-current[^>]*href="\/docs"/);
    expect(landing).toContain('<h1 class="brand-name">');

    const docs = await (await get("/docs/install")).text();
    expect(docs).not.toContain('<h1 class="brand-name">');
    expect(docs).toContain('<span class="brand-name">');
    expect(links(docs)).toContainEqual(["/", expect.stringContaining("")]);
    const header = docs.slice(docs.indexOf("<header"), docs.indexOf("</header>"));
    expect(header).toMatch(/aria-current="page"[^>]*href="\/docs"/);
    expect(header.indexOf('href="/docs"')).toBeLessThan(header.indexOf('href="https://github.com/just-every/run-slate"'));
  });
});
