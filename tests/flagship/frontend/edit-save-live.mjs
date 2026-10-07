import { chromium, expect } from "@playwright/test";
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1536, height: 1024 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("http://127.0.0.1:4174/signin");
  await page.getByTestId("local-sign-in").click();
  await page.waitForURL("**/app");
  await page
    .getByRole("link", { name: "Interface review notes", exact: true })
    .click();
  const editable = page.locator("[data-slate-editable]").first();
  await editable.fill("A considered note, saved in the real workspace.");
  await expect(page.locator("[data-block-id]")).toHaveCount(1);
  await page.reload();
  await expect(page.locator("[data-slate-editable]").first()).toHaveText(
    "A considered note, saved in the real workspace.",
  );
  await page.locator("[data-slate-editable]").first().focus();
  await page.keyboard.press("Meta+a");
  await page.keyboard.press("Meta+b");
  await expect(page.locator("[data-slate-editable] strong")).toHaveText(
    "A considered note, saved in the real workspace.",
  );
  await expect(page.getByText(/Saved/).first()).toBeVisible();
  await page.screenshot({
    path: ".artifacts/browser/editor-light-saved.png",
    fullPage: true,
  });
  await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
  await page.waitForTimeout(250);
  await page.screenshot({
    path: ".artifacts/browser/editor-dark-saved.png",
    fullPage: true,
  });
  console.log(JSON.stringify({ errors, url: page.url() }));
} finally {
  await browser.close();
}
