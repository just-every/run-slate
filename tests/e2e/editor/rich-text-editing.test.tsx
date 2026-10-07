import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { chromium } from "@playwright/test";
import { renderToStaticMarkup } from "react-dom/server";
import { transpileModule, ModuleKind, ScriptTarget } from "typescript";
import { Editable } from "../../../src/core/features/editor/ui/blocks/Editable";
import type { RichText } from "../../../src/core/features/editor/ui/types";

// BLOCK-002, BLOCK-005, COMM-001: editing a run must retain semantic spans.
test("browser editing preserves formatting, links, mentions and comment anchors", async () => {
  const value: RichText = [
    { text: "Bold", marks: ["bold", "italic"], colour: "yellow", commentAnchorId: "thread-1" },
    { text: " linked", link: { href: "https://example.com/page" }, marks: ["underline"] },
    { text: "member-id", mention: { kind: "person", id: "member-id", label: "Ada" } },
    { text: " tail" },
  ];
  const markup = renderToStaticMarkup(<Editable value={value} canEdit label="Body" placeholder="Write" onChange={() => {}} />);
  const source = await readFile(new URL("../../../src/core/features/editor/ui/blocks/readRichText.ts", import.meta.url), "utf8");
  const script = transpileModule(source, { compilerOptions: { module: ModuleKind.ESNext, target: ScriptTarget.ES2022 } }).outputText.replaceAll("export function", "function");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(markup);
    await page.addScriptTag({ content: script + ";window.readRichText = readRichText;" });
    const read = () => page.evaluate((previous) => {
      const runtime = window as unknown as { readRichText: (root: HTMLElement, value: RichText) => RichText };
      return runtime.readRichText(document.querySelector("[data-slate-editable]") as HTMLElement, previous);
    }, value);
    assert.deepEqual(await read(), value, "an unchanged mention keeps its stored text, not its displayed @label");
    await page.locator('[data-inline-span="0"]').click();
    await page.evaluate(() => {
      const text = document.querySelector('[data-inline-span="0"] strong')!.firstChild!;
      const selection = window.getSelection()!;
      const range = document.createRange();
      range.selectNodeContents(text);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    });
    await page.keyboard.type("er");
    assert.deepEqual(await read(), [{ ...value[0], text: "Bolder" }, ...value.slice(1)]);
    assert.equal(await page.locator('[data-inline-span="2"]').getAttribute("contenteditable"), "false");
    await page.locator('[data-inline-span="1"]').evaluate((node) => node.remove());
    assert.deepEqual(await read(), [{ ...value[0], text: "Bolder" }, ...value.slice(2)], "deleting one run does not shift the source metadata of its neighbours");
    await page.locator('[data-slate-editable]').evaluate((node) => node.insertAdjacentHTML("beforeend", "<div>next<br>line</div>"));
    assert.deepEqual((await read()).slice(-4), [{ text: "\n" }, { text: "next" }, { text: "\n" }, { text: "line" }]);
  } finally {
    await browser.close();
  }
});
