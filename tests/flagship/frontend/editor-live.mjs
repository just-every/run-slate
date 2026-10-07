import { chromium } from "@playwright/test";
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
  await page.getByRole("button", { name: "Create a page" }).click();
  await page
    .getByLabel("Page title", { exact: true })
    .fill("Interface review notes");
  await page.getByLabel("Keep it in", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Create page", exact: true }).click();
  await page.waitForURL("**/app/pages/**");
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
