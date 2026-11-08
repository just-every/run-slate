# sd-slate-c-f203 — DEC-002

Product candidate: `f733fff9bb25546df80ade82c7b492e5532b005f` on `cloud/sd-slate-c-f203` in just-every/run-slate. Base main: `67b706484e5430012d9c154c1e14090ea1e49bc2`. No PR is required by the existing push workflow. Product publication and evidence publication are separate.

## Plan and result

The full plan is in PLAN.md. The round closes the supplied native human decision-state gap through existing core-wiki callers and the existing profile Worker registration. No new registration, deleted assertion, narrowed assertion, workflow edit, Base update or production UI change is included. The final tree retains main's complete CONTRACT.md, every Status row, every acceptance point and both generated views. Tests and the existing journey specification carry the proof mapping.

The one product repair moves the Accepted-state requirement for preparing a replacement into commitOperation's new-operation preparation. The current appointed-owner, attached-record, page access and evidence checks still guard replays. Before the repair, retrying the original prepare request after its replacement had been accepted returned `403 DECISION_OWNER_REQUIRED`; the native scenario failed at its replay assertion, expecting 200. After the repair the original receipt returns, with no additional page, revision, receipt or activity write; new terminal-state operations still refuse. A revoked owner session returns 401 for both the replay and decision read, leaving canonical data unchanged.

The native Worker file passes all four existing registrations on the exact candidate. Its DEC-002 scenario uses a pinned clock, proposes as an edit-only non-owner, refuses that non-owner's acceptance unchanged, accepts as the appointed owner, records a review as the editor, prepares and accepts a replacement, and accepts a separate proposal with its earlier accepted decision selected. Each of the two Superseded records refuses accept, edit, review, prepare-successor and reuse as an earlier decision, with complete canonical row snapshots unchanged. Every successful request is replayed immediately and after subsequent transitions.

The browser helper uses real forms and the emitted Worker. Its response interceptor forwards the actual native response after reading it, so navigation cannot discard the receipt body; it substitutes no API result. It reloads current records and histories, reconciles exact revision kinds, actors and committed times, and filters the native Settings Activity timeline to decision. Dedicated receipt files preserve nine committed operations, two secondary supersession transitions, eleven activity entries and five unchanged terminal refusals per width. Both responsive callers remain in their existing Verify shards.

## Frozen outcome rubric

| Item | Outcome and door | Proof |
| --- | --- | --- |
| R0 | Requirement: native Proposed, Accepted and Superseded states | `decision-states-journey.mjs` lines 65–121; profile scenario lines 119–140 |
| R1 | Acceptance 1: proposal becomes accepted; both replacement doors supersede; Superseded is terminal | Browser lines 69–142; native lines 119–144; non-owner acceptance and five forbidden terminal requests preserve snapshots |
| R2 | Acceptance 2: every transition has actor, time and activity | Browser lines 143–176; native lines 145–158; eleven populated events reconcile with receipts and exact history rows |
| R3 | Acceptance 3: Proposed, Accepted and Superseded transition attribution | Browser lines 145–167; native lines 147–158; exact kinds, actors and timestamps, including both secondary supersessions |
| R4 | Request replay and current authority | Browser lines 140–162; native lines 142–165; original receipts, unchanged rows, revoked-session 401 |

The browser file above is `tests/qualification/ui-convergence/decision-states-journey.mjs`, loaded by `tests/qualification/ui-convergence/journeys.test.mjs` through both existing “real core-wiki and touch-member journeys” registrations. The native file is `tests/profile/profile.worker.test.ts`, existing case “FLAG-001 — core wiki public doors retain native content while flagship routes and queued work require opt-in”, nested scenario “DEC-002 — native decision transitions replay once and terminal refusals preserve all rows”.

## DONE-RIDERS

| Row | Result | Evidence and boundary |
| --- | --- | --- |
| 1 | Local outcomes PASS; exact-SHA Verify recorded separately | R0–R3 above cover every requirement and acceptance sentence through native forms, HTTP, history and populated activity |
| 2 | PASS | Nonempty data; both allowed and refused authority paths; unchanged canonical snapshots; native replay regression failed before the product repair |
| 3 | Existing Verify loading INSPECTED; run result recorded separately | Existing core browser callers at 390 and 1440; existing `pnpm test:profile` command in the core Verify shard; no new registration or env gate |
| 4 | Exact candidate binding | Final build metadata and dedicated responsive receipts name the candidate; relevant source and tests stay unchanged after final build |
| 5 | INSPECTED | Actor and time duties are explicit in DEC-002 acceptance 2 and 3; no new inherited Base duty is claimed |
| 6 | Mechanical PASS; Status cells retained for lander | Generator write and check pass, generated views restored from main, source check passes; no builder Status, Gap or Evidence edits |
| 7 | PASS | Acceptance text equals main, every parent Status row remains, no ID rewrite or scope carve |
| 8 | PASS | Non-owner acceptance refusal, ten terminal refusal attempts in the native scenario, both replacement doors, revoked-session replay and read refusal |
| 9 | Native boundary retained | No provider, legal, live AI or agent commitment claim |
| 10 | No new default | Existing appointed-owner policy is retained and tested; no policy ruling is invented |
| 11 | Guarded lander pending | This cloud does not push main or run the publication scanner; main equality, exact-SHA green checks, complete source scan and Run site remain landing duties |

## Pre-READY review

All named user outcomes have native public-door assertions. No existing assertion or registration is removed, narrowed, skipped or moved behind a width condition. The new assertions run at both existing responsive callers; screenshots cover the native decision cards, history and activity at both widths. No production UI code or icon-only control is added. The current authority checks remain before receipt replay; the revoked-session path is tested. No erasure behavior changes. The source lock and views pass their documented checks. No new email-shaped fixture literal or provider-shaped key is introduced.

Actual source counts remain **57 DONE, 240 PARTIAL, 41 MISSING, 338 total**, before and after. The proposed gated DEC-002 promotion would yield 58 DONE, 239 PARTIAL, 41 MISSING. Expanded registrations remain **211 → 211**; the existing ordinary count remains under the 200 cap. No new clause is released and no main count is claimed.

Plan row changed in this report: DEC-002, PARTIAL → proposed DONE for acceptance 1–3, conditional on the independent exact-SHA landing gates. Other decision clauses and the held AI-003, ADMIN-007 and company-policy prerequisites are unchanged.

## Runtime probes

PROBE DEC-002 1: Native non-owner proposal, appointed-owner acceptance and both replacement controls → two Superseded records; terminal accept, edit, review, prepare-successor and earlier-decision reuse refuse unchanged.

PROBE DEC-002 2: Native decision history, `/api/activity?kind=decision` and Settings Activity filtered to decision → nine operation receipts plus two supersessions, exactly eleven activity rows, matching actors and committed times after replay and reload.

PROBE DEC-002 3: Exact retained decision revision reads and rendered history → Proposed, Accepted and Superseded records retain the expected decision, decision-acceptance and decision-supersession kinds, actor and time; review attribution is retained too.

MECHANICAL lock=`pnpm source:lock` then `pnpm source:check` exit=0; views=`node src/base/runtime/contract-docs.mjs write` then `check` exit=0, generated files restored; ledger=none, no migration changed.

## Commands and custody

Local runtime: Node 24.19.0, pnpm 10.12.4, Chromium `/usr/bin/chromium` with `--no-sandbox`, actual HOME, isolated test storage. The supplied toolchain script retains an already newer Node; CI retains its repository pin. Setup and builds run through cloud_run. Only child processes owned by these harnesses are stopped.

The exact candidate build, four native Worker cases, typecheck, first-party check, generated views and source check are recorded in actual packet files. The complete core caller log passes both existing registrations: 390 in 737271 ms and 1440 in 573815 ms, two passed and zero failed, with no skipped case. Dedicated receipts and six screenshots per width bind both runs to the exact candidate. During development, locator adjustments were needed for labels containing select options or existing textarea content and for the separate accepted-revision link; no product assertion was weakened. One pre-final focused run overlapped a rebuild clearing its provenance file. The first complete caller run exposed the helper leaving the owner on Activity, causing the unchanged next step to time out waiting for the More button; the helper now restores its entry page. Final browser proof is serialized after the completed candidate build. No real red CI failure has been repaired or hidden.

The initial main had green exact-SHA Verify **42416085031** and Run site **42416085015** at `67b706484e5430012d9c154c1e14090ea1e49bc2`; canceled duplicate **42482646230** does not establish a failure. These are baseline results only, never candidate results.

Candidate Verify push **42487651793** completed **failure** on exact SHA `f733fff9bb25546df80ade82c7b492e5532b005f`. App job **128752980785**, core job **128753569167** and tooling job **128753569227** passed, including the DEC-002 responsive and native registrations. The failing job is **128753569213**, `verify (ui-polish-mobile)`: the unchanged “presentation paginates read-only slides; touch history, details and exports work at 1440px” case failed at `touch.close` because a page-open request returned 409 and emitted a browser console error. The aggregate verify job **128759472513** propagates that failure; contract aggregation is skipped. This is not a generated-view failure and is not green.

Before any source edit, the failed full shard command was rerun on this exact candidate in Ubuntu 24.04.4 LTS, Node 22.20.0, pnpm 10.12.4 and Playwright 1.63.0 with browser build 1243. All four public journeys, Worker shard 3 and the mobile polish suite passed: `journeys=0 worker-suite=0`, overall exit 0. The original 409 did not reproduce. The same full shard on unchanged main `67b706484e5430012d9c154c1e14090ea1e49bc2` is now being compared on that same Docker runner. No source edit or speculative CI repair has been made. CI-DIAGNOSIS.json contains the exact command, flags, failure and runtime; complete actual logs are retained. GitHub API calls used: 9 of 10. No rerun has been requested.

Publication scan: candidate `f733fff9bb25546df80ade82c7b492e5532b005f`, complete=NOT RUN IN CLOUD, historyScanned=NOT RUN IN CLOUD, findings=NOT ESTABLISHED. The guarded lander owns the full-history scan; this is no claim of zero findings.
Main equality: not landed. Candidate Run site: not run before main. Product pushes use only the named cloud branch and the fleet push guard. Evidence goes only to `refs/heads/evidence/sd-slate-c-f203`.

No external account, missing ruling or other seed dependency blocks the native DEC-002 work. Final CI and product custody are recorded separately in TERMINAL.json.

## Builder claim

CLAIM DEC-002 DONE points=1,2,3 tests=tests/qualification/ui-convergence/journeys.test.mjs#real core-wiki and touch-member journeys at 1440px; tests/qualification/ui-convergence/journeys.test.mjs#real core-wiki and touch-member journeys at 390px; tests/profile/profile.worker.test.ts#FLAG-001 — core wiki public doors retain native content while flagship routes and queued work require opt-in

This is the builder outcome claim for guarded landing, not a main status edit or release.

Local final result: both complete responsive core callers pass, all four native Worker registrations pass, every mechanical check exits 0, and the working tree remains clean. No unresolved product or local touched-test failure remains; the unrelated red CI assertion remains a landing hold pending the required comparison and triage.
