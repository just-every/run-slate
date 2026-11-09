# Commands and experimental method

Use Node 22.20.0, pnpm 10.12.4 and Chromium with --no-sandbox. The selected revisions have identical package.json and pnpm-lock.yaml blobs. Each valid run consumes a completed rer build and its build-source receipt. The cloud toolchain was sourced in each command shell; setup/build and browser commands ran through cloud_run.

Setup/build used `npx -y @runeditrun/rer setup --owner-email fleet@runeditrun.com --non-interactive` and `npx -y @runeditrun/rer build`. Old revisions used detached worktrees in the same declared repository, the identical installed dependencies and their own build outputs. The first unpaced diagnostic reused main's byte-identical application output; the serial unpaced comparison used its own rebuilt original-main artifact.

The exact selected registration command was:

```sh
SLATE_CHROMIUM_PATH=/usr/bin/chromium node --test --test-concurrency=1 --test-name-pattern='^page outline follows headings and navigates long pages at 1440px$' tests/qualification/ui-convergence/journeys.test.mjs
```

Run it on d2e67e449b239aacace820a458866cf81043ca96, its parent and 95a0372f (full identities are in revision-receipt.json). First overlapping runs and later serial repeats are separately labeled in experiment-receipt.json. No registration assertion is skipped. A whole-registration timeout is preserved as cancellation rather than reported as a pass. The already-timed-out overlapping fixtures needed explicit browser/process cleanup; later serial fixtures were allowed to complete cleanup themselves.

To disable probe pacing diagnostically, change only the JourneyRequestBudget constructor default in tests/qualification/ui-convergence/journey-request-budget.mjs from refillEveryMs = 200 to refillEveryMs = 0.001. Serialization, actor addresses and the product limiter remain unchanged. This experimental change is absent from the product branch.

For the controlled regression, copy status-load-probe.mjs and status-observe.mjs into tests/qualification/ui-convergence, then run:

```sh
SLATE_CHROMIUM_PATH=/usr/bin/chromium node --import ./tests/qualification/ui-convergence/status-observe.mjs --test tests/qualification/ui-convergence/status-load-probe.mjs
```

The published observer has only its Playwright import locator made portable; the executed observer imported the same installed module through its checkout path. The probe uses route.fetch with maxRetries:0 to obtain the real native retirement response, logs HTTP 200 after the Worker commits, then holds that response for six seconds before fulfilling it unchanged. No successful application result is fabricated. Both controlled runs used the 0.001ms helper refill variant. Before uses the original status journey; after uses the candidate journey source patch. Its after run was a dirty diagnostic worktree at original main, not the later exact candidate SHA. The separate candidate-full run and successful hosted Verify both use exact commit 2bf63ae0f4a2da36656f9c0d00d384ce69ff78b0.

No delay, observer, route interception, helper pacing change or diagnostic registration is committed. The product diff is product-change.patch. Network-status receipts summarize available fixture diagnostics only; they do not claim complete traffic coverage. No m1 run or new m1 429 measurement is claimed.
