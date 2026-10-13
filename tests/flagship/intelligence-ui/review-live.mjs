import { signInBrowser } from '../../e2e/outbox-auth.mjs';
import assert from "node:assert/strict";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";
// UI isolation only: provider answers are controlled fixtures, never live-provider proof.
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 1536, height: 1024 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await signInBrowser(page, "http://127.0.0.1:4174", process.env.SLATE_BROWSER_EMAIL ?? 'jamie@aurora.example');
  const document = await page.evaluate(async () => {
    const list = await (await fetch("/api/pages")).json();
    if (!list.items.length)
      throw Error("Requires existing isolated local page");
    return (await fetch(`/api/pages/${list.items[0].id}`)).json();
  });
  await page.route("**/api/ai/availability", (route) =>
    route.fulfill({
      json: {
        enabled: true,
        providerConfigured: true,
        modelPolicyConfigured: true,
        localProvider: true,
        accountingUnit: "tokens",
        monthlyTokenAllowance: 100000,
        perRunTokenAllowance: 5000,
      },
    }),
  );
  const run = {
    id: "ui-review-test",
    kind: "edit",
    status: "needs-review",
    stage: "review",
    revisionId: "run-revision",
    cost: 120,
    costUnit: "tokens",
    monetaryCost: null,
    inputRefs: [
      {
        kind: "page",
        sourceId: document.page.id,
        sourceRevisionId: document.workingRevisionId,
        freshness: "current",
        authorityState: "document-not-authority",
        observedAt: "2026-09-27T00:00:00Z",
        scope: "reader",
      },
    ],
    audience: ["test-reader"],
    completedEffects: [],
    uncertainEffects: [],
    availableActions: ["cancel"],
    output: {
      answer: {
        statements: [
          {
            text: "A proposed clarification is ready.",
            kind: "deduction",
            evidenceIds: ["E1"],
            limitations: [],
          },
        ],
        unresolved: [],
        proposedChanges: [
          {
            targetId: document.page.id,
            text: "A reviewed additional paragraph.",
            evidenceIds: ["E1"],
          },
        ],
        researchPlan: null,
      },
    },
  };
  let accepted = null;
  let attempts = 0;
  const askBodies = [];
  await page.route("**/api/ai/ask", async (route) => {
    askBodies.push(route.request().postDataJSON());
    attempts++;
    await route.fulfill({
      status: attempts === 1 ? 503 : 200,
      contentType: "application/json",
      body: JSON.stringify(
        attempts === 1
          ? {
              code: "UNAVAILABLE",
              message: "The test provider is unavailable.",
            }
          : { value: { id: run.id } },
      ),
    });
  });
  await page.route(`**/api/runs/${run.id}`, (route) =>
    route.fulfill({ json: run }),
  );
  await page.route(`**/api/runs/${run.id}/accept-changes`, async (route) => {
    accepted = route.request().postDataJSON();
    run.status = "completed";
    await route.fulfill({
      json: { value: { id: run.id, status: "completed" } },
    });
  });
  await page.goto(`http://127.0.0.1:4174/app/pages/${document.page.id}`);
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await page.getByLabel("Your question").fill("Clarify this page");
  await page.getByLabel("How can Slate help?").selectOption("edit");
  await page.getByRole("button", { name: "Ask Slate", exact: true }).click();
  await page
    .getByText("The test provider is unavailable.", { exact: true })
    .waitFor();
  assert.equal(
    await page.getByLabel("Your question").inputValue(),
    "Clarify this page",
  );
  await page.getByRole("button", { name: "Ask Slate", exact: true }).click();
  await page
    .getByText("A reviewed additional paragraph.", { exact: true })
    .waitFor();
  assert.equal(
    askBodies[0].operationKey,
    askBodies[1].operationKey,
    "uncertain ask retry must retain operation identity",
  );
  assert.equal(accepted, null, "reading a proposal must not write");
  await page.getByRole("link", { name: "Source 1", exact: true }).click();
  await page
    .getByRole("link", { name: "Open current page", exact: true })
    .waitFor();
  assert.equal(await page.locator(".evidence-reference[open]").count(), 1);
  const axe = await new AxeBuilder({ page }).include(".run-result").analyze();
  assert.deepEqual(
    axe.violations
      .filter((item) => ["serious", "critical"].includes(item.impact))
      .map((item) => ({ id: item.id, description: item.description })),
    [],
    "intelligence surface has no serious accessibility violations",
  );
  const evidenceDirectory =
    ".artifacts/browser/intelligence-ui";
  await mkdir(evidenceDirectory, { recursive: true });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: `${evidenceDirectory}/selected-edit-desktop-isolated.png`,
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: `${evidenceDirectory}/selected-edit-phone-isolated.png`,
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.setViewportSize({ width: 1536, height: 1024 });
  await page.locator(".proposal-review input[type=checkbox]").check();
  await page.getByRole("button", { name: "Apply 1 selected change" }).click();
  await page.getByText("completed", { exact: true }).first().waitFor();
  assert.equal(accepted.expectedRevisionId, "run-revision");
  assert.equal(
    accepted.selections[0].expectedPageRevisionId,
    document.workingRevisionId,
  );
  assert.equal(accepted.selections[0].mode, "insert-below");
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
    "phone document must not overflow",
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: exact evidence opens; proposal waits for selected acceptance; CAS binds page/run; failed ask preserves text and operation key; phone has no overflow. Provider and apply endpoints were isolated test fixtures.",
  );
} finally {
  await browser.close();
}
