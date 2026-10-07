import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.goto("http://127.0.0.1:4174/signin");
  await page.getByTestId("local-sign-in").click();
  await page.waitForURL("**/app");
  const fixture = await page.evaluate(async () => {
    const list = await (await fetch("/api/pages")).json(),
      member = await (await fetch("/api/members/current")).json();
    const created = await fetch("/api/pages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        operationKey: crypto.randomUUID(),
        containerId: list.items[0].containerId,
        title: `Decision acceptance ${Date.now()}`,
      }),
    });
    const value = await created.json();
    if (!created.ok) throw Error(JSON.stringify(value));
    const document = await (
      await fetch(`/api/pages/${value.value.pageId}`)
    ).json();
    return { document, member };
  });
  async function draft(
    question,
    outcome,
    targetPageId = fixture.document.page.id,
  ) {
    return page.evaluate(
      async ({ fixture, question, outcome, targetPageId }) => {
        const res = await fetch("/api/decisions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            operationKey: crypto.randomUUID(),
            pageId: targetPageId,
            question,
            options: ["Delay", "Proceed"],
            outcome,
            rationale: "The scoped page supports the chosen outcome.",
            ownerId: fixture.member.id,
            decidedAt: null,
            reviewAt: null,
            citations: [
              {
                kind: "page",
                sourceId: fixture.document.page.id,
                revisionId: fixture.document.workingRevisionId,
              },
            ],
          }),
        });
        const value = await res.json();
        if (!res.ok) throw Error(JSON.stringify(value));
        return value.value.id;
      },
      { fixture, question, outcome, targetPageId },
    );
  }
  const first = await draft(
    "Should this local acceptance work proceed?",
    "Proceed within the test scope.",
  );
  await page.goto(
    `http://127.0.0.1:4174/app/pages/${fixture.document.page.id}`,
  );
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await page
    .locator(`#decision-${first}`)
    .getByRole("button", { name: "Accept decision", exact: true })
    .click();
  await page
    .locator(`#decision-${first}`)
    .getByText("accepted", { exact: true })
    .waitFor();
  const secondPage = await page.evaluate(async (containerId) => {
    const res = await fetch("/api/pages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        operationKey: crypto.randomUUID(),
        containerId,
        title: `Replacement decision ${Date.now()}`,
      }),
    });
    const result = await res.json();
    if (!res.ok) throw Error(JSON.stringify(result));
    return result.value.pageId;
  }, fixture.document.page.containerId);
  const second = await draft(
    "Should the earlier test decision change?",
    "Delay under the revised test decision.",
    secondPage,
  );
  await page.goto(`http://127.0.0.1:4174/app/pages/${secondPage}`);
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  const replacement = page.locator(`#decision-${second}`);
  await replacement
    .getByLabel("Replaces an earlier decision")
    .selectOption(first);
  await replacement
    .getByRole("button", { name: "Accept decision", exact: true })
    .click();
  await replacement.getByText("accepted", { exact: true }).waitFor();
  const result = await page.evaluate(
    async ({ first, second, pageId }) => ({
      first: await (await fetch(`/api/decisions/${first}`)).json(),
      second: await (await fetch(`/api/decisions/${second}`)).json(),
      document: await (await fetch(`/api/pages/${pageId}`)).json(),
    }),
    { first, second, pageId: fixture.document.page.id },
  );
  assert.equal(result.first.state, "superseded");
  assert.equal(result.first.superseded_by_decision_id, second);
  assert.equal(result.first.outcome, "Proceed within the test scope.");
  assert.equal(result.second.state, "accepted");
  assert.equal(result.second.content.supersedesId, first);
  assert.deepEqual(result.document.blocks, fixture.document.blocks);
  await page.goto(
    `http://127.0.0.1:4174/app/pages/${fixture.document.page.id}`,
  );
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await page
    .locator(`#decision-${first}`)
    .getByRole("link", { name: /Read the replacement decision/ })
    .waitFor();
  console.log(
    JSON.stringify({
      passed: true,
      pageId: fixture.document.page.id,
      first,
      second,
      checks: [
        "appointed owner accepts exact decision",
        "replacement supersedes without rewriting prior outcome",
        "bidirectional lineage survives reload",
        "page body unchanged",
      ],
      interceptedRequests: 0,
    }),
  );
} finally {
  await browser.close();
}
