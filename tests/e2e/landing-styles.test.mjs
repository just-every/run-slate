import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

/**
 * HOME-001 landing page stylesheets. Vitest replaces stylesheets with empty modules, so the landing's style rules are read
 * from disk here: every rule is scoped under .slate-landing, the palette is one fixed light palette, and nothing is loaded
 * from another origin. (tests/e2e/landing.test.ts covers the rendered document and the scripts.)
 */
const stylesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../src/core/features/landing/styles");
const files = readdirSync(stylesDir).filter((name) => name.endsWith(".css"));
const read = (name) => readFileSync(path.join(stylesDir, name), "utf8");
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

test("landing styles: every rule is scoped under .slate-landing", () => {
  assert.ok(files.length >= 10, `expected the landing's split stylesheets, found ${files.length}`);
  for (const name of files) {
    for (const match of stripComments(read(name)).matchAll(/([^{}]+)\{/g)) {
      const prelude = match[1].trim();
      if (prelude.startsWith("@") || /^(from|to|\d+%)$/.test(prelude)) continue;
      for (const selector of prelude.split(",")) assert.ok(selector.includes(".slate-landing"), `${name}: ${selector.trim()}`);
    }
  }
});

test("landing styles: one fixed light palette that does not follow the document theme", () => {
  const base = stripComments(read("base.css"));
  assert.match(base, /body:has\(\.slate-landing\)\s*\{[^}]*background:\s*#f6f3e8/);
  assert.match(base, /\.slate-landing\s*\{[^}]*color-scheme:\s*light/);
  for (const name of files) assert.doesNotMatch(stripComments(read(name)), /prefers-color-scheme|data-theme|color-scheme:\s*dark/, name);
});

test("landing styles: nothing is loaded from another origin and no image is embedded", () => {
  for (const name of files) {
    const css = stripComments(read(name));
    assert.doesNotMatch(css, /@import|url\(\s*["']?(?:https?:)?\/\/|url\(\s*["']?data:/, name);
    assert.doesNotMatch(css.replace(/http:\/\/www\.w3\.org\/2000\/svg/g, ""), /https?:\/\//, name);
  }
  // The root document links the Outfit faces from public/fonts on every route.
  const fonts = stripComments(readFileSync(path.join(stylesDir, "../../../../../public/fonts/fonts.css"), "utf8"));
  assert.doesNotMatch(fonts, /@import|https?:\/\/|url\(\s*["']?data:/);
  assert.match(fonts, /url\('\/fonts\/outfit\//);
});

test("landing styles: motion is gated on no-preference and removed for reduced motion", () => {
  const motion = stripComments(read("motion.css"));
  assert.match(motion, /@media \(prefers-reduced-motion: no-preference\)/);
  assert.match(motion, /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation: none !important/);
  assert.doesNotMatch(motion, /infinite/);
});
