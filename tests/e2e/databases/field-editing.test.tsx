import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from '@playwright/test';

// DB-002: exercise actual React updates, so replacing the focused input fails.
// Run against the test-only UI server (pnpm exec vite --config tests/ui/vite.config.ts).
test('database field typing retains focus across parent updates', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(`${process.env.UI_TEST_URL ?? 'http://127.0.0.1:4198'}/?story=field-editing`);
    for (const [label, text] of [['Text value', 'Knowledge'], ['Number value', '12.34'], ['URL value', 'https://example.com']]) {
      const input = page.getByRole('textbox', { name: label }).or(page.getByRole('spinbutton', { name: label }));
      await input.click();
      await page.keyboard.type(text, { delay: 20 });
      assert.equal(await input.inputValue(), text);
      assert.equal(await input.evaluate(node => node === document.activeElement), true);
    }
    const stored = JSON.parse(await page.getByTestId('field-values').innerText());
    assert.equal(stored.text.text, 'Knowledge');
    assert.equal(stored.number.number, 12.34);
    assert.equal(stored.url.href, 'https://example.com');
  } finally {
    await browser.close();
  }
});
