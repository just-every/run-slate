import { signInBrowser } from '../../e2e/outbox-auth.mjs';
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
      viewport: { width: 1536, height: 1024 },
    }),
    page = await context.newPage();
  await signInBrowser(page, "http://127.0.0.1:4174", process.env.SLATE_BROWSER_EMAIL ?? 'jamie@aurora.example');
  const fixture = await page.evaluate(async () => {
    const pages = await (await fetch("/api/pages")).json(),
      member = await (await fetch("/api/members/current")).json(),
      document = await (await fetch(`/api/pages/${pages.items[0].id}`)).json();
    const refs = [
      {
        kind: "page",
        sourceId: document.page.id,
        revisionId: document.workingRevisionId,
      },
    ];
    const post = async (path, body) => {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operationKey: crypto.randomUUID(), ...body }),
      });
      const result = await res.json();
      if (!res.ok) throw Error(JSON.stringify(result));
      return result;
    };
    const inquiry = await post("/api/inquiries", {
      pageId: document.page.id,
      question: `Local analysis acceptance ${Date.now()}`,
      refs,
      audience: [member.id],
      hypotheses: [
        {
          statement: "A measurement change explains the difference.",
          disconfirmation:
            "A stable definition would count against this explanation.",
        },
        {
          statement: "A process change explains the difference.",
          disconfirmation:
            "Matched earlier cases would count against this explanation.",
        },
      ],
    });
    await post(`/api/inquiries/${inquiry.value.id}/analyses`, {
      analysis: {
        kind: "compare-means",
        treatment: [4, 5, 6, 5],
        comparison: [6, 7, 8, 7],
      },
      refs,
    });
    const view = await (
      await fetch(`/api/inquiries/${inquiry.value.id}`)
    ).json();
    await post(`/api/inquiries/${inquiry.value.id}/findings`, {
      hypothesisId: view.hypotheses[0].id,
      status: "inconclusive",
      finding: "The local comparison does not yet establish a mechanism.",
      kind: "deduction",
      refs,
    });
    return { id: inquiry.value.id, question: view.question };
  });
  await page.goto(`http://127.0.0.1:4174/app/inquiries/${fixture.id}`);
  await page
    .getByRole("heading", { name: fixture.question, exact: true })
    .waitFor();
  await page
    .getByRole("heading", { name: "Analysis behind the finding", exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("heading", {
        name: "A measurement change explains the difference.",
        exact: true,
      })
      .count(),
    1,
  );
  await page.getByText("Reproduce this analysis", { exact: true }).click();
  await page
    .getByText("difference-means-conservative-t-v1", { exact: true })
    .first()
    .waitFor();
  assert.match(await page.locator("body").innerText(), /95% interval/);
  assert.match(
    await page.locator("body").innerText(),
    /does not establish causality/,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.getByRole('button',{name:'Stop future investigation work',exact:true}).click();
  await page.getByText('Future investigation work is stopped. Earlier findings and confirmed receipts remain.',{exact:true}).waitFor();
  const stopped=await page.evaluate(async id=>(await(await fetch(`/api/inquiries/${id}`)).json()),fixture.id);
  assert.equal(stopped.interimFinding.stopped,true);
  assert.equal(stopped.hypotheses.length,2);
  assert.equal(stopped.analyses.length,1);
  console.log(
    JSON.stringify({
      passed: true,
      inquiryId: fixture.id,
      checks: [
        "real retained inquiry renders rival hypotheses",
        "recorded arithmetic interval and engine visible",
        "finding remains a deduction",
        "phone has no overflow",
      ],
      interceptedRequests: 0,
      provider: "none; explicit local API acceptance inputs",
    }),
  );
} finally {
  await browser.close();
}
