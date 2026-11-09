# Slate DEC-006 continuation — sd-slate-c-f212-fix2

Product branch **cloud/sd-slate-c-f212-fix2** is pushed at **0eaa43c302904eb27fece856ad28c2e9ea48b92c**. **BLOCKED for full-journey acceptance**: the required enclosing phone registration failed before DEC-006; three consecutive green full-registration runs were not obtained. The complete existing DEC-006 native journey passed three consecutive times at each width on this exact pushed build. No READY or landing claim is made.

Full executable plan: PLAN.md. Machine-readable result: outcome.json. Product custody: product-receipt.json and product-push.log. Evidence publication is separate from product custody and acceptance.

## Starting point and scope

Fresh full-history clone (not shallow) of just-every/run-slate. Both fix1 HEAD and `git rev-parse 2ea899a4` resolved to `2ea899a49ec26d7f91caf585e1c7937b37d6f329`. Created the named fix2 branch from it. Fresh main was `0b55774db7e7454174c6d7474ba46b4cf55f820f`; merge reported already up to date. Main was fetched again immediately before publication and remained the same ancestor. Main's timeout and comments fixes are retained. No default branch was written, no history rewritten, no PR created (the repository's workflow accepts the named cloud branch).

The previous owner-budget routing was already implemented in fix1. This round adds existing per-actor count observations to workspace network reports, DEC-006 receipts and diagnostic lines, and documents those fields. The actor-aware transport, per-actor queue and pacing, request bytes, binary doors, production limits, retries, assertions and repository deadlines are unchanged. The added metrics count a routed browser request once at dispatch and retain the existing separate binary count. Only the product/contract/specification/lock changes are in the product commit; fleet reports remain outside it.

## Read the hosted app failure

Prior Verify **42577008851**, app job **129026924474**, ran on exact fix1 SHA and failed only `node src/base/runtime/contract-docs.mjs check`. The app verification step was skipped. The single `gh run view 42577008851 --repo just-every/run-slate --job 129026924474 --log-failed` returned exit 0 with no text. Its artifact listing was empty. Retained job metadata proves the failed step. Local reproduction exited 1 naming stale ACCEPTANCE.md.

Candidate Verify **42596882194** ran on **0eaa43c302904eb27fece856ad28c2e9ea48b92c** and has actual conclusion **failure**. App job **129091644187** failed only the same generated-view check. Its archive command succeeded and the actual log says:

`ACCEPTANCE.md: generated content differs; run contract-docs write.`

The aggregate job failed its required-job guard and downstream jobs skipped. This is the brief's generated-view-only CI exemption; it is not represented as an actual hosted success. The separate local full-phone failure remains an acceptance blocker. Run/job metadata, app log and receipt are in candidate-ci-status.json, candidate-ci-jobs.json, candidate-app-failure.log, candidate-app-failure-receipt.json and ci-receipt.json. Eight GitHub calls were used; active-run inspections were at least 300 seconds apart. No other SHA's green run was substituted.

## Measure first, then preserve the proof

The unchanged enclosing phone baseline stopped before DEC-006 with `Typed shortcut "# " failed` in typed-shortcuts-journey.mjs, called by writeJourney's BLOCK-001 step. The screenshot shows a literal # paragraph. No RATE_LIMITED/429 rejection was reported. **OWNER PEAK before: 194/min**, observed only up to that early failure, with 335 owner requests (136 probes, 199 browser). This is an incomplete baseline, not a completed-journey peak. Full-phone after peak is unavailable because the required full registration did not complete.

The unchanged standalone caller invokes the candidate's exact existing `decisionEditJourney` through its normal `withWorkspace`/`setupWorkspace` setup and retains every assertion. Its baseline passed both widths: owner **88/min at 390**, **83/min at 1440**; reader **247/min**, **189/min**. See baseline-dec006.json/log and its width-specific complete native receipts and metrics.

After count persistence, the same native function passed three consecutive pairs on this exact pushed build:

| Repeat | Width | Owner peak/min | Reader peak/min | Result |
| --- | ---: | ---: | ---: | --- |
| 1 | 390 | 100 | 235 | passed |
| 1 | 1440 | 82 | 198 | passed |
| 2 | 390 | 118 | 299 | passed |
| 2 | 1440 | 109 | 206 | passed |
| 3 | 390 | 110 | 206 | passed |
| 3 | 1440 | 94 | 187 | passed |

**OWNER PEAK after (native DEC-006): 118/min at 390; 109/min at 1440**, the maximum across the three passing repeats. Peaks use a rolling 60000 ms window, the existing assertion ceiling is 500 and the unchanged native limit is 600. Both actors remain below the margin. Pacing did not change; before/after differences are runtime observations, not a claimed rate reduction. Complete method/path counts and native receipts accompany each repeat. Network-budget subsets contain only artifact identity, viewport, profile and count observations; private runtime state and authentication material are excluded.

PROBE DEC-006: native proposal controls and authenticated HTTP at 390 and 1440 -> all eight fields retain exact durable revisions; unchanged writes are no-ops; stale captures return 409, view-only writes 404, accepted edits 409; original proposal snapshots, actor/time history, underlying page blocks and immutable accepted content are retained. Reader/owner authority and each refused field remain asserted. Final-repeat screenshots and accessibility/geometry/source evidence are under screens/390 and screens/1440, four changed decision states at each width. These independent callers add evidence; they do not replace or certify the failed enclosing registrations.

## Unresolved full-journey checks

1. Candidate's unchanged full 390 registration failed in the typed-formatting # shortcut before DEC-006 (baseline-390.json/log, baseline-390-failure.png). Therefore the requested three consecutive green full core-wiki/touch-member registrations at both widths are **not** established.
2. Fresh main's complete original 390 registration also failed, at transfer-jobs-journey.mjs:280: its existing 5000 ms predicate waiting for the storage gate's reached flag expected true and observed false (main-core-390.json/log, main-390-failure.png). This is a different failure; it does not prove the identical typed-shortcut failure occurs on main. These editor and transfer paths are unchanged by this continuation. They were left unchanged under this DEC-006 lease.
3. An earlier focused main write diagnostic hit its own newly imposed 240-second diagnostic cutoff and is inconclusive (main-write-390.json/log). It was followed by the actual original main registration at its unchanged deadline. No repository deadline was increased.

No failing assertion was deleted, skipped, weakened or retried as a request wrapper. The main comparison is local evidence, not a main CI claim. The full-phone failures, not generated views or missing builder receipts, block READY.

## Local checks and mechanics

- Transport/reachability: 5 passed; initial transport-only regressions: 4 passed, including serialized fan-outs, actor switching, exact binary bytes, intentional offline refusal and one unretried 429.
- Typecheck passed. Profile node test passed; profile Workers command passed 2 files / 5 tests. The full release-source command passed.
- Exact-candidate `pnpm verify`, `pnpm exec rer describe` and the source publication input scan passed (candidate-verify.json/log, 438.181 seconds). This includes first-party checks, generated types, Base copy equality, typecheck, contract and operation commands, production build, source lock, artifact boundaries, locally served production admission and separate-section hydration.
- The build provenance in candidate-build-source.json records this exact commit. Native repeats used Node 22.20.0 / pnpm 10.12.4 and /usr/bin/chromium with --no-sandbox through cloud_run. Each command had a hard outer timeout.
- MECHANICAL lock=`pnpm source:lock` exit=0; source=`pnpm source:check` exit=0. Views=`node src/base/runtime/contract-docs.mjs write` exit=0, then `node src/base/runtime/contract-docs.mjs check` exit=0. Restored both generated views whole from origin/main; subsequent view check exit=1 names ACCEPTANCE.md only. Integration sync passed. Lock was regenerated last after staging intended source. Actual ordered command receipts: mechanical-steps.json; command-wrapper receipts: mechanical.json and mechanical-repeat.json.
- Generated ACCEPTANCE.md and docs/CLAIMS.md were not committed; the Mac lander must generate them from the merged source.

## Clause counts and custody

Restored main's DEC-006 row verbatim: inherited candidate **done -> partial**, equal to main. No other row changed and no status was raised. Generator-produced all-clause counts are **60 done / 237 partial / 41 missing -> 59 done / 238 partial / 41 missing**, total 338. Published counts return from 44/182/1 to main's 43/183/1.

The new commit's author and committer are Run Edit Run fleet <fleet@runeditrun.com>. Every candidate commit, including side parents, passed identity/trailer inspection; the retained owner's merge identity matches existing main. No Codex/OpenAI co-author line survived. The required cloud guard pushed the named branch successfully on attempt 1. No force push or main push occurred. Relevant terminal provenance and publication log are retained separately from evidence transport.

## Diagnostic integrity note

During worktree isolation, an extra build was initially launched in the main comparison checkout and stopped through its owned process group before Vite changed output. Its output hash still exactly matched the previously recorded main artifact, e429153c6df50b32ce26c193156c824e3fd89b34a6e6aadb85e99793aa7d4ac1. Restored that exact provenance record before the main comparison browser started. No source or emitted main bytes changed. The candidate was then installed and built in its separate worktree. Complete reports, receipts and explicitly selected screenshots are retained outside both worktrees for publication and recovery. Product checkout and node_modules cleanup follows successful evidence custody.

A report-wrapper filename collision initially replaced the ordered mechanical receipt with its execution-summary receipt. The final packet keeps both under distinct names: mechanical.json for the initial execution summary, mechanical-repeat.json for the repeat, and mechanical-steps.json for its actual ordered results. Repeating the generator/restoration/lock checks left the exact source and lock bytes unchanged against the tested artifact; source-stability.json records that comparison.
