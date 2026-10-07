import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";

// BLOCK-002: exercise the real controlled React loop, including native IME events.
test("Editable preserves composition through parent renders and accepts external values", { timeout: 60000 }, async () => {
  const repository = fileURLToPath(new URL("../../../", import.meta.url));
  const cacheDir = await mkdtemp(path.join(tmpdir(), "slate-editable-vite-"));
  let server;
  let browser;
  try {
    server = await createServer({
      configFile: false,
      root: fileURLToPath(new URL("./fixtures/", import.meta.url)),
      cacheDir,
      logLevel: "error",
      esbuild: { jsx: "automatic" },
      resolve: { dedupe: ["react", "react-dom"] },
      server: { host: "127.0.0.1", port: 0, fs: { allow: [repository] } },
    });
    await server.listen();
    browser = await chromium.launch();
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);
    await page.waitForFunction(() => Boolean(window.editableTest));
    const editor = page.getByRole("textbox", { name: "Test editor" });
    await page.evaluate(() => window.editableTest.setValue([{ text: "Bold", marks: ["bold"] }]));
    await expect(editor).toHaveText("Bold");
    await editor.focus();
    await editor.evaluate(root => {
      const text = root.querySelector("strong").firstChild;
      getSelection().setBaseAndExtent(text, 2, text, 2);
    });

    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.imeSetComposition", { text: "に", selectionStart: 1, selectionEnd: 1 });
    await expect(editor).toHaveText("Boにld");
    assert.deepEqual(await page.evaluate(() => window.editableTest.changes), [], "intermediate composition is not published");
    await page.evaluate(() => window.editableTest.rerender());
    // Let React complete the unrelated parent update before checking DOM ownership.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await expect(editor).toHaveText("Boにld");
    await cdp.send("Input.insertText", { text: "日本" });
    await page.keyboard.type("!");
    await expect(editor).toHaveText("Bo日本!ld");
    assert.deepEqual(await page.evaluate(() => window.editableTest.value), [{ text: "Bo日本!ld", marks: ["bold"] }]);
    await cdp.detach();

    await page.evaluate(() => window.editableTest.setValue([{ text: "External", marks: ["italic"] }]));
    await expect(editor).toHaveText("External");
    await expect(editor.locator("em")).toHaveText("External");
    assert.equal(await editor.evaluate(root => root === document.activeElement), true);

    const literal = '<img src=x onerror="window.injected=true"> & "';
    await page.evaluate(text => window.editableTest.setValue([{
      text,
      commentAnchorId: '\"><img src=x onerror="window.injected=true">',
      link: { href: 'https://example.com/" onclick="window.injected=true' },
    }]), literal);
    await expect(editor).toHaveText(literal);
    assert.equal(await editor.locator("img, [onerror], [onclick]").count(), 0);
    assert.equal(await page.evaluate(() => Boolean(window.injected)), false);
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await server?.close();
    await rm(cacheDir, { recursive: true, force: true });
  }
});
