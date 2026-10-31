import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { landingBrowser } from './landing-browser.mjs';

/**
 * HOME-003: retain stylesheet regressions, then observe the actual built run-site page in Chromium.
 * The browser helper checks the complete script-free page, its painted styles and its resource requests.
 */
const stylesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../src/core/features/landing/styles");
const files = readdirSync(stylesDir).filter((name) => name.endsWith(".css"));
const read = (name) => readFileSync(path.join(stylesDir, name), "utf8");
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

test("landing styles preserve the light palette, same-origin resources and reduced-motion access", async () => {
  // Each row retains its original fixture and every assertion.
  const cases = [
    { name: "landing styles: one fixed light palette that does not follow the document theme", run: () => {
  const base = stripComments(read("base.css"));
  assert.match(base, /body:has\(\.slate-landing\)\s*\{[^}]*background:\s*#f6f3e8/);
  assert.match(base, /\.slate-landing\s*\{[^}]*color-scheme:\s*light/);
  for (const name of files) assert.doesNotMatch(stripComments(read(name)), /prefers-color-scheme|data-theme|color-scheme:\s*dark/, name);
} },
    { name: "landing styles: nothing is loaded from another origin and no image is embedded", run: () => {
  for (const name of files) {
    const css = stripComments(read(name));
    assert.doesNotMatch(css, /@import|url\(\s*["']?(?:https?:)?\/\/|url\(\s*["']?data:/, name);
    assert.doesNotMatch(css.replace(/http:\/\/www\.w3\.org\/2000\/svg/g, ""), /https?:\/\//, name);
  }
  // The root document links the Outfit faces from public/fonts on every route.
  const fonts = stripComments(readFileSync(path.join(stylesDir, "../../../../../public/fonts/fonts.css"), "utf8"));
  assert.doesNotMatch(fonts, /@import|https?:\/\/|url\(\s*["']?data:/);
  assert.match(fonts, /url\('\/fonts\/outfit\//);
} },
    { name: "landing styles: motion is gated on no-preference and removed for reduced motion", run: () => {
  const motion = stripComments(read("motion.css"));
  assert.match(motion, /@media \(prefers-reduced-motion: no-preference\)/);
  assert.match(motion, /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation: none !important/);
  assert.doesNotMatch(motion, /infinite/);
} }
  ];
  for (const scenario of cases) {
    try {  await scenario.run(); }
    catch (cause) { throw new Error(`Case ${scenario.name} failed`, { cause }); }
  }
  await landingBrowser();
});
