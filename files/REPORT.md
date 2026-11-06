# sd-slate190-ci-triage-1 — NOT REPRODUCED

Completed 2026-11-06T12:01:33.392756+00:00. This is the requested read-only technical diagnosis. All three exact failed registrations passed once on the failed candidate and once on fresh main, on the same runner with identical ordinary selection/configuration. Six selected test-body executions; six exit-0 receipts; no rerun.

No candidate-only ordinary failure or same-main failure was reproduced. No infrastructure root cause was established. The evidence does not support attributing the original CI timeouts to the Word-layout delta. It does not establish that original CI was healthy or that the failures were harmless. Both passing grants no CI retry, acceptance, publication, readiness or landing authority.

## Provenance and original CI

- Repository: just-every/run-slate.
- Failed candidate: ca90559bbd29bca4e0d86329d384e81a68289481, original ref cloud/sd-slate-c-f190-rebase-ca90559bbd29bca4e0d86329d384e81a68289481.
- Original implementation source: 03e7b8a3f2ebace8330a11b03ce868026efdecda. Source-to-candidate changes only generated ACCEPTANCE.md and sources.lock.json; runtime/test source is identical.
- Fresh main at initial fetch and immediately before the control: bc567c9b6f6b25c98cb6fa05b9ab0fe37628a547. Control refetch: 2026-11-06T11:48:31.477652+00:00; no drift from the supplied original main or first task fetch.
- Diagnostic branch cloud/sd-slate190-ci-triage-1 remains at bc567c9b6f6b25c98cb6fa05b9ab0fe37628a547. No product commit/push. No PR.
- Original Verify Slate 42208156074 attempt 1: completed FAILURE, as supplied, unchanged by this diagnosis. Jobs 127860941581 (ui-state: automation 30000ms, CHAT-001 60000ms test timeouts) and 127860941678 (core: 390px BLOCK-001 networkidle 30000ms timeout).
- Original lander ended 2026-11-06T11:31:40Z. Supplied full-history publication scan COMPLETE NEW0 passed; not repeated.
- Diagnostic GitHub REST/gh calls: 0 of ten. Mandatory launcher refresh invoked its own gh auth status once; its internal HTTP count was not observed. No log refetch, CI polling/rerun/dispatch, duplicate observer, submit/readmit or deploy/provider/tag/release action.

## Actual per-case results

| Registration | Candidate body / command wall | Main body / command wall | Exits |
| --- | ---: | ---: | --- |
| automation admission, resumed effects and schedules preserve current scope and exactly-once recovery | 13.754s / 30.211s | 14.345s / 33.072s | 0 / 0 |
| CHAT-001 — Owners connect several chat destinations, each with its own event selection, and every destination sends one link-only message, fails and disconnects on its own | 15.677s / 33.328s | 15.689s / 34.356s | 0 / 0 |
| real core-wiki and touch-member journeys at 390px | 558.384s / 576.688s | 564.450s / 585.614s | 0 / 0 |

Native Vitest/TAP reports supply body timings; command wall includes configuration, transforms/imports, migration setup and shutdown. A command wall over 30 seconds is not an automation test-body timeout. The actual stdout/stderr is retained for every command in its corresponding label.log file.

- Automation: both heads print the same four AUTO-003 probes: bounded native D1 history reads; all ten states with current-readable actor/trigger/records/time and duplicate-safe effects; durable retry/failure/disable visibility; production rate-boundary behavior. The entire folded registration ran, including AUTO-002 scope and AUTO-001 schedules.
- CHAT-001: both print all four PASS checkpoints: Teams/Nook admission plus batching/thread/digest; withdrawal/erasure; populated migration/legacy/archive checks; destination selection/access/retry/authorization/custody/disconnect. Each command reports one selected test passed and two other registrations filtered out. No source skip or assertion change.
- 390px: both full registrations report one test, one pass, zero fail/cancelled/skipped. They retain setup, transfer recovery, writing, touch creation/drag, columns, comments/sharing/publication, details, search/Inbox/tasks/reviews, status/chat, automation history, record details, templates, retention, template authority, version deletion and final phone smoke.
- The candidate additionally executes its newly added Word download helper inside the full columns step; main retains its original columns assertions. The 390px helper does not run the independent 1440px Word renderer.
- Existing browser evidence checkpoint metadata is in candidate-ui-checkpoints.json and main-ui-checkpoints.json: state names, geometry, source provenance and serious/critical counts. Raw requests, sessions, settings, SQL state, archives and screenshots are excluded.

## Smallest supported causal finding

The original mobile stack is browser-evidence.mjs:10 → write-journey.mjs:68 → journeys.test.mjs:96: the existing accessible(page, 'create page') networkidle checkpoint. The execution had not yet reached columnsJourney or its newly appended wordColumnsJourney.

The production delta replaces Word export's flat block traversal with fixed borderless side-by-side tables. exportReadable invokes renderDocx only for docx format. Automation does not request Word; CHAT-001's workspace archive uses a separate export path. The affected module can still be in the server import graph, so this trace does not rule out indirect initialization/resource effects.

The candidate crossed the original phone checkpoint and completed the full registration; main did likewise. There is no observed candidate-only defect to send as a FIX, and no established same-main/infrastructure cause to label NOTE G. The supported result is NOT REPRODUCED.

SOURCE-TRACE.md gives the source/configuration/CI mapping. source-identities.json has exact file hashes; candidate-delta.patch and candidate-delta-stat.txt retain the inspected delta.

## Same runner and comparison limits

Both heads used VM f67aa91a26d8, Debian 13.6 x86_64, kernel 6.18.57, runtime Node 22.20.0, pnpm 10.12.4, Playwright 1.63.0, Vitest 4.1.11, Wrangler 4.129.1 and rer 0.2.80. Browser: /usr/bin/chromium, Chromium 154.0.8037.57, with the existing --no-sandbox argument and real HOME. main-runner-identity.json confirms identity matches runner-identity.json.

Original CI is Ubuntu 24.04 with Playwright-installed Chromium; the supplied excerpts do not establish its actual browser/kernel/hardware. This VM does not duplicate that image. The provided toolchain selected newer shell Node 24.19.0 for dependency installation; setup, build and every selected test explicitly used Node 22.20.0. Both heads installed frozen dependencies into separate fresh dependency trees and recreated ordinary setup/build/state. Source/configuration/assertions/deadlines were unchanged.

The original shard ran many more cases and concurrently ran its public-journey and Workers lanes; the requested commands ran sequentially. That workload difference does not establish a cause. No stress, repeats, timeout extension, assertion/wait weakening, DNS workaround, fake app or fallback was used. Existing provider-edge fixtures and disposable synthetic identities were retained.

## Completed plan and exact commands/receipts

PLAN.md records the full plan: fleet setup; exact heads/runner; ordinary CI entry-point trace; exactly three cases once per head; supported-cause assessment; report custody and cleanup. OPERATIONS.md records operative setup/ref commands and common shell/environment prefix. commands.jsonl is the machine-readable actual receipt.

Workers use root vitest.config.ts, not a substituted narrower config. The phone command retains SLATE_UI_SHARD=1/8 and SLATE_UI_ASSIGNMENTS=.github/scripts/journey-shards.json from core's CI mapping. SLATE_CHROMIUM_PATH=/usr/bin/chromium is the existing override. Selected tests run under cloud_run's subreaper. Setup/build invoke that same implementation directly.

- candidate-setup: exit 0, 49.290s, 2026-11-06T11:35:21.251960+00:00 → 2026-11-06T11:36:10.542061+00:00; head ca90559bbd29bca4e0d86329d384e81a68289481; command: python3 /tmp/rer-reap.py npx -y @runeditrun/rer setup --owner-email fleet@runeditrun.com --non-interactive.
- candidate-build: exit 0, 27.164s, 2026-11-06T11:36:10.572605+00:00 → 2026-11-06T11:36:37.736828+00:00; head ca90559bbd29bca4e0d86329d384e81a68289481; command: python3 /tmp/rer-reap.py npx -y @runeditrun/rer build.
- candidate-automation: exit 0, 30.211s, 2026-11-06T11:37:33.188528+00:00 → 2026-11-06T11:38:03.399161+00:00; head ca90559bbd29bca4e0d86329d384e81a68289481; command: pnpm exec vitest run tests/flagship/structured/automation-repairs.test.ts --testNamePattern '^automation admission, resumed effects and schedules preserve current scope and exactly-once recovery$' --reporter=default.
- candidate-chat: exit 0, 33.328s, 2026-11-06T11:38:03.461213+00:00 → 2026-11-06T11:38:36.788741+00:00; head ca90559bbd29bca4e0d86329d384e81a68289481; command: pnpm exec vitest run tests/e2e/notifications/destinations.test.ts --testNamePattern '^CHAT-001 — Owners connect several chat destinations, each with its own event selection, and every destination sends one link-only message, fails and disconnects on its own$' --reporter=default.
- candidate-mobile: exit 0, 576.688s, 2026-11-06T11:38:36.840392+00:00 → 2026-11-06T11:48:13.528578+00:00; head ca90559bbd29bca4e0d86329d384e81a68289481; command: node --test --test-concurrency=1 '--test-name-pattern=^real core-wiki and touch-member journeys at 390px$' tests/qualification/ui-convergence/journeys.test.mjs.
- main-install: exit 0, 8.979s, 2026-11-06T11:48:31.541559+00:00 → 2026-11-06T11:48:40.520626+00:00; head bc567c9b6f6b25c98cb6fa05b9ab0fe37628a547; command: pnpm install --frozen-lockfile.
- main-setup: exit 0, 50.476s, 2026-11-06T11:48:40.554306+00:00 → 2026-11-06T11:49:31.030136+00:00; head bc567c9b6f6b25c98cb6fa05b9ab0fe37628a547; command: python3 /tmp/rer-reap.py npx -y @runeditrun/rer setup --owner-email fleet@runeditrun.com --non-interactive.
- main-build: exit 0, 27.832s, 2026-11-06T11:49:31.061899+00:00 → 2026-11-06T11:49:58.893750+00:00; head bc567c9b6f6b25c98cb6fa05b9ab0fe37628a547; command: python3 /tmp/rer-reap.py npx -y @runeditrun/rer build.
- main-automation: exit 0, 33.072s, 2026-11-06T11:49:58.945059+00:00 → 2026-11-06T11:50:32.016777+00:00; head bc567c9b6f6b25c98cb6fa05b9ab0fe37628a547; command: pnpm exec vitest run tests/flagship/structured/automation-repairs.test.ts --testNamePattern '^automation admission, resumed effects and schedules preserve current scope and exactly-once recovery$' --reporter=default.
- main-chat: exit 0, 34.356s, 2026-11-06T11:50:32.072824+00:00 → 2026-11-06T11:51:06.428426+00:00; head bc567c9b6f6b25c98cb6fa05b9ab0fe37628a547; command: pnpm exec vitest run tests/e2e/notifications/destinations.test.ts --testNamePattern '^CHAT-001 — Owners connect several chat destinations, each with its own event selection, and every destination sends one link-only message, fails and disconnects on its own$' --reporter=default.
- main-mobile: exit 0, 585.614s, 2026-11-06T11:51:06.490672+00:00 → 2026-11-06T12:00:52.104753+00:00; head bc567c9b6f6b25c98cb6fa05b9ab0fe37628a547; command: node --test --test-concurrency=1 '--test-name-pattern=^real core-wiki and touch-member journeys at 390px$' tests/qualification/ui-convergence/journeys.test.mjs.

Candidate frozen install additionally completed exit 0 (pnpm-reported 8.9s); its output is candidate-install.log and exact command is in OPERATIONS.md. Both setup/build logs and build-source.json files are retained. No test was added to build/deploy; ordinary setup's build and explicit rer build prepared the emitted Worker.

## Counts, statuses and full PARTIAL remainder

No clause, Status, Evidence, Gap, lifecycle/hold, budget, cap, credit, source lock or generated view changes. BLOCK-012 remains PARTIAL. Full-target before/after: 57 done / 240 partial / 41 missing = 338. Core: 57 / 240 / 35 = 332. Agent surface: 0 / 0 / 6. Existing declared inventory stays 205 registrations and default cap 200 (test-budget.json's declaration, not a fresh acceptance recount); zero registrations added/removed/changed.

The complete candidate BLOCK-012 remainder is unchanged:

> One level only: nested columns are refused. PDF still flows columns in reading order. Word layout is qualified only for supported one-level 2–5-column paragraph and heading sections; other column content and export cases and complete PORT-007 coverage remain unproven.

counts-and-partial-remainder.json retains the full main/candidate BLOCK-012 rows. All other partial judgments and unrelated legacy prose remain intact.

Original final runtimeCI/scan/main/site guards remain: the failed exact-SHA Verify did not become green from these local results; the supplied COMPLETE NEW0 scan is neither repeated nor waived; main is not advanced; exact-main Verify and existing main-only Run site/publication/landing guards remain in force. Independent affected Word-layout PASS on source 03e7b8a3f2ebace8330a11b03ce868026efdecda remains its supplied separate receipt; this diagnosis does not replace it with 390px rendering proof. Later-seed Opus UI/auth/data reviews remain held.

## Cleanup and evidence custody

candidate-cleanup.json records removal of candidate artifacts, caches, private local settings, installer/CLI state, native databases, Vitest state, build and node_modules before main. Both test phases completed under the subreaper and existing browser/runtime finally blocks. No manual signal or unrelated PID/process stop was used.

cleanup.json records final runtime/process and generated-state/dependency cleanup. The product tree stayed clean. The disposable clone is removed after transport verification; terminal confirmation records that last deletion. No private settings, live session, environment dump, raw network capture, held-out gate material or symlink is selected for publication.

Reports/receipts go only through evidence/sd-slate190-ci-triage-1. That ref supplies evidence custody only; it is not product READY, acceptance, landing or green CI. No product push was necessary or authorized by this diagnosis.

## Disposition

Done: NOT REPRODUCED, candidate 3/3 and fresh main 3/3, once each. No missing diagnostic prerequisite or blocker remains. Next: SD records the narrow result and retains original final guards; FV records the comparison without automatic FIX/NOTE G or retry. Default: keep original holds and acceptance judgments; grant no CI retry/landing authority.
