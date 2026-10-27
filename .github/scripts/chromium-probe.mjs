import { chromium } from '@playwright/test';

// Use the checkout's bundled headless shell and default Playwright arguments.
// A real page catches missing shared libraries before any apt work is attempted.
const browser = await chromium.launch({
  headless: true,
  timeout: 15_000,
  args: ['--use-mock-keychain', '--password-store=basic'],
});
try {
  const page = await browser.newPage();
  await page.goto('data:text/html,<title>Chromium probe</title>');
  if (await page.title() !== 'Chromium probe') throw new Error('Chromium page probe failed.');
  console.log(`Bundled Chromium ${browser.version()} launched successfully.`);
} finally {
  await browser.close();
}
