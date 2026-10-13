import { signInBrowser } from '../../e2e/outbox-auth.mjs';
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
const directory =
  ".artifacts/browser";
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1536, height: 1024 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await signInBrowser(page, "http://127.0.0.1:4174", process.env.SLATE_BROWSER_EMAIL ?? 'jamie@aurora.example');
  await page
    .getByRole("heading", { name: "Today", exact: true, level: 1 })
    .waitFor();
  await page
    .getByText("Loading…", { exact: true })
    .first()
    .waitFor({ state: "hidden" });
  await page.screenshot({
    path: `${directory}/today-desktop-initial.png`,
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: `${directory}/today-phone-initial.png`,
    fullPage: true,
  });
  console.log(
    JSON.stringify({
      url: page.url(),
      errors,
      overflow: await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    }),
  );
} finally {
  await browser.close();
}
