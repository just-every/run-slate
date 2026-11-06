# Slate f160 scoped response repair

Repository: just-every/run-slate
Tag: sd-slate-c-f160-response-repair-1
Branch: cloud/sd-slate-c-f160-response-repair-1
Product head: ab95639f06e310076505972d0bf548861af80ba4
Base and freshly reconciled main: 51162d87a91a4556ab68fdee79caa26e1b747a29
PR: none; this seed's branch Verify and fleet landing rules apply.

The one authorized correction restores the ordinary PATCH page response without discarding exact ORIGINAL response/receipt replay. The full plan is PLAN.md, immutable lineage is lineage.json, actual command/check and push results are receipt.json, and the complete product delta is candidate.diff. Local checks pass; exact-head push Verify 42136380673 remained in progress at the final bounded observation. Terminal product custody is PUSHED; READY is not claimed.

## Source and replay semantics

`commitOperation` accepts optional typed response projections from a mutation plan and serializes them together with the unchanged value and receipt in the original atomic receipt insert. Its current-authority check, same-body hash, raced-receipt path, original 24-hour expiry and changed-body 409 remain unchanged. Other operation callers retain their existing result shape.

The page service renders the intended PageRow and immutable block/property revision through the existing page-document renderer before the CAS-guarded D1 batch. This retains ordinary display, owner/author, permissions, lifecycle, verification, schedule and content projections. Both changed and unchanged page updates include the complete top-level document in the stored response. No latest-document read is appended on replay, so later content cannot replace the first response. The route serializes that complete durable response directly. No migrations, inventories, revision/activity/notification write semantics, UI, homepage, production or tool pins changed.

Fresh main was the known passing direct parent of the causal commit, not a superseding fix. The original route serialization, existing folded native-cookie replay journey and its independent canonical inventory helper were retained within the declared lease. The existing main UI and all contract/acceptance metadata bytes were preserved. Original judgment/view/metadata and UI-only deltas were not transplanted outside the repair lease. No history was rewritten, no force push or main push occurred, and no independent gate/judge was spawned.

## Before and after

Retained original Verify 42121393981 attempt 1 returned HTTP 200 but failed display-options at `changed.document.properties` (41:29) because `document` was absent. See RETAINED-FAILURE.md; completed attribution was not rerun. The changed-head display-options suite passes and still exercises the original assertion and readable/workspace archive round trips. It additionally compares concurrent identical responses, immediate replay, exact document equality with an ordinary GET, and page revision/value consistency, including unchanged default display options.

The retained native session-authenticated replay journey still covers page creation, title changes, body changes, comment creation and page grants. It compares complete HTTP bytes with stored response JSON, two concurrent identical requests, immediate replay, replay after later writes and the last millisecond of each original 24-hour window. Changed-body reuse returns 409. Independent populated page/block/revision/comment/thread/grant/receipt/notification/outbox/activity inventories remain unchanged on replay. A new unchanged-title subcase inside the existing registration proves exact no-change response custody, one receipt and no new activity/revision/notification. Current authority is rechecked while every receipt is valid: grant revocation denies all saved responses with 404, then sign-out denies them with 401. The original exact-expiry assertion remains.

Four affected suites / seven existing registrations pass on Node 22.20.0, pnpm 10.12.4:

- `pnpm exec vitest run tests/e2e/pages/display-options.test.ts tests/flagship/content/http.test.ts tests/qualification/core/audit-content.test.ts tests/flagship/core/security.test.ts` — 4 files, 7 tests passed, exit 0, 48.55 seconds.
- `pnpm typecheck` — exit 0.
- `npx -y @runeditrun/rer check --profile first-party` — exit 0 (no CLI output).
- Contract generator write/check — exit 0, wrote 0 documents, current. Generated files were restored whole from origin/main.
- `pnpm integration:sync` — exit 0.
- `pnpm source:lock` generated last after staging intended source/tests; `pnpm source:check` — exit 0. Source pins were not changed.
- Scoped staged diff, whitespace and all candidate author/committer/message/trailer checks passed. Candidate author and committer are Run Edit Run fleet <fleet@runeditrun.com>; trailers absent. The full-history publication scan remains the fleet's gate.

The Workers test log includes native durable-object shutdown/reset diagnostics; the runner completed with 4 passing files, 7 passing tests and exit 0. No local full suite, repeated attribution, browser-only UI proof or substitute REV build was run. Local setup performed its ordinary application build and migration only; that is not REV006 custody evidence.

Contract counts remain 57 done, 240 partial, 41 missing, 338 total. Affected registrations are 7 before / 7 after; the repository's declared test-budget count remains 205 and no permanent registration was added. CONTRACT.md, ACCEPTANCE.md and docs/CLAIMS.md are byte-for-byte main. Clause status/Gap/count/acceptance changes: none. SAVE-005 remains partial; no DONE or requirement-wide acceptance claim.

## Custody and remaining dependencies

One real final product commit was pushed once, through the fleet guard, to the named branch. The push succeeded on attempt 1 and an ordinary remote ref read confirmed the exact product SHA. Main was fetched and the unpublished candidate rebase was a no-op before the identity/trailer check and push. No CI dispatch/rerun/readmit/adopt/submit, lifecycle edit, hold release or additional FIX budget was used. The CI retry budget stays UNSPENT.

The original refused result and Verify 42121393981 attempt 1, all source/review/stack holds, frozen rubric and original lifetime counts remain immutable. Changed protected source still needs independent affected qualification; previous-source proof does not accept it. SAVE-005 selection remains AP1–2 for native creation/title/body/comments/grants only. Other mutation families, publish/import/AI, requirement-wide every-mutation coverage, ADMIN007/companypolicy and SAVE003 DEFER remain held.

REV006 job 127575623740 still requires the original verified-app-build artifact 13458407198 and supported transport from SAME MAIN/FV custody. This repair does not satisfy, substitute, rerun or release that dependency. The fleet owns full-history publication scanning, merged generated views, exact-final runtime Verify, guarded main equality and exact-main Run site. A green builder Verify, when observed, will only name this branch candidate; it does not release these holds or land it.

This packet is selected explicitly for the separate report-only evidence ref. It includes no credentials, secret values, environment dumps, held-out gate material or symlinks. Evidence publication is separate from product readiness and never signals acceptance or landing.

## Exact-SHA CI observation and terminal handoff

Push Verify run: 42136380673
URL: https://github.com/just-every/run-slate/actions/runs/42136380673
Observed head: ab95639f06e310076505972d0bf548861af80ba4
Latest observed state: in_progress, conclusion null.

The single watcher used four successful REST calls (one exact-head discovery and three status observations), at least 300 seconds apart, over approximately 15 minutes. It stopped bounded observation as the brief forbids extended polling. No completed failure was observed, so no job logs were requested. No CI retry, dispatch or rerun was used. The GitHub call budget used is 4 of 10; CI is pending rather than reported green. Independent fleet gates must read the actual completed exact-SHA result. This pending observation does not establish a blocker in the product correction, acceptance, landing, or release of any original hold.

PUSHED branch=cloud/sd-slate-c-f160-response-repair-1 head=ab95639f06e310076505972d0bf548861af80ba4

The complete packet is published separately through cloud_evidence.py. The product checkout remains clean and unchanged during report publication. The disposable clone and its node_modules are removed only after successful product and evidence transfer; source, diff and exact custody receipts remain preserved in this packet and their remote refs.
