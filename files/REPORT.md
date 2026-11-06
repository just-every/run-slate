# Slate185 exact failed-case diagnosis — NOT REPRODUCED

Tag: `sd-slate185-ci-triage-1`. Role: read-only technical triage. Repository: `just-every/run-slate`. Completed 2026-11-06 UTC.

## Result and disposition

The exact named 1440px case passed once on candidate `4cf7176513f43ee62ca2908318ccc9ab42fb76f1`, then passed once on freshly fetched main `bc567c9b6f6b25c98cb6fa05b9ab0fe37628a547`, on the same dedicated Linux runner. **NOT REPRODUCED.** No minimal causal finding is established for the saved dialog-visible failure. This is not an infrastructure verdict, retry authorization, FIX request, Opus UI/data acceptance, product acceptance, or a green exact-SHA CI claim.

The recorded main equals the brief's observed integration main; drift is zero. The two builds have the same emitted output SHA-256: `feb4efc58e7aaaaec984d76a735cce98720e17be24b7c263284d97ceb0f1a2b3`. Source/lock identities differ and are retained separately in `identity.json`, both build-source receipts and `results.json`.

## Original observation, used without fetching CI

The supplied failure was Verify `42200640905`, attempt 1, job `127835802909`, `ui-focus-desktop`, on final regenerated candidate `4cf7176513f43ee62ca2908318ccc9ab42fb76f1` at ref `cloud/sd-slate-c-f185-rebase-4cf7176513f43ee62ca2908318ccc9ab42fb76f1`. The supplied step was `REV-006 — numbered deletion leaves an attributed tombstone`: `expect(locator).toBeHidden()` timed out after 5000ms while dialog `Publish this revision` remained visible. That observation identifies a publication-preparation failure inside the deletion journey; it does not identify which of its three publication calls, a server error, product regression, or infrastructure cause. The saved failure did not include the response/alert needed to choose among those possibilities. No CI run, log archive, job log, or artifact was fetched; zero gh/API observer calls were made and no CI operation was dispatched or retried. The builder source head and the Slate184 runs were not used to qualify this candidate. The already-passed COMPLETE history NEW0 scan was not repeated.

## Plan and execution

The complete plan is in `PLAN.md`. Execution followed it: fleet launcher refresh and credential-helper setup; cloud networking/rules review; one disposable owned clone of the sole declared repository; exact candidate and fresh main fetch; focused workflow/test/source tracing; frozen dependency installation; repository setup and build; exactly one filtered run on each recorded head; non-secret receipts; runtime cleanup; report-only evidence publication. No helper agents were used.

The clone began on local `cloud/sd-slate185-ci-triage-1` from `origin/main`, was detached at the exact failed candidate for the first run, and returned to that local branch at fresh main for the second run. This local task branch was never pushed. No product commit, PR, merge/rebase, source/test/tool edit inside the repository, contract regeneration, source lock update, status/evidence/gap amendment, admission, submission, deployment, provider change, network workaround, release or tag operation occurred. Frozen dependency and setup commands made only ordinary local preparation changes. Both before/after tracked-source status receipts are empty.

## Entry, shard and unchanged command

Candidate `.github/workflows/verify.yml` assigns `ui-focus-desktop` serial mode, UI shard `5/8`, worker shard 0, and the ordinary journey assignments file. `.github/scripts/run-shard.sh` runs `public_journeys` from `tests/qualification/ui-convergence/journeys.test.mjs` before the separate focus suite. `.github/scripts/journey-shards.json:30` explicitly maps the named review case to shard 5. The failure belongs to that public journey, not the distinct genuine-insertion focus command.

The exact entry is `tests/qualification/ui-convergence/journeys.test.mjs:188` on candidate, title `named review request, reviewer queue, exact verify and overdue escalation at 1440px`. The test uses a 1440×1000 viewport and its existing 240000ms registration timeout. It runs setup, review request, synced content and people steps before the existing REV-006 step. Those steps were retained; no helper was isolated in place of the actual case. The following identical command selected only that case on both heads:

```sh
. /tmp/rer-cloud-toolchain.sh
export PATH="$HOME/.rer/toolchain/node-22.20.0/node_modules/node/bin:$PATH"
cloud_run env SLATE_UI_SHARD=5/8 SLATE_UI_ASSIGNMENTS=.github/scripts/journey-shards.json SLATE_CHROMIUM_PATH=/usr/bin/chromium node --test --test-concurrency=1 --test-name-pattern='^named review request, reviewer queue, exact verify and overdue escalation at 1440px$' tests/qualification/ui-convergence/journeys.test.mjs
```

Preparation commands were `pnpm install --frozen-lockfile`, then on each head `cloud_run npx -y @runeditrun/rer setup --owner-email fleet@runeditrun.com --non-interactive` and `cloud_run npx -y @runeditrun/rer build`. Install, both setups and both builds exited 0. Setup was rerun idempotently on main; each test uses its own ordinary isolated identity/database fixture and emitted Worker, not the setup database. The existing harness's development identity fixtures and assertions were preserved; no fake application responses or new fixtures were introduced.

The toolchain bootstrap initially exposed VM Node 24 because its minimum-version rule does not replace a newer Node. Before either setup/build/test, the repository's exact Node 22.20.0 was installed from the npm registry and explicitly prepended. Recorded live process executable paths prove both test trees ran that same Node binary. pnpm was 10.12.4, repository `@runeditrun/rer` 0.2.80, Playwright 1.63.0, and system `/usr/bin/chromium` 154.0.8037.57, using the harness's existing `--no-sandbox` arguments. `identity.json` records browser executable hash, Playwright's browser manifest, OS and runner identity. There was one runner and no routing change between runs.

## Actual outputs

| Head | Test exit | Executed / passed / failed / skipped | Case duration | Command duration |
| --- | --- | --- | --- | --- |
| Candidate `4cf7176513f43ee62ca2908318ccc9ab42fb76f1` | 0 | 1 / 1 / 0 / 0 | 112600.906811ms | 130860.891361ms |
| Fresh main `bc567c9b6f6b25c98cb6fa05b9ab0fe37628a547` | 0 | 1 / 1 / 0 / 0 | 108624.193432ms | 127114.826794ms |

Candidate ran 11:06:46Z–11:08:57Z; main ran 11:11:00Z–11:13:07Z on 2026-11-06. The full non-secret TAP outputs are `candidate-runtime.log` and `main-runtime.log`, with actual exits/timestamps alongside them. Both contain:

```text
# PROBE REV-006 1: edit-only, current, published and autosnapshot DELETE requests -> refused without revision or activity changes
# PROBE REV-006 2: full-member History confirmation -> version 2 content removed, attributed timed tombstone after reload; every other revision retained; replay has one activity
# tests 1
# pass 1
# fail 0
# skipped 0
```

Both runtime receipts record all three publication previews and all three publish requests returning HTTP 200. Their attributed tombstone/replay measurements are retained in the respective measurements receipts. The original dialog-hidden assertion and every downstream deletion/access/retention/replay assertion passed on both heads. The runtime network summaries retain method/path/status/error codes, without session bodies, secrets, headers or query strings. These summaries describe only requests recorded by the ordinary harness; the second person's deletion and refusal assertions are also proven by the unchanged test and terminal probes, not by claiming the owner's network recorder sees every request.

Each ordinary owner-console recorder captured one `net::ERR_CONNECTION_REFUSED` entry on an earlier page URL; the summary receipts retain the diagnostic. Neither run failed and neither publication request was refused. This incidental entry is not a supported explanation of the saved publication-dialog failure; no additional experiment or unrelated diagnosis was performed. Both recorded zero model requests.

## Focused source/config trace and causal limit

`source-trace.txt` retains candidate file/line excerpts. `identity.json` hashes the focused source/config files at both SHAs; `candidate-main-path-diff.txt` lists the complete seven-path tree difference. The selected registration body, version-deletion helper, workflow, shard runner/assignment, browser harness, packages/lockfile and publication implementation are the same between candidate and main. The journey file differs elsewhere; this case's body and timeout do not. No application source path differs, consistent with the identical built-output digest.

`tests/qualification/ui-convergence/version-deletion-journey.mjs:37–48` opens the publication dialog, labels it, requests review, waits for `Reviewed publication`, clicks the publish button, then expects the dialog hidden. It calls that helper for first, intermediate and latest publications. After all three it creates a distinct working revision, refuses unsafe deletions, performs the real full-member confirmation, and checks numbered tombstone, attribution/time, retained snapshots and duplicate-safe replay. The saved failure was at the publication-helper dialog-hidden assertion, before the actual tombstone checks.

`src/core/features/pages/ui/workspace/WorkspacePublicationDialog.tsx:25–35` sends `/publish-preview`, retains reviewed input/fingerprint, then sends `/publish` and awaits `onSaved`. `src/core/app/ui/ActionDialog.tsx:51–64` closes only after successful completion (unless the handler returns false) and retains the dialog with an error on an exception. `src/core/features/lifecycle/publication-preview.ts:12–22` checks current revision and access epoch; `src/core/features/lifecycle/publication.ts:34–44` checks the current revision and review fingerprint again. These code paths explain why the visible dialog alone cannot distinguish a failed/pending submission from a client event issue. Neither path was observed failing here. No claim about a particular conflict, race, load issue, flaky selector, DNS or runner fault is supported by these two passing observations.

## Counts, judgments, holds and next action

Before and after this diagnosis: 57 done / 240 partial status-table rows on both compared heads; 0 clause status changes; REV-006 remains partial with its existing Evidence/Gap and all fresh-main judgments intact. Added/removed test registrations: 0/0. Executed cases: exactly 1 candidate + 1 main, each passed; no rerun. Product commits/pushes/PRs: 0/0/0. New CI runs and API observer calls: 0/0. The local unused task branch ended at `bc567c9b6f6b25c98cb6fa05b9ab0fe37628a547`; the diagnosed failed candidate remains `4cf7176513f43ee62ca2908318ccc9ab42fb76f1`.

Return NOT REPRODUCED to SD and FV. Preserve every existing hold and frozen row; do not auto-promote, auto-FIX, or request a retry from this result. FV/SD retain the original exact-final-candidate runtime CI/publication/main/site guards, all unproved by this local diagnosis. The existing history publication scan's prior result is unchanged. Default next action: retain the current hold and let the original authorized guards decide the candidate; any further diagnosis or rerun needs a new instruction.

## Limitations, custody and cleanup

This is Linux, closest to the failing Linux runner, but Debian 13 with system Chromium rather than GitHub Ubuntu 24.04 with Playwright-managed Chromium. Candidate and main used the same admitted tools and command; these differences limit extrapolation to the saved CI event. Only the exact failed case was exercised, without the rest of its shard/suite. There is no reproduced failure, infrastructure finding, acceptance decision or new exact-SHA CI evidence. No prerequisite remained unrun and no blocker remains for this assigned diagnosis.

The evidence packet contains complete selected non-secret reports, setup/build/TAP outputs, source/config identities, runtime/measurement receipts, counts, commands and cleanup receipts. Raw local settings, session capabilities, raw network bodies and private temporary logs are excluded and deleted with the owned worktree. No INBOX/STATE file was read or written. The final response carries one relay status for each lane. Product custody is unchanged; evidence is published only to `refs/heads/evidence/sd-slate185-ci-triage-1` using the supplied report-only transport. It grants no READY/PUSHED/landing status. Cleanup details and explicit file selection review are in `cleanup.json` and `packet-review.json`; evidence transport metadata is removed after publication.
