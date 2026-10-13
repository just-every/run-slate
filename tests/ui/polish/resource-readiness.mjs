const readinessTimeoutMs = 15_000;

// RequestState removes this marker only after its resource succeeds or fails.
// Failures render the application's real alert and remain visible to the capture.
export async function waitForRenderedResourceReadiness(page) {
  const settled = await page.waitForFunction(
    () => document.querySelector('.request-loading') === null,
    null,
    { polling: 'raf', timeout: readinessTimeoutMs },
  );
  await settled.dispose();
}
