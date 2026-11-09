# sd-slate-c-f174-fix3 — DB-002 hosted core failure diagnosis

DIAGNOSIS: not reproduced

BLOCKED for fleet/fv triage. No product, contract or test code was changed, no new product commit or product push was made, and no PR was created. The supplied relation candidate remains at `77ea3b5cf3cce512772192e5fe64039980867f47` on the local named branch `cloud/sd-slate-c-f174-fix3`. No READY, acceptance or landing claim is made. Evidence publication is a separate report-only transport.

## Plan and execution

1. Installed fleet identity, refreshed the launcher, installed decrypted-bundle Git authentication and preserved repository hooks. No alternate credential or forbidden GitHub helper was used.
2. Made a fresh full-history clone of just-every/run-slate. Verified and printed the supplied branch head `77ea3b5cf3cce512772192e5fe64039980867f47` and created `cloud/sd-slate-c-f174-fix3` from it. Fresh fetched main was `92d1c9d733801e953801fd8e17ab23efea778df8`; merging it reported Already up to date because it was already an ancestor of the candidate. Main's newer tests, DEC-006 split and existing timeouts were retained. No merge commit was needed.
3. Retrieved hosted log archives and exact job/attempt metadata with four GitHub CLI/API invocations out of the ten-call budget. No blocked job-log blob download was retried.
4. Used pinned Node 22.20.0 and pnpm 10.12.4. Invoked setup with `--owner-email fleet@runeditrun.com --non-interactive` through cloud_run; setup's exit was not separately captured, so no standalone setup-success claim is made. Built the candidate and current main successfully (exit 0), recording each emitted build's exact commit and source/output hashes. Ran the exact page-outline registration twice on each head, sequentially, against its emitted Worker and fresh D1/browser workspace.
5. Preserved actual logs, per-run receipts, source blob comparisons and counts. Neither a timeout nor an assertion was raised, weakened, skipped in source or wrapped in retries. These are the four requested comparison attempts, not an added retry policy.
6. Applied the brief's no-code-change rule because the target symptom was not established as candidate-caused. Mechanical regeneration, source-lock edits, typecheck and extra touched-code suites are conditional on a code change and were not run. No generated view was edited or committed.
7. Publish the explicitly selected non-secret packet to evidence/sd-slate-c-f174-fix3, then remove the completed product clone and its node_modules as requested. No finished unpublished product work exists to rescue. Terminal output confirms transfer and cleanup separately.

The original detailed plan is retained in PLAN.md.

## Hosted evidence

Run: https://github.com/just-every/run-slate/actions/runs/42628420307

The supplied job `129214505536` is the exact candidate SHA and failed. GitHub metadata identifies it as attempt **2**, although the brief calls it attempt 1. Its historical attempt archive confirms the stated symptom: the page-outline 1440px test failed after **111.191 s**, at `status-vocabulary-journey.mjs:44`, called from line 77 while retiring the renamed status. The Edit status dialog count was 1 instead of 0 after the existing 5000ms assertion. The outline assertions had already completed; the failure is in settingsJourney's statusVocabularyJourney.

The failure context records no rejected requests and no browser console errors. Its final retirement POST /api/status returned 200 in 16ms and the following status GET returned 200 in 12ms. The mounted dialog symptom therefore does not establish a slow/rejected server write or an unclosed relation dialog. See hosted-target-failure.log, hosted-target-timeline.json and hosted-receipt.json.

The allowed `gh run view ... --job 129214505536 --log-failed` command returned latest-attempt logs rather than the historical attempt. One further archive REST read supplied the actual historical failure. The latest attempt is also red: attempt 3, core job **129229865669**, on the same SHA. In that log the page-outline test **passed in 345.132 s**; the separate 390px real-core-wiki journey failed because the owner's rolling-minute request peak was **531**, above the unchanged **500** margin. Both failures are reported for fv; no green workflow is claimed. Job metadata and selected observations are retained in the packet.

## Local comparison

Common command (each run uses cloud_run, existing test registration/sharder and no source edits):

```sh
export PATH="$HOME/.rer/toolchain/node-22.20.0/node_modules/node/bin:$PATH"
. /tmp/rer-cloud-toolchain.sh
cloud_run timeout 660 env SLATE_CHROMIUM_PATH=/usr/bin/chromium SLATE_UI_SHARD=1/1 \
  node --test --test-concurrency=1 \
  --test-name-pattern='^page outline follows headings and navigates long pages at 1440px$' \
  tests/qualification/ui-convergence/journeys.test.mjs
```

The test retains its 600000ms deadline. The outer 660-second bound includes schema setup. System Chromium is 154.0.8037.57; the browser harness supplies --no-sandbox. The selected width is 1440px. There is no UI change requiring new 390px proof.

| Run | Test seconds | Wall seconds | Exit | Actual result |
| --- | ---: | ---: | ---: | --- |
| candidate-1 | 600.003 | 662.928 | 124 | Unchanged 600000ms whole-test deadline; outer bound exit 124 |
| candidate-2 | 160.429 | 222.764 | 1 | Shortcut formatting persistence predicate (line 62), 5000ms, before vocabulary journey |
| main-1 | 600.017 | 662.132 | 124 | Unchanged 600000ms whole-test deadline; outer bound exit 124 |
| main-2 | 199.898 | 298.503 | 1 | Shortcut destination React hydration predicate (line 39), 5000ms, before vocabulary journey |

Completed vocabulary-profile evidence (each includes the unchanged retirement/dialog-closure assertions):

- candidate-1: verification-only, open-vocabulary.
- candidate-2: no complete vocabulary profile logged.
- main-1: verification-only, open-vocabulary.
- main-2: no complete vocabulary profile logged.

These local runs must not be reported as green unless their receipt says exit 0. A different failed assertion or whole-test deadline is not a reproduction of the hosted Edit status symptom. The isolated selection also does not recreate the hosted concurrent Workers suite or prove that host contention cannot contribute. The evidence supports the diagnosis above and does not establish a candidate-caused defect.

## Source comparison

The test registration, sharder, outline journey, status-vocabulary journey, browser/D1 isolation harness, StatusSettings and ActionDialog are byte-identical Git blobs on candidate and main; shared-source-blobs.json records both object IDs. The relation journey runs under recordDetailJourney in a different top-level workspace. The harness starts a fresh D1 state and browser per workspace and closes owned contexts/runtimes in finally. Source review found no cross-workspace status-dialog state. SOURCE-ANALYSIS.md retains the detailed source reasoning and its limits.

## Counts, clauses, mechanics and custody

Full target before → after: **59 DONE / 238 PARTIAL / 41 MISSING / 338 total → unchanged**. Core remains 59/238/35 of 332; Agent surface remains 0/0/6 of 6. **DB-002 remains PARTIAL**; no clause status changed, no gate is owed and no full requirement proof is claimed. The candidate's historical DB-002 supporting-evidence wording is unchanged by this task. No generated views, source lock or other tracked files changed.

MECHANICAL lock=not-run exit=N/A; views=not-run exit=N/A (no changes; brief condition not met).

Product branch: `cloud/sd-slate-c-f174-fix3` (local only for this task). Terminal product HEAD: `77ea3b5cf3cce512772192e5fe64039980867f47`. New product commits: 0. Product pushes: 0. PR: none. Existing Verify: 42628420307, failed core jobs 129214505536 (attempt 2) and 129229865669 (attempt 3). No new exact-SHA Verify was triggered. The final working tree is clean.

The blocker is unresolved hosted failure causation with non-green local comparison runs; the brief explicitly requires returning the evidence to fv without editing code when the target cannot be established as candidate-caused. Review the target dialog flake, the other local failure modes and the separate latest hosted request-margin failure. Do not infer READY or landing from the evidence ref.
