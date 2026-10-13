import { signInBrowser } from '../../e2e/outbox-auth.mjs';
import { chromium } from "@playwright/test";
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1536, height: 1024 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await signInBrowser(page, "http://127.0.0.1:4174", process.env.SLATE_BROWSER_EMAIL ?? 'jamie@aurora.example');
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.getByRole("menu", { name: "Create content", exact: true })
    .getByRole("menuitem", { name: "Page", exact: true }).click();
  await page.waitForURL("**/app/pages/**");
  const title = page.getByLabel("Page title", { exact: true });
  await title.fill("Interface review notes");
  await title.press("Tab");
  await page.getByRole("button", { name: "＋ Add block" }).click();
  console.log(await page.locator("body").innerText());
  console.log(JSON.stringify({ url: page.url(), errors }));
  await page.screenshot({
    path: ".artifacts/browser/editor-desktop-initial.png",
    fullPage: true,
  });
} finally {
  await browser.close();
}
