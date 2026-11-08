# sd-slate-c-f219 — required reading for native pages

Candidate: `13f63a0124fc905fea81723b675b68405e1e661f` on `cloud/sd-slate-c-f219`, repository `just-every/run-slate`.

The page requirement and acceptance point 1 are implemented and pass local native and browser proof on this exact committed head. The complete clause remains PARTIAL because the brief explicitly holds the CARD-001 card kind and external delivery prerequisites. No Status, Gap or Evidence cell changed. Contract counts remain 58 DONE, 239 PARTIAL and 41 MISSING; expanded registrations remain 211 with no unresolved registrations. No existing assertion was removed or narrowed. No PR is needed: the existing Verify workflow accepts the named cloud branch directly.

The first two product saves were pushed at `0cfd38fd` and `404f4bd4`. The final candidate was pushed successfully on guard attempt 4 after three transient authentication rejections and launcher refreshes. GitHub's API initially returned HTTP 401 and recovered on its second attempt. Exact-head push Verify `42518087681` completed with only the permitted generated-view freshness failure: app job `128845444310` reports `ACCEPTANCE.md: generated content differs; run contract-docs write.` Aggregate job `128845622769` fails solely because app failed; other dependent jobs skipped. Both failed-job logs were read once. No product assertion failed. Generated views were not committed or repaired, and Verify was not rerun. The candidate is READY for guarded regeneration and landing under the supplied exception; no actual green CI, main landing or release is claimed. Terminal transport results are recorded in `TRANSPORT.json`, `push.log` and the exact remote-head receipt.

## Implementation and plan results

The complete execution plan is `PLAN.md`. Its CARD-003 row was worked; lane plan files were not edited in this cloud. Historical plan entries and other clauses remain unchanged.

The new focused feature stores assignments and explicit acknowledgments, with a new additive core migration. An active WORK-008 workspace owner sends through the page action, chooses a group and reminder interval, sees excluded members, and gives each eligible active group member exactly one inbox item, including the sender if they are in the group. Sending uses current page access and the ACL epoch at commit. Ordinary members cannot send.

Each reader explicitly acknowledges in their inbox. The retained record carries member and timestamp, and the control still shows acknowledgment after reload. A deterministic outbox identity and atomic acknowledgment guard send one reminder to each pending reader after the selected interval. Repeated and concurrent scheduled runs create no duplicate; current page access and active membership are rechecked. Cold scheduled workers register the same notification visibility rules without relying on an earlier HTTP request.

Reports expose acknowledged, pending and reminded state, plus excluded members, only to the sender and active workspace owners with page access. No reading time, scroll depth or view measurements are stored in these records or returned by these reports. Send and acknowledgment are recorded in activity under the same private access resolver. The sender can still open their report after an ordinary role change while they retain page access. Required-reading events are inbox-only; unsupported chat configuration is refused rather than silently implying a provider delivery.

Complete workspace export and actual restore preserve the assignment and acknowledgment facts; restored assignments cancel future reminders. Member erasure removes assignment and acknowledgment rows, scrubs outbox recipient references and invalidates only affected captured receipts. Replaying an erased assignment receipt cannot recreate its data. Existing credentials, generated contract views, Base pin, homepage and workflow definitions were retained.

## Frozen outcome rubric and actual proof

Native proof is the existing registration `tests/profile/profile.worker.test.ts#FLAG-001 — core wiki public doors retain native content while flagship routes and queued work require opt-in`, which invokes `tests/profile/required-reading-journey.ts` from its existing case list. Browser proof is `tests/qualification/ui-convergence/journeys.test.mjs#real core-wiki and touch-member journeys at 1440px` and its existing 390px registration; both call the focused required-reading helper at line 109. The focused helper ran directly against the emitted Worker at both widths on the candidate, as recorded in `browser.log`; no new CI registration or workflow was added.

| Item | Outcome | Exact proof and result |
| --- | --- | --- |
| R1 — page send by owner, unchanged ordinary-member refusal | MET locally | Native helper lines 20–31 creates populated content, shares it, creates the group, refuses a member with unchanged counts, sends and replays one receipt. Browser helper lines 17–30 uses the page action and native dialog. |
| R2 — one inbox item for each active reader; excluded members disclosed without notices | MET locally | Native lines 28–34: five eligible recipients each get one initial item, excluded recipient gets zero. Browser lines 23–24 and 35–37 show the preview and actual inbox items; lines 55–60 independently inspect pending and excluded inboxes. |
| R3 — explicit acknowledgments retain member and time after reload | MET locally | Native lines 35–39 compare exact member, timestamp and replay receipt. Browser lines 34–43 click both native acknowledgment controls and reload both inboxes. |
| R4 — controlled interval, exactly one reminder under replay and racing scheduled runs, none for acknowledged or revoked readers | MET locally | Native lines 49–63 run before the interval, revoke access, advance the controlled clock to the real due timestamp, race two scheduled invocations, replay a third, and inspect exact reminder counts. Browser lines 51–60 exercise emitted cron replay using stored due state and actual inbox projections. |
| R5 — sender and owner reports alone, exact states, no passive reading data | MET locally | Native lines 44–47 and 64–66 refuse a member and compare sender and second-owner reports. Browser lines 46–72 refuse member report and menu, then reload and capture sender and second-owner reports with two acknowledged members and one reminded reader. |
| R6 — private send and acknowledgment activity | MET locally | Native lines 47 and 67–68: ordinary reader sees no acknowledgment activity; sender sees exactly two attributed acknowledgment entries and one send. Browser line 74 reconciles both acknowledgment entries. |
| R7 — complete export and genuine restore readback with inert future reminders | MET locally | Native lines 69–84 export through the public route, download and decode the actual ZIP, inspect populated reading tables, restore into a fresh bootstrap through the public route, and compare report facts. A later scheduled run retains exactly one historical reminder. |
| R8 — member erasure and captured replay | MET locally | Native lines 41–42 refuse a revoked session with unchanged counts; lines 53–59 refuse revoked page access, erase a member, prove their assignment row absent and replay the old send without resurrection. Lines 75 and 85 prove erased membership does not return through the archive or captured session. |
| R9 — native desktop and phone controls and reports | MET locally | Exact-head `browser.log` records 1440 and 390 passes. Fourteen selected screenshots show send preview, both persisted acknowledgments, member refusal, sender report and second-owner report. |
| R10 — card sending and other delivery channels | HELD as briefed | CARD-001's card kind is absent and expressly omitted by this assignment. NOTIF-005 and NOTIF-006 retain other delivery obligations. ADMIN-007 and shared company-policy prerequisites remain authoritative. No such delivery or release is claimed. |

Acceptance sentence 1 is reached by R1–R5 and R9: the browser sends a populated page, two members acknowledge, exactly one remaining reader is reminded once, and the sender's reloaded report lists those states with no reading-time fields. The native routes additionally prove refusal, replay, erasure and actual restore. Push Verify event `push`, run `42518087681`, concluded `failure` solely at the expected generated-view check. Test shards skipped, so their CI proof remains pending the guarded lander's regenerated commit; local exact-head native and browser proof passed.

## DONE-RIDERS, one row each

| Row | Result | Evidence or boundary |
| --- | --- | --- |
| 1 | PASS locally; CI pending | R1–R9 cover the page outcome through populated public doors. The whole clause is not claimed DONE; R10 is held. |
| 2 | PASS | R1, R2, R5, R7 and R8 run allowed and refused native operations and compare durable state; lists are populated and expected memberships are explicit. |
| 3 | PENDING guarded regeneration | Both helpers are loaded by existing Verify registrations. Exact-head push run `42518087681` failed only generated ACCEPTANCE.md freshness and skipped dependent test shards. The supplied exception permits READY, but no green test-run proof or DONE count is inferred. |
| 4 | PASS locally | Both native and browser logs start with the full candidate SHA. Relevant code and test bytes are unchanged after those runs. |
| 5 | INSPECTED | The receiving clause names WORK-008's owner authority, native current-access checks, erasure and archive duties in its requirement text. No new Base completion or provider duty is claimed. |
| 6 | PASS mechanically; lander bookkeeping pending | Generator write and check passed; generated views were restored from main and not committed. Source lock and integration checks pass. Status, Gap, Evidence and counts are unchanged. |
| 7 | PASS | The original requirement and sole acceptance sentence are intact. A clause-only paragraph records the adopted semantic and prerequisites; no acceptance point was added, removed or rewritten. |
| 8 | PASS | R1, R5 and R8 exercise owner authority, unchanged member refusal, private report and activity boundaries, current revocation and erased-session refusal. |
| 9 | PASS boundary | Only native inbox delivery is claimed. No provider, legal, retention-policy or live-account result is inferred. |
| 10 | DEFAULT retained, no DONE count | The brief explicitly adopts WORK-008 workspace-owner sending and ordinary-member refusal. No RL entry in the supplied Slate ruling file governs CARD-003; no broader delegation is invented. |
| 11 | PENDING | Candidate does not equal main. Regenerated branch CI, publication scan and Run site are guarded-lander duties; no landing receipt exists. |

## Pre-READY self-check

1. Native and browser journeys reach every page behavior named by this assignment, with real populated records and explicit unsafe refusals. Exact-SHA Verify `42518087681` failed only the permitted generated-view check; no DONE or actual green claim is made.
2. No existing assertion or registration was removed, weakened or placed behind a new width condition. Registration counts remain 211 before and after.
3. Current session and page authority, member erasure, captured replay and archive restoration are exercised in the native journey. R8 refuses revoked sessions and erased people and compares unchanged state.
4. Screens use existing Slate components and 14px or larger everyday text. The shared modal's icon-only close button retains its focus and hover tooltip. No rounded control has a one-sided border. Existing page actions contain the new send action; no new top-level or Settings bucket was invented.
5. Source lock and integration checks pass; no added email-shaped literal was found in the product diff. Publication scan, exact-candidate Verify, main equality and Run site remain unestablished for this candidate and must not be inferred from local proof.

MECHANICAL lock=pnpm source:lock and pnpm source:check exit=0; views=node src/base/runtime/contract-docs.mjs write and check, then restored generated views from origin/main exit=0; ledger=python3 /tmp/slate-migration-ledger.py exit=0

The migration-ledger probe compares the native migrated D1 ledger with all 60 committed SQL files and checks foreign keys: complete=true, applied=60, expected=60, foreignKeyViolations=0. The native archive journey independently restores the new records with the complete schema. No standalone repository ledger command is documented; the one-off probe and receipt are included explicitly.

Publication scan: commit=13f63a0124fc905fea81723b675b68405e1e661f complete=false historyScanned=false findings=unestablished. The cloud branch does not require a local scan. The guarded Mac lander must run its complete full-history scan and independently obtain zero findings before landing.

Main observed at `6a6232f31641de9e5935ed1899a080aee6bb23ec`: push Verify `42505283306` success and Run site `42505283443` success. Scheduled Verify `42505405529` failed; it is not a failed main-push Verify and was not repaired or rerun. Main was fetched before the candidate; merging main reported already up to date. No main or default branch was pushed. The final candidate differs from main; main equality and candidate Run site are not claimed.

The full local build, targeted native registration, focused responsive browser journey, typecheck, first-party check, structural contract check, contract generation and source integrity passed. Early local browser harness errors (missing origin, implicit-label selector and a locator matching an access-grant notice) and a signout helper incorrectly setting JSON content type were corrected without removing business assertions. Final exact-head runs pass. No CI repair loop was started.

## Probes and claim

PROBE CARD-003 1: native page action with a populated page and four-member group -> three initial reader notices, excluded member named without notice, two explicit persisted acknowledgments and exactly one reminder after cron replay; sender and second-owner reports show exactly those states after reload at 1440 and 390; member report and send refused.

PROBE CARD-003 authority and data: native owner send and private report routes, revoked session and page grant, member erasure, captured send replay, actual exported ZIP and fresh native restore -> unsafe actions refused unchanged, erased row absent, one original assignment retained, acknowledgment facts restored, future reminders cancelled.

CLAIM CARD-003 PARTIAL points=1 tests=tests/qualification/ui-convergence/journeys.test.mjs#real core-wiki and touch-member journeys at 1440px; tests/qualification/ui-convergence/journeys.test.mjs#real core-wiki and touch-member journeys at 390px; tests/profile/profile.worker.test.ts#FLAG-001 — core wiki public doors retain native content while flagship routes and queued work require opt-in
DEFAULT CARD-003: The supplied brief's adopted WORK-008 workspace-owner send authority is implemented; ordinary members are refused unchanged, and reports require sender or workspace-owner authority plus current page access.
GAP CARD-003: CARD-001 card sending and NOTIF-005 and NOTIF-006 external delivery remain held as briefed; ADMIN-007 and company-policy prerequisites remain authoritative. The exact candidate is pushed; Verify failed only expected generated-view freshness. Guarded regeneration, full CI, scanning and landing remain pending.

## Terminal CI and custody

Product branch and remote-head receipt match `13f63a0124fc905fea81723b675b68405e1e661f`. Verify: https://github.com/just-every/run-slate/actions/runs/42518087681 . Observed event=push, status=completed, conclusion=failure; the only primary failure is generated ACCEPTANCE.md freshness. Full archive log reads used exactly one command per failed job; copied relevant logs omit job environment dumps. GitHub CLI invocations used: main discovery, candidate discovery, one authentication retry, jobs, and two failed-job archives: six calls against the ten-call budget. No workflow dispatch or rerun occurred.

No product blocker remains. The held clause remainder is stated in GAP, and row 11 remains a guarded-lander duty. This cloud did not push main, run a publication scan, change the lane plan or claim a released clause.
