/**
 * Regenerates the raster favicons from `public/favicon.svg` (Slate's card mark). Run `node scripts/generate-icons.mjs` after the
 * artwork changes and commit the output; nothing here runs at build or request time.
 *
 * Writes `public/favicon-32.png`, `public/apple-touch-icon.png` (the mark on the landing's paper colour) and `public/favicon.ico`
 * (a 16x16 and a 32x32 PNG inside an ICO container, so `/favicon.ico` answers without a Worker route).
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
const paper = "#f6f3e8";
const svg = await readFile(path.join(publicDir, "favicon.svg"), "utf8");

const browser = await chromium.launch();
try {
  const page = await (await browser.newContext({ colorScheme: "light", deviceScaleFactor: 1 })).newPage();

  /** Renders the favicon artwork at `size` px, inset by `inset` of the side, over `background` (transparent when null). */
  async function render(size, { inset = 0, background = null } = {}) {
    const mark = Math.round(size * (1 - 2 * inset));
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
      `<style>html,body{margin:0;width:${size}px;height:${size}px;background:${background ?? "transparent"};display:grid;place-items:center}svg{width:${mark}px;height:${mark}px;display:block}</style>${svg}`,
    );
    return page.screenshot({ type: "png", omitBackground: background === null, clip: { x: 0, y: 0, width: size, height: size } });
  }

  const png16 = await render(16);
  const png32 = await render(32);
  const touch = await render(180, { inset: 0.16, background: paper });

  await writeFile(path.join(publicDir, "favicon-32.png"), png32);
  await writeFile(path.join(publicDir, "apple-touch-icon.png"), touch);
  await writeFile(path.join(publicDir, "favicon.ico"), ico([[16, png16], [32, png32]]));
} finally {
  await browser.close();
}

/** An ICO container holding PNG images (supported by every browser that requests /favicon.ico). */
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + 16 * images.length;
  const entries = images.map(([size, data]) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size, 0);
    entry.writeUInt8(size, 1);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...images.map(([, data]) => data)]);
}
