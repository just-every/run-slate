# Slate188 contract triage plan

Scope: read-only technical diagnosis of just-every/run-slate candidate 8145db417b77951a1445fe0290ed84a32585d172 against fresh origin/main. No product, test, config, contract-status or hold edits; no new product commits, CI dispatch/rerun, PR or product push. Evidence publication uses only evidence/sd-slate188-contract-triage-1.

1. Refresh the fleet launcher and install decrypted-bundle Git authentication. Clone run-slate shallow with blob filtering, configure fleet identity and cloud hooks, create the assigned local cloud branch from main, and fetch the candidate and fresh main.
2. Read AGENTS.md and the contract job's exact workflow. Capture the historical failed job log once, recording any truncation without spending calls retrying log blobs.
3. Install the pinned dependencies and Node 22.20.0 / pnpm 10.12.4. Use the same cloud runner for both clean committed source revisions. Build the production artifact through rer before each run. The CI contract job downloads an app build and six Workers reports; the local reproduction builds those bytes and runs verify.mjs's supported local Workers-suite path (no inherited shard reports).
4. Run node scripts/verify.mjs exactly once on the candidate and once on fresh main, with /usr/bin/chromium, --no-sandbox through the existing browser launcher, and the cloud subreaper. Preserve actual build/verify exit codes, logs, JSON summaries, source/build identity, and clean source status.
5. Compare all 17 checks and contract/baseline behavior counts. Trace the failure through the triple-dot candidate diff and introducing commit; distinguish demonstrated candidate cause, main cause or failure not reproduced. Do not apply a fix.
6. Write REPORT.md and a machine-readable receipt, audit explicitly selected report files for secrets, and publish the relevant complete packet through cloud_evidence.py. Record the exact evidence ref/head and delete the owned clone and dependencies after publication. Return the diagnosis and the required POST line. Product READY/PUSHED is inapplicable to this no-product-push triage.

## Observed environment adjustment

The candidate's one verify.mjs invocation exposed an unset browser override: provider-fallback-flow.mjs reads PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, whereas landing-browser.mjs reads SLATE_CHROMIUM_PATH. The host provides /usr/bin/chromium. After that invocation finishes, run the focused emitted-artifact suite once on the same candidate with both overrides pointing there; retain its independent result without replacing the original verify receipt. Use both overrides for main's one verify invocation. This is an environment-only correction; no source or test edits and no second candidate verify invocation. Report the original candidate failure counts and this adjustment explicitly.

## Runner scheduling and artifact fallback

The local full Workers suite reached 59 completed files and then spent several minutes in one CPU-active Workers runtime. Both historical report-download attempts failed at blob storage and are not retried. Main's one verify invocation is moved to an isolated clean worktree on the same four-core VM, using independently installed identical pinned dependencies. No shared application state or build output is used. The original sequential continuation was stopped before it ran any checks; main will not run twice. The candidate's independent focused browser check will still use both supported overrides after its original invocation finishes.

## Terminal execution outcome

The environment restarted before either one-shot verify command returned. Both process sessions became unavailable and no final Workers JSON or 17-check local summary was emitted. Candidate completed 59 Workers files; main was still in its emitted-artifact suite. Neither verify is invoked again. The proposed focused candidate browser retry and same-report registry experiment did not run. Their queued sequential continuation was stopped before executing either. The original CI check array was recovered intact from the existing gh ZIP cache with no new request and supplies the exact failed check and both messages. Source worktrees remain clean. The report distinguishes confirmed historical CI outcomes from incomplete local reproductions.
