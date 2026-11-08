# sd-slate-c-f210 — DEC-005 review lifecycle

Candidate: 80c88e050d29bf3ad1879bb83cc943fff8129c18, branch cloud/sd-slate-c-f210, repository just-every/run-slate. This continuation validated and published the complete predecessor implementation at the exact requested source pin. No additional product edit or empty commit was necessary. All five candidate commits are fleet authored and committed, with no trailers. The final fetch and rebase found the branch current over main 67b706484e5430012d9c154c1e14090ea1e49bc2. Product push succeeded on its first attempt. No PR is required by this repository; push is the Verify entry point.

## Plan and outcome

1. Read the inline plan extract, builder rules, DONE riders and Slate rulings, and the launcher's and seed's AGENTS instructions. Restrict work to DEC-005 under the continuation instruction. Re-read the complete clause, both acceptance points and its unchanged Status gap. The initially unestablished outcomes were default-profile delivery, a cold scheduled isolate, exact owner counts across review periods, denied recipients, retained Accepted state, attributed completed review, cleared Today and supersession.
2. Start a full-history clone at the required predecessor, retain all existing product commits, install fleet identity and hooks, install the pinned pnpm toolchain, and prepare the native local runtime. The supplied toolchain selected Node 24.19.0 because it is newer than the 22.20.0 minimum it installs; CI remains pinned to Node 22.20.0. This environment difference is disclosed, not represented as exact CI reproduction.
3. Map the existing Workers registration and responsive core callers to each outcome. The predecessor already moves decision reviews into every-profile scheduled tasks, deletes the flagship-only call, registers notification eligibility for a cold cron isolate, exposes native core Today decision notices, and excludes prior review periods from the current reminder. It already includes the focused decision journey. Preserve those changes and every existing assertion.
4. Temporarily restore only the original scheduler placement, run the same default-profile registration, capture its real failure, then restore the candidate files. Before: expected one overdue notice, observed zero at profile.worker.test.ts:115, exit 1. After: the same registration passes, exit 0. This was a local regression probe, not a repair of an unrelated CI failure.
5. Build the unchanged candidate and execute the committed decisionReviewJourney through its real helpers at 1440 and 390. Both pass, using the emitted Worker's scheduled trigger and fixtureSql only to advance saved due dates. The Workers case pins its system clock. The browser also restarts the Worker before the first overdue schedule so it has served no API request that could have initialized notification rules.
6. Run typecheck, first-party checks, generator write and check, restore generated views from main, synchronize integration, regenerate the source lock last and check it. All pass. Fetch and rebase again immediately before the product push; HEAD and tracked bytes remain identical to the tested candidate. Inspect every candidate author, committer and trailer and the complete contract diff before pushing with the fleet guard.
7. Publish the actual report, receipt, logs, runner and selected decision screenshots only on the separate evidence ref. Hand the exact product SHA to the guarded lander for regenerated views, exact-SHA Verify, full-history publication scan, main equality and Run site. No main push or landing is performed here.

No other clause was started. The plan row changed only as a proposed DEC-005 completion in this report; no plan file, Status cell, Gap cell, Evidence cell or count was edited.

## Acceptance and frozen rubric

All paths below are real repository paths. P is tests/profile/profile.worker.test.ts, registration “FLAG-001 — core wiki public doors retain native content while flagship routes and queued work require opt-in”, containing the case “DEC-005 — default scheduled processing notifies the overdue owner once per review period and respects revoked access”. B is tests/qualification/ui-convergence/decision-review-journey.mjs, function decisionReviewJourney. Its committed callers are the existing “real core-wiki and touch-member journeys at 1440px” and “real core-wiki and touch-member journeys at 390px” in tests/qualification/ui-convergence/journeys.test.mjs:98. Verify invokes both through existing shard assignments 2 and 1, respectively, and invokes P through test:profile. No registration was added.

| Item | Outcome and public door | Exact-candidate proof | Result |
| --- | --- | --- | --- |
| R1, acceptance 1 | An overdue decision stays Accepted | Native decision GET, scheduledJobs and visible card. P:113–120,128; B:48–60,79–84,112–113 | PASS locally; expected generated-view CI exception below |
| R2, acceptance 2, requirement notification sentence | An overdue review notifies its owner until a completed review or supersession | Real default cron, native Inbox and Today APIs and built Today. P:109–143; B:26–65,98–133 | PASS locally |
| R3, requirement attribution sentence | Completed review retains note, actor, time and next review date, and is listed in its reviews | Real review form POST and native reviews GET. P:124–132 checks exact fixed time and operation replay. B:67–100 checks one review, named actor, request-bounded time, next date and visible history after reload | PASS locally |
| R4, declared scheduler semantics | Exactly one notice per overdue period, no notice before due, again after next due date | P:110–137, B:26–31,48–55,101–110. Actual owner counts 0,1,2 at both widths | PASS locally |
| R5, current authority duty | No notice to other members or an owner whose page access was revoked | Native sharing revocation, refused decision GET, actual notification SQL counts. P:105–118; B:33–54. Other member and revoked-owner new counts are both zero | PASS locally, allowed and refused cases executed |
| R6, review completion and supersession | Clear Review due and current Today reminder after reload; accepted snapshot preserved; supersession stops further processing | P:127–143; B:78–100,123–133. Old review-period notices do not return to Today at the second due date, B:110 | PASS locally |
| R7, native scope and inherited boundaries | Native in-app delivery only | Requirement text names NOTIF-001. Email and digest delivery remain with NOTIF-005. NOTIF-001 company-policy and run-derived decision prerequisites remain under ADMIN-007 and shared company-policy ownership | INSPECTED; no external duty released |

The acceptance sentences were not changed. The existing clause requirement records the implementation's exact native semantics without changing its two points. No new custody or authority policy was adopted, so no DEFAULT or policy ASK is required. No acceptance outcome remains unimplemented or unproved locally.

## Actual results

RECEIPT.json contains both complete non-secret browser receipt objects, the accepted decision snapshot and final decision projection, the review rows, the build fingerprint, commands and exits. The final decision is superseded, its original accepted snapshot and accepted revision remain retained, one completed review records Morgan Reader and the next date, and final Today is empty. Both widths report ownerNoticeCounts=[0,1,2], otherMemberNotices=0, revokedOwnerNewNotices=0. Desktop performs the business assertions; the phone repeats the controls and screenshots under the existing smoke contract.

PROBE DEC-005 1: native decision creation and acceptance, then repeated default cron with a passed review date -> one owner notice and Accepted with visible Review due after reload.
PROBE DEC-005 2: native completed review with note and next date, next overdue schedule, then accepted replacement -> persisted attributed review, cleared Review due and Today, one additional period notice, then superseded with empty Today and no further notices.

Local commands and actual exits:

- Same touched default-profile registration before the move: 1, expected 1 and received 0.
- Same touched registration on the candidate: 0, one passed registration, three unrelated registrations filtered out.
- Native setup with non-interactive fleet owner: 0. The first setup overlapped the temporary regression probe and was refused because tracked source changed during its build. Clean setup was rerun and passed; no test or guard was changed.
- Native build: 0; build-source.json binds it to the exact SHA and source fingerprint.
- pnpm typecheck: 0.
- pnpm exec rer check --profile first-party: 0.
- Focused browser runner with a 1200-second alarm and system Chromium with no-sandbox: 0, both widths passed, all owned browsers and servers closed.
- Generator check before write: 1, “ACCEPTANCE.md: generated content differs; run contract-docs write.”
- Generator write and subsequent check: 0 and 0. Generated views restored from main and not committed.
- pnpm integration:sync, pnpm source:lock and pnpm source:check: all 0, including final post-rebase lock and check. No migration changed.

MECHANICAL lock=pnpm source:lock and pnpm source:check exit=0; views=node src/base/runtime/contract-docs.mjs write and check exit=0; ledger=none exit=0.

## DONE riders

| Rider | Result | Evidence or remaining landing receipt |
| --- | --- | --- |
| 1 | PASS locally, CI exception applies | R1–R6 execute every acceptance outcome through native API, cron and browser; existing Verify registrations retained |
| 2 | PASS | Populated native decisions; real before-move failure and after-move pass; supported and revoked recipients both executed |
| 3 | REGISTERED, landing validation pending | Both responsive callers already loaded by Verify. Existing exact-SHA push Verify 42490432350 failed at generated-view check before shards; this is the brief's explicit allowed exception, not a green-shard claim |
| 4 | PASS | Build and browser receipts name 80c88e050d29bf3ad1879bb83cc943fff8129c18; no tracked byte changed after proof |
| 5 | INSPECTED | No new Base inheritance; existing NOTIF-001 reference remains, external notification and company-policy boundaries not released |
| 6 | PASS generation, source judgment retained | Generator write and check pass; stale views deliberately restored; all Status rows and 57 DONE, 240 PARTIAL, 41 MISSING counts unchanged |
| 7 | PASS | No acceptance sentence changed, no status row dropped, no rewrite or coverage loss |
| 8 | PASS | P:105–118 raw stored counts and B:33–54 current-access refusal; authorized reviewer completes the review and named actor is retained |
| 9 | PASS boundary | Native in-app delivery only; no provider delivery, legal or sandbox result claimed |
| 10 | PASS | No new policy default or scope narrowing |
| 11 | PENDING guarded lander | No main equality, Run site, or publication-scan result claimed; proposed DONE is accepted only on guarded landing |

## Pre-ready self-check and custody

1. The existing public-door journey performs every named user-visible outcome; the before-move probe demonstrates the default-profile delivery assertion fails with the defect. Exact-SHA CI is recorded separately and honestly below.
2. No registration or assertion was deleted, narrowed or newly placed behind a width condition in this continuation. The predecessor's added business assertions run at desktop and its phone repeats the controls, matching the brief's one-width assertion rule. Registrations remain 211.
3. Current page authority is exercised both ways. Replay of a completed review yields one stored review. No erasure, token issuance, export or restore path was changed, and no erased-person behavior is claimed beyond this scope.
4. The new Today notice reuses the existing list component and readable text, with no new icon-only control. Decision and Today screens pass serious and critical accessibility and horizontal-overflow checks at both widths. Existing screen chrome remains in the seed's own components; no homepage or brand work was performed.
5. Source lock is fresh. Publication scan status at commit 80c88e050d29bf3ad1879bb83cc943fff8129c18: NOT RUN in cloud; complete=unestablished, historyScanned=unestablished, findings=unestablished. Full history is retained in the bundle and branch. The maintained Mac lander owns the COMPLETE scan with zero findings and all exact-main gates. It must not count this claim as a landed result before those gates.

Known exact-SHA predecessor Verify: push run 42490432350, app job 128761430313 failed solely at contract-docs check; aggregate job 128761584938 failed its expected-job requirement because dependent jobs skipped. The local exact command reproduces only stale ACCEPTANCE.md, and generator write and check pass. The requested failed-job log command ran once and returned exit 0 with empty output, so no log assertion is invented. Jobs API metadata and local reproduction are preserved. No dispatch or rerun was requested. The new branch's discovery result is in candidate-ci.json.

The complete candidate product diff contains five existing commits from the predecessor, retained without rewriting published history. It adds the scheduler placement, cold-start registration, current-period reminder resolver, default Today rendering, focused browser and Workers proof, requirement semantics and inventory description. Counts before and after remain 57 DONE, 240 PARTIAL, 41 MISSING. DEC-005 remains PARTIAL in the source judgment until the lander applies the proposed DONE claim. No account, key, dependency or known real assertion failure blocks the native work.

CLAIM DEC-005 DONE points=1,2 tests=tests/profile/profile.worker.test.ts#FLAG-001 — core wiki public doors retain native content while flagship routes and queued work require opt-in; tests/qualification/ui-convergence/decision-review-journey.mjs#decisionReviewJourney


New branch Verify: push run 42495969793 completed with failure on the exact candidate. App job 128778335005 failed only “Run node src/base/runtime/contract-docs.mjs check”; aggregate job 128778486702 failed “Require the plan and every expected job”, and dependent suites skipped. This matches the reproduced stale ACCEPTANCE.md check and the explicit cloud exception. No product test failure was reported. The failed-app-job archive was requested once; its actual captured output is candidate-failed-job.log. No workflow was rerun or dispatched. CI API calls used: six of ten. No polling loop was used.
