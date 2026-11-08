# sd-slate-c-f214 — AUTO-001

Repository: https://github.com/just-every/run-slate
Branch: cloud/sd-slate-c-f214
Candidate: f5de9971acc1a96db9f5cb7493b3edbc9d9a607b
Base main: 6a6232f31641de9e5935ed1899a080aee6bb23ec
PR: none; this repository runs Verify directly on cloud branches.

AUTO-001 acceptance points 1 and 2 and the complete named native rule requirement are implemented and locally proven. Claim: PARTIAL because the complete exact-SHA Verify failed on unchanged journeys. The native acceptance outcomes pass locally and in their recorded target cases, but no green full-workflow claim is made. The builder changed no Status, Gap or Evidence cell and no acceptance text. Actual counts remain 58 DONE, 239 PARTIAL, 41 MISSING across 338 rows; an accepted AUTO-001 promotion would yield 59, 238, 41. Test registrations remain 211 before and after. The complete execution plan is in PLAN.md.

## Changes and observed defects

The native journey exposed two actual defects. Native body replacement commits a `structure` event and a block text edit commits a `block` event; neither previously reached the served `blocks` trigger. Automation now translates both at the committed outbox boundary. The journey independently performs both real writes and checks their created pages and separate successful runs.

Production Inbox delivery also silently discarded native rule recipients: the agent audience resolver rejected maintenance notices without an agent record, while the existing native exception applied only in local development. Native, ungoverned maintenance notices now use the existing current page-access eligibility in every deployment. Governed agent notices retain their audience resolver. The native journey checks the actual production configured adapter, delivered notification and payload, and zero notifications for a removed recipient. The unchanged agent maintenance authority registration also passes; its tested source and test bytes are identical on this candidate. Exact development failures and repairs are recorded in defects.json.

The two unreferenced vocabulary modules requested by the brief were deleted: `src/core/features/automation/ui/types.ts` and `src/core/features/automation/ui/nouns.ts`. Their unsupported trigger names and action names no longer compete with the served vocabulary. No runtime UI change was necessary.

## Acceptance and native public-door proof

| Item | Native outcome and proof | Exact candidate result |
|---|---|---|
| Requirement sentence | `tests/profile/automation-journey.ts:41` through line 78 saves source and container rules as an ordinary member, checks name, scope, trigger, condition order, branch, action order and saving actor through native HTTP. It denies workspace scope to the member and retains an owner workspace rule. `tests/qualification/ui-convergence/automation-rule-journey.mjs:22` through line 58 saves and reopens the real RuleForm as a member. | PASS locally; Verify receipt below. |
| Acceptance 1 | `tests/profile/automation-journey.ts:88` through line 158 performs created, properties, both body mutations, publication, record creation and record update, plus genuine schedule processing. It checks exact edit-fields, create-page, create-record, move, archive, comment and configured Inbox effects, canonical operation receipts, the saving actor and activity. There is no injected automation event, job, run or effect. | PASS locally; default profile and retained structured callers both pass. |
| Acceptance 2 | `tests/profile/automation-journey.ts:115` through line 168 checks ordered conditions and actions, relation fan-out to two real records on an update and on a schedule, condition-unmet runs with no receipts or effects, deduplication under repeated real drains, a fully advanced content cursor and public activity actor readback. `tests/qualification/ui-convergence/automation-rule-journey.mjs:61` through line 86 checks the saved form's committed effects, refusal case, public activity and visible run log. | PASS locally; browser proof at 1440 and 390. |

The existing default-profile registration is `tests/profile/profile.worker.test.ts` — “FLAG-001 — core wiki public doors retain native content while flagship routes and queued work require opt-in”. Its case list now invokes automationJourney. All four tests in that file pass on the candidate. The same native helper also runs inside the retained `tests/flagship/structured/automation-repairs.test.ts` — “automation admission, resumed effects and schedules preserve current scope and exactly-once recovery”. That registration and the unchanged `tests/flagship/structured/structured.test.ts` — “structured records, computation, readers, templates, automation, policies and views retain durable semantics” both pass.

The complete retained desktop registration also passed on this exact candidate in 295.345 seconds, including the genuine process kill and lease recovery, new form helper and all original run-log checks. Its command and exit are in complete-caller-receipt.json; the unchanged recovery journey's actual durable receipt is retained-recovery-receipt.json. This preserves supporting evidence and does not promote held AUTO-008.

The new focused browser helper is called by the existing automationRunLogJourney, without another registration. Its maintained Verify callers are `tests/qualification/ui-convergence/journeys.test.mjs` — “spreadsheet tables merge, sort and round-trip through edited database records at 1440px” through touchDatabaseToolsJourney, and “real core-wiki and touch-member journeys at 390px”. The focused helper was run against this exact committed emitted artifact at both widths. It returned actual successful run receipts with three confirmed actions and three correctly attributed public activity entries at each width. The complete actual responses are in runtime-receipts.json. Browser proof shows the form, reopened rule and saved outcome at each width; screenshots and accessibility results are under screens. All six captures have no serious or critical accessibility findings and no horizontal overflow.

PROBE AUTO-001 1: native member POST to the automation route plus committed page and record mutations, automation maintenance and discovery delivery -> every named trigger and action, two body-write events, exact canonical effects, configured Inbox delivery and saving actor on runs, operations and activity.
PROBE AUTO-001 2: ordered native definitions with a relation branch, record update and due schedule -> two exact related targets, no effects for the unmet condition, stored action order, one effect per action under repeated drains and a consumed content cursor.

## DONE riders

| Rider | Result and evidence |
|---|---|
| 1 | PASS local outcomes: the three acceptance rows above cover the complete native requirement through served routes and RuleForm. Exact-SHA Verify state is recorded below. |
| 2 | PASS: real populated records and comments, exact independently named effects, the second condition failing while the first matches, removed-recipient refusal, member workspace-scope refusal and duplicate-safe real drains; native helper lines 65, 119, 132, 135 and 161. |
| 3 | FAIL: full exact-SHA Verify is red on unchanged journeys, as detailed below. Existing Verify registrations load the default-profile case, structured regressions and both browser callers. The exact push Verify event and conclusion are recorded below; no new registration, env flag or nightly-only proof was introduced. |
| 4 | PASS: workers-receipt.json, checks-receipt.json, browser-receipt.json and build-receipt.json bind local results to f5de9971acc1a96db9f5cb7493b3edbc9d9a607b. The extra agent-authority test ran on e176af61; its unchanged relevant source and test bytes are verified in notification-authority-receipt.json. |
| 5 | INSPECTED: no inherited Base duty or receiving clause was added or rewritten. Native authority obligations remain with AUTO-002; this round proves the actor required by AUTO-001. |
| 6 | PASS mechanical: contract write wrote zero documents, check passed, generated views were restored from main, and no contract judgment, summary or generated view was committed. The guarded lander owns any subsequent judgment and generated Evidence update. |
| 7 | PASS: no acceptance sentence, ID, standard shape or coverage mapping changed; all 338 parent status rows remain byte-identical. |
| 8 | PASS applicable authority: native ordinary-member saves, member refusal for workspace rules, current actor on all effects, removed-recipient refusal and retained current-scope and revoked-access regressions. Supporting structured tests remain intact and pass. |
| 9 | PASS boundary: only native configured Inbox delivery is claimed. No external chat, webhook, mailbox, provider, legal or account result is claimed. |
| 10 | PASS: no policy default was adopted. This repairs the already-required native notification path; governed agent audience checks remain and their retained authority journey passes. |
| 11 | PENDING GUARDED LANDING: main is still the base SHA. No local main update, publication scan or Run site on the candidate is claimed. The fleet must scan the full history, judge, land and verify Run site before counting DONE. |

## Preserved inherited and queued duties

| Duty | Result |
|---|---|
| AUTO-002 | Retained PARTIAL. Existing action authority, scope, revoked access, private definitions and resumed-action checks are preserved and pass; no scope release or promotion. |
| AUTO-004 | Retained PARTIAL. Existing chain, rate, self-trigger and durable throttling assertions remain in the unchanged structured registration and pass. |
| AUTO-005 | Retained PARTIAL. Existing scope and profile obligations remain, including source form restrictions and retained scope and history. No full profile claim is made here. |
| AUTO-008 | Held PARTIAL. Existing process-kill, recovery and accountable follow-through obligations are preserved. No release of the held remainder or other job families is claimed. |
| AUTO-006 and AUTO-007 | External actions and connected-tool triggers remain under their existing ADMIN-007 and shared company-policy gates. |

## Checks and publication custody

All touched checks pass on Node 22.20.0 with the pinned pnpm 10.12.4: the four profile tests; two structured registrations; both focused browser widths; typecheck; first-party; contract structure; source-lock freshness; and contract generation. The build is the exact committed emitted artifact. Actual commands, exit codes and durations are in the receipt files. The agent-notice authority registration passes on byte-identical relevant code. There is no migration change, so no migration-ledger command is applicable.

MECHANICAL lock=pnpm source:lock then pnpm source:check exit=0; views=node src/base/runtime/contract-docs.mjs write then check exit=0; ledger=none exit=0.

Pre-READY self-check: named native outcomes have failing-path and canonical-effect assertions; no existing assertion or registration was removed, narrowed, skipped or moved behind a width condition. Applicable authority and replay paths pass. Existing erasure machinery was not changed and no broader erasure claim is made. The touched proof screens retain the existing components, 13px-or-larger text and existing icon tooltips; the dialog close control retains its tooltip. No new UI or homepage design was introduced. No new email-shaped fixture literal or provider-shaped key was introduced. The source lock is fresh. Independent publication and landing gates remain mandatory.

Product history contains three new fleet-authored commits, with two published saves carrying skip-CI messages and a final substantive candidate. Main was fetched and merged before the final push; it was already current. Every candidate author, committer and trailer was checked before each push; no co-author trailer was added. All product pushes used the prescribed cloud branch and push guard. No main push, force push, PR or deployment occurred.

Publication scan: commit=f5de9971acc1a96db9f5cb7493b3edbc9d9a607b complete=NOT_RUN historyScanned=NOT_RUN findings=UNESTABLISHED. This cloud run delegates the required publication scan to the guarded Mac lander as instructed; a local source lock or bundle is not a scan receipt.

Main equality: pending; main=6a6232f31641de9e5935ed1899a080aee6bb23ec, candidate=f5de9971acc1a96db9f5cb7493b3edbc9d9a607b. The base's successful push Verify is 42505283306 and Run site is 42505283443. Scheduled Verify 42505405529 failed on that base; this is recorded as the existing scheduled run, not a red push or a new candidate failure.

Exact push Verify **42510370271** completed with **failure** on this candidate. Native default-profile and phone proof ran in successful core job **128822629990**. The target desktop spreadsheet registration also passed within tooling job **128822630052**. This is outcome proof, not a green full-workflow result.

The remaining red jobs concern unchanged journeys. Mobile job **128822629995** failed “native ordinary page full authority retains inventories and refuses revoked captures at 1440px” with `test timed out after 240000ms`. Tooling job **128822630052** failed “real core-wiki and touch-member journeys at 1440px”, at BLOCK-001 with `page.waitForLoadState: Timeout 30000ms exceeded.` Both complete failed-job logs were read once through the authorized archive command and are included verbatim. No generated-view exception applies.

Before changing any source, both exact failed shard commands were run on this committed candidate and on base main in Ubuntu 24.04 with Node 22.20.0, the pinned pnpm and Playwright Chromium build 1243. The official container image and immutable digest, complete shard arguments, real exits, timings and full logs are in the four reproduction receipts. The mobile shard failed with the same 240-second sharing timeout on both candidate and main (exit 1). The tooling shard passed completely on candidate and main (exit 0), so its original page-load timeout did not reproduce. The relevant journeys and shard scripts are byte-identical between main and candidate; ci-analysis.json records the checked paths. No test deadline was relaxed and no speculative product repair was made. Zero CI repair rounds or reruns were dispatched.

The ten-call GitHub budget is exhausted, including one log read per failed job; no additional poll or rerun was attempted. This candidate remains branch-only and BLOCKED on a healthy complete exact-SHA Verify. The lane needs the existing sharing timing flake addressed and the non-reproduced tooling timeout triaged or rerun under its flake policy. Full workflow success, publication scan, main equality and Run site are unestablished. These are the remaining proof and landing gates, not missing native automation outcomes.

VERIFY_REPRODUCED is recorded in verify-reproduced.json: the real candidate mobile command exited 1 on the same named test with the same 240000ms timeout. Its main comparison also exited 1. The tooling failure is explicitly UNREPRODUCED.


Plan result: the AUTO-001 target row remains PARTIAL; native points 1 and 2 are proven, but a green complete exact-SHA Verify is missing; no lane plan file was edited in the cloud. No other target, hold, claim or actual count changed. The full plan and selected actual reports are published on the task's separate evidence ref, never on the product branch.

CLAIM AUTO-001 PARTIAL points=1,2 tests=tests/profile/profile.worker.test.ts#FLAG-001 — core wiki public doors retain native content while flagship routes and queued work require opt-in; tests/qualification/ui-convergence/journeys.test.mjs#spreadsheet tables merge, sort and round-trip through edited database records at 1440px; tests/qualification/ui-convergence/journeys.test.mjs#real core-wiki and touch-member journeys at 390px

GAP AUTO-001: Native points 1 and 2 pass; full exact-SHA Verify 42510370271 is red on an unchanged sharing timeout that also fails on main and an unchanged page-load timeout that did not reproduce. A healthy complete Verify is required before DONE or READY.

Recovery: candidate.bundle is retained outside the clone. Its verified hash and path are in bundle-receipt.json; this is recovery data, not a scan, push or landing receipt.
