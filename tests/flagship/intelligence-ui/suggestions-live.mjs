import { signInBrowser } from '../../e2e/outbox-auth.mjs';
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await signInBrowser(page, "http://127.0.0.1:4174", process.env.SLATE_BROWSER_EMAIL ?? 'jamie@aurora.example');
  const created = await page.evaluate(async () => {
    const list = await (await fetch("/api/pages")).json();
    const create = await fetch("/api/pages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        operationKey: crypto.randomUUID(),
        containerId: list.items[0].containerId,
        title: `Suggestion acceptance ${Date.now()}`,
      }),
    });
    const result = await create.json();
    if (!create.ok) throw Error(JSON.stringify(result));
    const pageId = result.value.pageId;
    const document = await (await fetch(`/api/pages/${pageId}`)).json();
    const update = await fetch(`/api/pages/${pageId}/blocks`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        operationKey: crypto.randomUUID(),
        expectedRevisionId: document.workingRevisionId,
        blocks: [
          {
            id: crypto.randomUUID(),
            blockType: "paragraph",
            parentBlockId: null,
            treePosition: "00000000",
            content: { text: [{ text: "Original review wording." }] },
          },
        ],
      }),
    });
    if (!update.ok) throw Error(await update.text());
    return { pageId };
  });
  await page.goto(`http://127.0.0.1:4174/app/pages/${created.pageId}`);
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await page.getByText("Suggestions & permissions", { exact: true }).click();
  await page.getByText("Suggested page changes", { exact: true }).click();
  await page.getByText("Suggest a paragraph change", { exact: true }).click();
  await page
    .getByRole("combobox", { name: "Paragraph", exact: true })
    .selectOption({ label: "Paragraph 1" });
  await page.getByLabel("Proposed wording").fill("Accepted review wording.");
  await page
    .getByRole("button", { name: "Propose change", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Accept suggestion", exact: true })
    .waitFor();
  const read = () =>
    page.evaluate(
      async (id) => await (await fetch(`/api/pages/${id}`)).json(),
      created.pageId,
    );
  let document = await read();
  assert.equal(
    document.blocks[0].content.text[0].text,
    "Original review wording.",
  );
  await page
    .getByRole("button", { name: "Accept suggestion", exact: true })
    .click();
  await page.waitForFunction(
    async (id) =>
      (await (await fetch(`/api/pages/${id}`)).json()).blocks[0].content.text[0]
        .text === "Accepted review wording.",
    created.pageId,
  );
  document = await read();
  assert.equal(
    document.blocks[0].content.text[0].text,
    "Accepted review wording.",
  );
  await page.reload();
  await page.getByRole("button", { name: "Ask", exact: true }).waitFor();
  assert.equal(
    (await read()).blocks[0].content.text[0].text,
    "Accepted review wording.",
  );
  console.log(
    JSON.stringify({
      passed: true,
      pageId: created.pageId,
      checks: [
        "real suggestion leaves source unchanged",
        "explicit acceptance updates real page",
        "accepted change survives reload",
      ],
      provider: "none",
      interceptedRequests: 0,
    }),
  );
} finally {
  await browser.close();
}
