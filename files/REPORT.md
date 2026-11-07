# Slate188 contract-job triage

## Finding

**Candidate-caused.** Candidate `8145db417b77951a1445fe0290ed84a32585d172` adds two browser-only test entries to `tests/requirements/test-evidence.json`. The contract verifier validates that registry against Workers JSON results only. Those browser tests execute in a separate Node/Chromium lane and are absent from that observed set, so the exact-evidence check rejects both entries.

The failed check is **`evidence metadata is exact and current`**. Exact messages from Verify 42341571114, attempt 2, job 128318789802:

```text
Stale or unknown test entry: ["tests/qualification/ui-convergence/journeys.test.mjs","readable exports retain discussions through HTML and Markdown re-import at 1440px"]
Stale or unknown test entry: ["tests/qualification/ui-convergence/journeys.test.mjs","real core-wiki and touch-member journeys at 390px"]
```

This is one failed check with two errors. Its `supportingTests` value is 97. The other 16 checks passed. Both emitted-artifact TAP tests passed in that historical job. The Workers suite completed, every contract clause had a tagged test, no unknown tags were present, and no product clause was broken.

## Historical exact-SHA evidence

| Source | Full SHA | Verify run | Result |
| --- | --- | --- | --- |
| Candidate | `8145db417b77951a1445fe0290ed84a32585d172` | [42341571114](https://github.com/just-every/run-slate/actions/runs/42341571114), attempt 2 | completed / failure; contract 16 passed, 1 failed |
| Fresh origin/main | `563a3977363aa2e046699544bead85343781fb75` | [42337967948](https://github.com/just-every/run-slate/actions/runs/42337967948), attempt 1 | completed / success |

Both run status/head pairs were independently confirmed with REST once. No workflow was rerun or dispatched.

`gh run view 42341571114 -R just-every/run-slate --job 128318789802 --log-failed` was invoked once. Its displayed output stopped at line 4237 before `checks`. The same invocation had already cached the complete workflow ZIP in `/tmp/gh-cli-cache/`; reading its `contract/9_Run node scripts_verify.mjs.txt` member recovered all 5019 lines, including the check array and exit 1. This recovery made no additional GitHub call. `historical-contract-step-full.log`, `historical-summary.json`, `historical-checks.json` and `historical-log-receipt.json` preserve the actual evidence and hashes. The raw archive is not published because other jobs' logs are outside the packet's selection.

## Causing diff

`git merge-base origin/main 8145db4…` is fresh main `563a3977363aa2e046699544bead85343781fb75`. The triple-dot diff changes six files: CONTRACT.md, ACCEPTANCE.md, sources.lock.json, transfer-jobs-journey.mjs and the two evidence metadata files. The verifier, structural checks, evidence validator, workflow, shard runner and Vitest configuration have identical blobs at both refs.

- `tests/requirements/test-evidence.json:1063–1080` adds exact registrations for the 1440px and 390px public journeys, both as supporting PORT-001 regressions.
- `tests/requirements/clause-inventory.json:1670–1677` adds the corresponding PORT-001 supporting references. They are related metadata; the emitted errors specifically name the registry entries above.
- These additions first appear in `3dc5ac2306a94aba6a350f991225399039346be2` ("Prove authored page subtree contents in native workspace exports [skip ci]") and survive the merge at `8145db417b77951a1445fe0290ed84a32585d172`.
- `scripts/evidence-registry.mjs:7–9` builds the observed identity set only from `report.testResults` and appends `Stale or unknown test entry: ` for every absent `(file, testName)` registration.
- `scripts/verify.mjs:35–49` obtains Workers results, merging six `contract-N.json` reports in CI or running Vitest in its local path. At lines 182 and 217 it validates the registry and records the failed exact-evidence check.
- `.github/scripts/run-shard.sh:7–14` writes Workers JSON through Vitest, then runs browser journeys separately with `node --test`. `.github/workflows/verify.yml:222–229` passes only those six Workers reports to the contract job. Passing browser journeys in the other lane do not add their names to that JSON.

This is an observation-boundary mismatch, not a cap on registration count, generated-view staleness, a source-lock check, a clause-count mismatch or a newly broken product clause. The 17-check verifier does not invoke a test-budget cap or the contract-view/source-lock generator. No such broader cause is needed to explain the observed failure.

## Counts and clause status

| Quantity | Main | Candidate |
| --- | ---: | ---: |
| Supporting registrations | 95 | 97 |
| Contract done / partial / missing / total | 57 / 240 / 41 / 338 | 57 / 240 / 41 / 338 |
| PORT-001 status | partial | partial |

The historical candidate's product behavior tally is satisfied 22 / planned 316 / overridden 0 / broken 0. Baseline behavior is satisfied 2 / planned 43 / overridden 0 / broken 0. These are behavioral tallies, separate from the CONTRACT.md judgment counts. This triage changes no clauses, statuses, source files, tests, configuration, hold, branch history or gates.

## Local reproduction and limits

Both source revisions were checked out at clean committed HEADs and built successfully using `cloud_run npx -y @runeditrun/rer build`, pinned Node 22.20.0 and pnpm 10.12.4. The CI contract job downloads an app build and six Workers reports; the local reproductions build the app and use verify.mjs's unsharded Workers-suite path. Each source gets exactly one verify.mjs invocation. Main runs in a separate clean worktree on the same VM after the candidate's long-running Workers file delayed the initially sequential plan. Build provenance, actual logs, runner contexts and source-status receipts are retained.

- **candidate:** exact source `8145db417b77951a1445fe0290ed84a32585d172`, Node `v22.20.0`, pnpm `10.12.4`. One invocation was interrupted by the environment restart; its final exit code is unavailable. 59 Workers files completed; no final JSON summary was emitted. 
- **main:** exact source `563a3977363aa2e046699544bead85343781fb75`, Node `v22.20.0`, pnpm `10.12.4`. One invocation was interrupted by the environment restart; its final exit code is unavailable. 0 Workers files completed; no final JSON summary was emitted. 

The candidate's initial local artifact check failed because `provider-fallback-flow.mjs:23` uses `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`, while `landing-browser.mjs` uses `SLATE_CHROMIUM_PATH`. Only the latter had initially been set. The host has `/usr/bin/chromium`, but not Playwright's downloaded headless shell. This local provisioning error differs from the historical CI job, whose two TAP tests passed. Main's one invocation sets both supported overrides to `/usr/bin/chromium`; both helpers already pass `--no-sandbox`. No source or test edit is used to correct the environment. The planned independent candidate browser retry did not run before the environment restarted.

Attempts to download historical Workers artifacts using `gh run download 42341571114 --repo just-every/run-slate --pattern 'contract-*'` and the equivalent command for 42337967948 failed at blob storage. They are not retried. The sanitized diagnostics and exact command arguments are in the two `*-workers-download-receipt.json` files. No HTTP status was retained: conservative signed-URL query stripping also omitted the trailing error. These failures do not limit the recovered original check messages or the exact-SHA CI status receipts.

The environment restarted at the end of these attempts, and both exec sessions became unknown. The local candidate and main full-suite comparison is therefore incomplete; no local green or reproduction count is claimed. The pure registry comparison experiment was not run because no Workers JSON report was emitted. The original CI job supplies the exact 16/1 check summary, while fresh main's exact-SHA CI receipt confirms success. See interruption-receipt.json.

## Plan, custody and next action

The full plan and execution adjustments are in PLAN.md. The plan is to inspect workflow and source, read the original job once, build and invoke the verifier once per ref, compare checks and source differences, publish only the report packet, and delete the owned clone/worktree and dependencies. No product commit, push or PR is created; the assigned local branch `cloud/sd-slate188-contract-triage-1` remains at main `563a3977363aa2e046699544bead85343781fb75`. READY/PUSHED custody is inapplicable to this read-only triage. Evidence transport uses only `refs/heads/evidence/sd-slate188-contract-triage-1`.

**Next:** route a separate metadata-registration fix to the owning lane. Preserve the PORT-001 partial judgment and its supporting browser proof; reconcile browser-only registrations with the Workers-only evidence input. This report applies no fix and changes no hold.
