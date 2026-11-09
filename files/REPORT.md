# sd-slate-c-f174-fix4 — DB-002 relation proof isolation

Current result: READY under the brief's explicit generated-view-only exemption. Product branch cloud/sd-slate-c-f174-fix4 is pushed at 2c46b756524867c2bc636f188116383f91941229. No PR or landing claim. DB-002 remains PARTIAL.

Completed native proof: 390px passed at 279.984 s under the stricter provisional 300 s budget; exact-SHA 1440px retry passed at 298.496 s under the final new 360 s budget. Both use identical emitted app bytes. Owner rolling-minute peaks are 56/min (390) and 52/min (1440), versus the unchanged 500 margin. Ordinary registrations: 198 -> 200, cap 200. Clause counts: 59 DONE / 238 PARTIAL / 41 MISSING, unchanged.

Verify 42661381338 is completed/failure at the exact product SHA. The only application failure is ACCEPTANCE.md's generated-view check; dependent core work skipped and is not called green. Both failed jobs were read once, four GitHub reads total at 300 s intervals. Touched transport, HTTP, typecheck, first-party, builds, generator and source-lock checks passed; failed preliminary attempts remain retained below.


Repository: just-every/run-slate
Product branch: cloud/sd-slate-c-f174-fix4
Supporting evidence only: DB-002 remains PARTIAL. No acceptance or landing claim.

## Plan

1. Clone full history, configure fleet identity and preserved repository hooks, fetch the named candidate and require its exact SHA, then merge fresh main.
2. Move the complete record-detail flow, including relation records, from the phone core and desktop database journeys into independent 390px and 1440px registrations. Each owns a fresh workspace, setup and measured deadline. Preserve every assertion and all existing core timeouts and the 500/min owner margin.
3. Route owner and reader browser JSON requests through the existing actor-aware transport alongside probes. Keep production rate limits unchanged.
4. Count ordinary registrations against 200. Run transport tests, the structured HTTP Workers test, standalone record detail, typecheck and first-party check. Do not run the full core journeys in this sandbox. Record native duration and choose a standalone timeout with margin.
5. Run integration sync, contract generator write/check, restore generated views from main, then source lock/check last. Inspect every candidate identity, message and trailer before pushing.
6. Push only the named cloud branch with the fleet guard. Discover and poll exact-SHA Verify through REST with at most one call per 300 seconds and ten total GitHub reads. Read each failed job once as needed. Publish actual non-secret reports and receipts through the separate evidence ref.
7. Stop only processes started for this task. After evidence publication and provenance retention, delete the product clone and node_modules as requested.

## Initial provenance

Fresh full-history clone (no shallow/filter option).
Fetched candidate: cloud/sd-slate-c-f174-fix2-land-f59ef6eb88.
Required and printed HEAD: 77ea3b5cf3cce512772192e5fe64039980867f47.
Fresh origin/main: 92d1c9d733801e953801fd8e17ab23efea778df8.
The candidate already contains main; merge --no-commit origin/main reported Already up to date.
No conflicts or timeout changes were needed for integration.
Main's core owner budget assertion, newer tests and actor transport remain intact.

## Implementation

Two new registrations append after the existing registrations, preserving existing shard ordinals.
Both call the full existing recordDetailJourney, retaining DB-012 assertions and DB-002 relation assertions.
Removed only the two embedded calls, from the phone core and desktop database journeys; no test or assertion is removed.
Owner and independent reader contexts use routeJourneyApi. Probes already use call/ok/state.api from the shared actor-aware transport.
The isolated flow also reports native actor request peaks and checks ownerPeak <= 500.
Only CONTRACT.md's DB-002 evidence wording changes; status stays PARTIAL and all gaps remain.
Generated ACCEPTANCE.md and docs/CLAIMS.md will be restored from main, not committed as new views.

## Registration inventory

`node tests/requirements/count-registrations.mjs origin/main`: 218 expanded, 209 sites, no unresolved loops.
The staged candidate tree: 220 expanded, 210 sites, no unresolved loops.
Using the same conservative exclusion of 20 release-wall registrations: 198/200 before, 200/200 after.
UI journey registrations alone rise 36 -> 38. Exactly two standalone responsive registrations are added; none are skipped or deleted.
Full inventories are retained in registrations-before.json and registrations-after.json.

## Local validation notes

Transport and shard unit checks: 7 passed, 0 failed, 0 skipped.
Typecheck: exit 0. First-party check: exit 0.
Initial setup: exit 1 after client and server bundling; a standalone stable-source `npx -y @runeditrun/rer build` subsequently passed (152.031 s). The setup invocation overlapped an intentional documentation edit and is not counted as a successful setup receipt.
The first structured HTTP run overlapped that build and used the initial toolchain environment; its first test hit the unchanged existing 90000 ms deadline, with the second test passing. No test assertion failure was reported. A dedicated Node 22.20.0 rerun follows with no increased deadline. These initial receipts remain included rather than being replaced.
Pinned Node 22.20.0 is installed outside the checkout; pnpm remains 10.12.4.
No full core-wiki/touch-member journey was run locally, as directed by the brief.

Dedicated structured HTTP rerun (Node 22.20.0, no simultaneous build): 2/2 passed, 0 skipped. Vitest reported 60.26 s total, 41.63 s tests; the outer command receipt includes launcher overhead. The existing 90000 ms test deadline is unchanged.
Fresh pre-publication main fetch still resolves to 92d1c9d733801e953801fd8e17ab23efea778df8.
Inherited candidate identity/message audit passed across every side parent. Existing owner merge commit uses James Peter <github@zemaj.com>; other candidate commits use the fleet identity. No OpenAI/Codex co-author survives. No published history was rewritten.
With ordinal partitioning, the appended 390px and 1440px registrations use partitions 5 and 6 respectively; existing named/ordinal assignments are unchanged.

## Native probe interruption and cleanup fix

The first 390px standalone attempt passed all DB-012 edit, parity, history and unchanged viewer-refusal assertions, then reported an unhandled 30000 ms API transport timeout for a collaboration GET belonging to the unrelated first-run Welcome page. During this attempt the cloud executor transport disconnected temporarily; the environment status reported connectivity offline while observed phase remained running. No full core journey was run.
The initial test reported 198200 ms before that rejection and setup 78045 ms. This is not a successful full relation proof or a measured completed duration. The native probe shell and its specifically enumerated descendant Worker/browser processes were stopped; no broad process kill was used.
The record proof now unmounts the unrelated first-run page before installing owner transport. Reader and owner pages unmount before their scoped transports drain. Every record assertion remains and the same real actor-aware transport dispatches requests without response retries. A stable-source rebuild and fresh standalone probes follow. The initial sanitized log and receipt are retained separately; session cookies are redacted.

## Mechanical regeneration

MECHANICAL lock=pnpm source:lock exit=0; views=node src/base/runtime/contract-docs.mjs write && node src/base/runtime/contract-docs.mjs check exit=0.
Integration sync: exit 0. `pnpm source:check`: exit 0.
Both generated views were then restored whole using `git checkout origin/main -- ACCEPTANCE.md docs/CLAIMS.md` before the source lock was generated last. The final product diff against main will carry no generated-view edits. A contract-docs check on those restored views is expected to differ and is the explicit lander exemption.
Clause counts are unchanged: 59 DONE, 238 PARTIAL, 41 MISSING before and after. DB-002 remains PARTIAL; only its supporting relation-proof citation and registration wording change. No gate or full clause acceptance is claimed.

Final setup (stable source, Node 22.20.0): exit 0, 239.061 s. It leaves no dev server running. The repository-preserving fleet commit hook was reinstalled after setup.
Final first-party check after cleanup changes: exit 0.
The stopped initial probe has no surviving live processes; its Python subreaper is an executor-owned zombie awaiting init reaping, not a running server or browser.

The rebuilt 390px attempt completed every DB-012 and DB-002 functional assertion, including revocation, in a 219895 ms test (setup 92167 ms; record-detail phase 116364 ms), then failed on a routed-request teardown race: `route.fulfill: Route is already handled!`. Teardown now restores/drains transport before navigating its page to about:blank; the unrelated first-run page still unmounts before the proof begins. The 300000 ms standalone budget provides about 80 seconds beyond that native duration, and remains far below the unchanged 780000/720000 ms core deadlines. Final fresh probes run after this cleanup fix and another build/source lock check. The sanitized cleanup-race log is retained.

The final cleanup-order source lock/check passed (1.434 s / 1.757 s); the subsequent Node 22.20.0 `npx -y @runeditrun/rer build` passed in 309.568 s. Its longer wall time reflects the cloud build run; no product source, core deadline or request limit was changed to obtain it.
The final standalone probes use this stable rebuilt source and remain limited to the two named record-detail registrations.

Final 390px registration: PASS, including cleanup and budget assertion, duration 279984 ms; setup 103810 ms; detail 165415 ms. Owner rolling-minute peak 56/min (148 total), reader peak 71/min (123 total), under the unchanged 500 margin and 600 native limit. The final 1440px case runs next in its own workspace. No full core journey has run locally; this is the isolated record proof's measured budget, not a claimed new core peak.
PROBE DB-002 record detail: native Fields > Add field > relation, selecting the destination database, then clear/one/two real target selections -> persisted exact identities after reload, current renamed label and canonical record navigation; revoking one target -> no target ID/label in member values or picker, forbidden PATCH and follow refused, owner's retained identities/history unchanged (390px final registration passed).

## Published candidate

Product head: 2c46b756524867c2bc636f188116383f91941229.
Branch: cloud/sd-slate-c-f174-fix4. One product push, accepted on the guard's first attempt. No force push, default-branch update, PR or landing was performed.
All final first-party, contract-generator write/check and source-lock/check commands passed before the commit. The named new registration's final timeout is 360000 ms. Existing core deadlines and the core ownerPeak <= 500 assertion are unchanged.
The provisional 300000 ms run passed the full 390px registration (279984 ms, owner peak 56/min), while desktop reached its final relation/revocation phase before that provisional deadline fired. The final new budget adds runner margin; it changes no assertion. A fresh exact-SHA build and desktop-only 360000 ms run are being retained as separate receipts. No full core journey was run in this cloud.
TIMEOUT-GUARD: git diff origin/main HEAD -- tests | grep -n timeout — only the new "DB-012 and DB-002 — populated record detail and actual relation records" registration's own 360000 ms timeout is present. Raw output is retained in timeout-guard-final.txt.
MECHANICAL lock=pnpm source:lock exit=0; views=node src/base/runtime/contract-docs.mjs write && node src/base/runtime/contract-docs.mjs check exit=0 (final receipts: source-lock-candidate.json, source-check-candidate.json, views-write-final.json, views-check-final.json). Generated views were restored whole from main before the last source lock and are absent from the final diff against main.

## Exact-SHA artifact custody

`npx -y @runeditrun/rer build` at committed head 2c46b756524867c2bc636f188116383f91941229 passed in 151.848 s.
The candidate build's emitted-output SHA-256 is f9fee64b1070426811b11c250d086c25dab46d6ef8c2358a735b49b4c05c98c6, byte-for-byte identical to the emitted output used for the completed phone proof. ARTIFACT-EQUIVALENCE.json retains both genuine build receipts and this comparison. The source metadata changed only the new registration budget/comments, its explanatory requirements prose and the source lock; functional assertions and product source were unchanged. The phone proof's 300000 ms deadline was stricter than the final new 360000 ms deadline.
The exact-SHA Verify run is 42661381338 (https://github.com/just-every/run-slate/actions/runs/42661381338), completed/failure on the exact candidate SHA. It is not called green. Failed-step/log classification follows under the explicit generated-view exemption protocol, using a single REST watcher with 300 s spacing and a ten-call ceiling.

## Exact-SHA desktop screenshot interruption

The first exact-SHA desktop run completed DB-012's edit, parity, history and unchanged read-only refusals, configured the real relation field and verified its persisted destination. The existing screenshot call at the focused relation-field tooltip then timed out at its unchanged 30000 ms limit (`browser-evidence.mjs:22`, called by `record-detail-journey.mjs:200`). This was a screenshot harness timeout, not a failed relation value/authority assertion or the new 360000 ms registration deadline. Native case duration was 281018 ms; setup 100251 ms; detail 159544 ms. The full sanitized log and actual exit-1 receipt are retained. One identical-SHA retry follows with no timeout or assertion changes.

## Hosted Verify classification

Run 42661381338 is completed/failure at exact SHA 2c46b756524867c2bc636f188116383f91941229.
Root job `verify (app)` 129313624546 failed only `Run node src/base/runtime/contract-docs.mjs check`; its log states exactly: `ACCEPTANCE.md: generated content differs; run contract-docs write.`
The plan job passed. The matrix placeholder job 129313967043 was skipped; no `verify (core)` job ran or is claimed green. Contract and dependent matrix work skipped. Aggregate `verify` 129313967002 failed `Require the plan and every expected job` because its application prerequisite failed.
This meets the brief's explicit generated-view-only READY exemption. It is not an Actions success claim or a landing claim. The Mac lander must regenerate the restored views, run its own publication scan and exact-SHA checks before landing.
Root diagnostic command (one archive read): `gh run view 42661381338 --repo just-every/run-slate --job 129313624546 --log-failed`.
The REST watcher used 300 s spacing; no blocked job-log blob redirect or added Authorization header was used. The aggregate job is being read once as well; all reads stay under the ten-call ceiling.

## Final native results and handoff

The identical-SHA desktop retry passed every assertion, screenshot, revocation, unchanged-state refusal, cleanup and request-budget check. Native duration: 298495.643 ms; setup 53762 ms; detail 227192 ms. The final new 360000 ms deadline leaves 61.5 s beyond this observed desktop duration and 80.0 s beyond the completed phone duration. No existing test deadline changed.
Desktop owner peak: 52/min, 151 total; desktop reader peak: 84/min, 140 total. Phone owner peak: 56/min, 148 total; phone reader peak: 71/min, 123 total. Each is an isolated record workspace's native measurement, not a claimed new long-core peak.
PROBE DB-002 record detail: 1440px native relation field settings plus clear/one/multiple selections, filtered selections outside the search, reload, rename and canonical target follow -> retained real target identities and current labels; revoke one target -> member lookup/value/picker omit it, native write and follow refuse, owner values/history unchanged. PASS on the exact pushed SHA.
Focused relation tooltip screenshots were visually inspected once at 390 and 1440. The packet includes the actual screenshots and geometry/accessibility receipts, plus native request measurements and logs.
The first exact-SHA desktop screenshot timeout was not hidden: its exit-1 receipt and log remain. The bounded identical-SHA retry passed without timeout or assertion changes.
Aggregate Verify log was read once using `gh run view 42661381338 --repo just-every/run-slate --job 129313967002 --log-failed`; it confirms APP=failure, SHARDS/CONTRACT=skipped. Four GitHub reads were used, each separated by at least 300 s. No API read failed.
Final blockers: none under the stated READY exemption. No full clause acceptance, gate acceptance, full core execution, publication-scan success or landing is claimed. The fleet must regenerate views and run its independent checks/publication scan before landing.
The complete explicitly selected non-secret packet is published through refs/heads/evidence/sd-slate-c-f174-fix4, separately from product custody. Final local cleanup removes the clone and node_modules after that evidence transport completes; the packet remains outside the clone.
