# sd-slate-c-f165 — SAVE-005 native replay continuation

Repository: `just-every/run-slate`
Branch: `cloud/sd-slate-c-f165`
Candidate: `9d63bae1099e54ddf922c1d0df75c1770bc8682c`
Pinned predecessor: `52b6d73b83c0cf8c326a104ff052c95e8aa0ca4a`
Main observed before the final push: `51162d87a91a4556ab68fdee79caa26e1b747a29`

SAVE-005 remains **PARTIAL → PARTIAL**. The five native mutation families selected in the brief are proved locally, including a newly reproduced and repaired overlapping-retry failure. The complete every-mutation requirement remains unproved. As the planner directs, all other families remain outside this selected corpus, including publish, import and AI-run outcomes; ADMIN-007 and shared company-policy prerequisites remain authoritative. No acceptance sentence was changed, no DONE is claimed, and no new policy or judge request is proposed. SAVE-003 and its frozen deferred loop remain untouched.

Counts remain **57 DONE, 240 PARTIAL, 41 MISSING**, total 338. Every commit retains all parent Status rows, including side parents; each candidate contract has 698 table lines. No test registration was added. The existing budget declaration and workflow remain unchanged. The only plan row to update is SAVE-005: retain PARTIAL and record the stronger native overlap, expiry and current-authority proof. No next clause was started because the extract expressly holds the wider remainder and requires this continuation to stay on SAVE-005.

## What changed and why

The predecessor already proved concurrent identical HTTP requests when both reach preparation before the first commit. A second ordinary ordering was wrong: the retry reads no receipt, another identical HTTP request commits, then the retry prepares against the now-superseded block revision. Preparation returned `409 BLOCK_CONFLICT` before the operation engine's existing transaction-error replay recovery could run.

A new deterministic HTTP probe reproduced this on the predecessor before production edits. The failing assertion was: “overlapping retry after the first commit returns the original response: expected status 200, received status 409 BLOCK_CONFLICT.” The actual command exited 1; `overlap-before.log` retains the failure. This is a local newly added probe, not a CI repair round.

`./src/core/app/operations.ts`, lines 30–45 and 65–66, now shares replay recovery between preparation failures and transaction failures. Recovery looks up a committed receipt, rechecks current authority, compares the complete request hash and original expiry, and returns the stored response. If no receipt exists, the original preparation failure survives. It does not retry a domain write, extend the receipt window or relax transaction guards.

The existing HTTP registration loads `operationReplayCase` in `./tests/flagship/content/operation-replay.case.ts`. Its added lines 106–147 cover three deterministic overlap outcomes, an ordinary stale edit without any matching committed operation, and original-expiry refusal for every selected mutation. `holdOperationRead` in `./tests/qualification/core/audit-support.ts` pauses delivery of a genuine D1 read; no successful application response or storage result is fabricated. Both requests still authenticate with native cookies and execute the product routes and real D1 transactions.

The Status Evidence and Gap, the exact requirement specification, and the supporting-test registries describe this bounded proof. The predecessor's immutable title response and ordinary document refresh are preserved.

## Acceptance mapping and runtime probes

Both acceptance sentences describe the same retry contract. The existing “content durable HTTP content saves, revisions, moves, deletion, suggestions and attachment limits preserve durable state” registration performs the following five families with populated notification recipients:

- Page creation: native `POST /api/pages` creates exactly one page and block.
- Title changes: native `PATCH /api/pages/:id` retains the first response after later page writes.
- Body changes: native `PATCH /api/pages/:id/blocks/:blockId` creates one immutable revision.
- Comment creation: native `POST /api/comments/page/:id` creates one comment and thread.
- Page grants: native `POST /api/sharing` creates one grant and identity revision.

For each family, two identical concurrent requests return equal original response bytes and receipts. Immediate replay, replay after later writes and replay one millisecond before its original 24-hour expiry return that same response. A changed body returns 409. At the original expiry, every selected operation returns 409 without changing the retained inventories. Earlier replay never renews the window.

A real watcher receives exactly one notification for each selected mutation. Independent D1 snapshots reconcile pages, blocks, comments, threads, grants, page revisions, comment revisions, identity revisions, receipt rows, notification origins, deliveries, content events and activity. Native page, comment, grant, inbox and activity reads remain unchanged after replay and refusal.

PROBE SAVE-005 page creation: native cookie HTTP create, simultaneous copy, immediate replay and original-expiry-minus-one-millisecond replay -> exact first response, one page and block, one watcher delivery; changed body and expired replay 409; retained inventories unchanged.
PROBE SAVE-005 title changes: native cookie HTTP title edit and repeated key -> exact original response through later writes and original expiry boundary; one revision, notification and activity entry; changed body and expired replay 409.
PROBE SAVE-005 body changes: native cookie HTTP block edit and repeated key -> exact original response; one revision, notification and activity entry; changed body and expired replay 409; retained content unchanged.
PROBE SAVE-005 comment creation: native cookie HTTP comment create and repeated key -> one comment, thread and revision, one notification and activity entry; exact first response retained; changed body and expired replay 409.
PROBE SAVE-005 page grants: native cookie HTTP grant and repeated key -> one grant and identity revision, one delivery and activity entry; exact original response retained; changed body and expired replay 409.
PROBE SAVE-005 overlapping identical: hold a real empty receipt read, commit the competing request, resume the retry -> original 200 response byte-for-byte, with no second write.
PROBE SAVE-005 overlapping changed body: hold an already-authorized page read while the competing request commits -> 409 OPERATION_KEY_CONFLICT, inventories unchanged.
PROBE SAVE-005 overlapping lost authority: hold an already-authorized page read, commit the competing request, then narrow edit authority to view before resuming -> 404 NOT_FOUND, cached response refused, inventories unchanged.
PROBE SAVE-005 stale edit: a new key with a superseded block revision and no committed matching receipt -> 409 BLOCK_CONFLICT, no receipt or canonical change.
PROBE SAVE-005 current authority: native grant revocation followed by sign-out -> every old mutation refuses 404 then 401 without canonical or notification changes.

The existing security and audit registrations still cover ordinary concurrency, atomic rollback, current membership and permanent erasure. No assertion was weakened, skipped or placed behind a new width or environment condition. The old single final-expiry assertion was generalized to the same refusal for all five selected operations.

## Local results and browser proof

The exact committed candidate passed all **six registrations in three touched Workers files** on Node **22.20.0**. The actual report is `candidate-workers.json`, the output is `candidate-workers.log`, and `tested-head.txt` binds that run to the candidate. These are the existing content HTTP, authority and audit files, already loaded by Verify. The new overlap assertion fails on the predecessor without the repair, as the retained negative-control log shows.

`pnpm typecheck`, `pnpm exec rer check --profile first-party`, integration synchronization, the build, contract regeneration and its check, and the source lock and its check passed. No full local suite or additional workflow dispatch was run.

The existing `writeJourney` passed through the emitted application at **1440 and 390** with Chromium at `/usr/bin/chromium` and `--no-sandbox`, under the required hard timeout and subreaper. It exercised native page creation, durable title and body saves, reload, real offline loss, retained unsent text, explicit retry, ordered blocks and the existing editor assertions. `editor-1440.png` and `editor-390.png` show the completed screen. The relevant production source and browser helper bytes equal the built save commit `4796853a`; the final commit changes only the replay test, its specification and the generated source lock. All browser and server processes started by the proof were closed.

The screen layout was not changed. Existing controls retain their tooltip components and the existing editor accessibility checks passed. No homepage, branding, provider pin, migration, CI workflow or configuration UI changed. No email-shaped text was added to the product diff.

MECHANICAL lock=pnpm source:lock && pnpm source:check exit=0; views=node src/base/runtime/contract-docs.mjs write && node src/base/runtime/contract-docs.mjs check exit=0, generated views restored from origin/main; ledger=none exit=0.

`mechanical.json` records the commands and results. `history-check.json` records every candidate and parent row-retention check. Neither generated contract view was committed. `PLAN.md` contains the full executed plan.

## DONE-RIDERS assessment

No whole-clause DONE claim is made. These assessments distinguish local selected-point proof from the wider clause and guarded landing.

1. **Not met for full DONE:** the loaded HTTP journey reaches both acceptance outcomes for the five selected families, but all other mutation families and requirement-wide coverage remain unproved. Exact-SHA Verify and guarded landing remain separate.
2. **Pass for selected scope:** a real populated watcher and independent inventories expose duplication; changed bodies and lost authority are refused unchanged. Overlap assertions are at lines 119–137 and window assertions at lines 138–147 of the replay case.
3. **Not established by candidate CI:** Verify loads the existing content, authority and audit registrations, but the candidate run stopped at the expected generated-view freshness step. Local exact-candidate results are green. Skipped shards are not reported as CI proof; the lander regenerates and reruns its gates.
4. **Pass locally:** the Workers result is on the committed candidate. Browser source and helper equality to the built source was checked with Git; no relevant browser or production byte changed afterward.
5. **Not newly applicable:** no inherited Base duty or acceptance point was added. The audit registration's existing BASE-OPS-005 attribution remains supporting proof.
6. **Pass as PARTIAL metadata:** the Gap retains every unproved family and prerequisite; counts remain generated and unchanged. Contract write and check passed before restoring the views. Existing unrelated judgment stamps remain intact; no whole-clause fresh judgment is claimed.
7. **Pass:** no acceptance sentence, clause ID, coverage obligation or ruling changed. Every parent's Status rows remain present.
8. **Pass for selected scope:** native narrowing after authorization refuses recovered replay; native revocation and logout also refuse old operations. Existing guards and the unsafe ordinary stale-edit case remain intact.
9. **Pass as an honest boundary:** no provider, AI-run, import, publication-wide or legal acceptance is claimed.
10. **Not newly applicable:** no custody, consent, spending or authority policy was invented. Existing native authority is retained.
11. **Pending guarded lander:** the branch is pushed at the exact candidate. Main equality, regenerated views, exact-SHA green Verify, publication scan and Run site remain the lander's gates. No scan result or landing is fabricated.

## Custody and handoff

The first save was pushed at `4796853afd3da3fb015f180841e3157a885db87d`; the exact save identity is also recorded in `history-check.json`. The final candidate is `9d63bae1099e54ddf922c1d0df75c1770bc8682c`. Both pushes used the fleet guard, succeeded on the first attempt, and audited every candidate author, committer and trailer. No published history was rewritten. A final fetch and merge of main was already up to date. The remote branch was read back at the candidate; main remains unchanged. No PR is needed because the workflow accepts this branch's push event.

Verify Slate push run **42117340648** was discovered on this exact SHA; its first observed status was queued. The final observed result is recorded below after the single watcher checked it under the five-minute polling limit. Main's preexisting Verify run 41977421463 and Run site run 41977421457 were successful on the observed main. Cloud execution does not run the publication scan or push main. Evidence publication is independent of product readiness and landing.


Final CI observation: push Verify Slate **42117340648** completed **failure** on the exact candidate. App job **127560443020** failed only `node src/base/runtime/contract-docs.mjs check` with “ACCEPTANCE.md: generated content differs; run contract-docs write.” Aggregate job **127560776473** failed because the app failed and its dependent shards and contract job were skipped. Both failed-job archives were read once through the prescribed `gh run view` command; both transports succeeded. Their sanitized receipts retain the commands and failures and omit environment sections. No workflow was edited, no generated view committed, no CI repair attempted and no rerun or dispatch issued. Six counted GitHub calls were used, with one watcher and 301 seconds between discovery and the status poll.

This is the brief's permitted generated-view exception for handoff, not a claim that the skipped product shards ran or that the whole clause is DONE. The candidate can proceed to guarded regeneration and validation. Publication scanning was not run in cloud, and no zero-findings receipt is claimed. No selected-point blocker remains; wider mutation coverage remains explicitly held and unproved. The full plan and actual non-secret results and receipts are published separately from the product branch.
