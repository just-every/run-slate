# DEC-003 completion candidate

Repository: just-every/run-slate
Branch: cloud/sd-slate-c-f206
Candidate: e7bda0b09948bf60c6caa3140080a0a9253ab610
Source main: 67b706484e5430012d9c154c1e14090ea1e49bc2

DEC-003 is proposed DONE, acceptance 1 and 2, subject to the independent exact-candidate gate and guarded landing. No product landing or released count is claimed here. Full implementation plan: PLAN.md.

## Changes and demonstrated defect

At entry, both acceptance points lacked a loaded complete default-profile journey. The missing proof covered unchanged complete accepted snapshots, current warnings, native supersession and responsive accessible lineage.

Both decision lineage directions previously linked to a page's flagship-only Ask panel. They now link to the exact other record in the default decision workspace.

The native completion scenario also reproduced a second acceptance-breaking defect: preparing a replacement after a source edit returned 409 STALE_EVIDENCE, with message "Evidence changed; regenerate against the current revision." The preparation guard now authorizes retained historical citations without demanding currency. It still checks current readers and exact retained evidence. Acceptance keeps its live disclosure check and transaction-bound current-citation guards. The native journey explicitly attempts stale replacement acceptance, receives 409 STALE_EVIDENCE and checks unchanged previous and proposed records before selecting current citations and accepting.

No changes were needed in records.ts, transitions.ts, evidence-guards.ts or PageDecisions.tsx. The necessary demonstrated preparation defect is fixed in successor.ts. No homepage, logo, Base pin, workflow, migration or acceptance sentence changed. CONTRACT.md describes the implemented semantics only; no Status, Gap or Evidence cell changed, and no generated view is committed.

## Runtime rubric and acceptance proof

The native case is inside the existing registration `tests/profile/profile.worker.test.ts` — "FLAG-001 — core wiki public doors retain native content while flagship routes and queued work require opt-in", internal scenario "DEC-003 — accepted snapshots survive source edits and owner-authorized supersession in core wiki" at lines 86–151.

The focused browser helper `tests/qualification/ui-convergence/decision-immutability-journey.mjs` — decisionImmutabilityJourney is loaded by both existing "real core-wiki and touch-member journeys at 390px" and "real core-wiki and touch-member journeys at 1440px" registrations in journeys.test.mjs. The unchanged push Verify registrations load those callers on UI partitions 1 and 2. Native profile tests are loaded by the existing core suite. No registration was added.

| Rubric item | Door and visible outcome | Exact candidate proof |
| --- | --- | --- |
| R1, requirement and acceptance 2: acceptance freezes content and exact citations | Native create and accept; compare question, both options, outcome, rationale and both cited revision identifiers to the authored proposal and accepted receipt | Native lines 93–108; browser lines 24–72; receipts include accepted snapshot and acceptance revision |
| R2, acceptance 1 and 2: later source edits warn without rewriting accepted content | A second member edits a cited page title through its real editor; API content and accepted snapshot string remain equal, card alerts, log says Evidence changed, and exact accepted revision and reload retain original fields and cited identifiers | Native lines 109–114; browser lines 73–88, 110–116 and 197 |
| R3, immutable direct edit | Attempt an authorized direct rewrite; 409 IMMUTABLE_DECISION; complete record, history and activity unchanged | Native lines 115–119; browser lines 90–109 |
| R4, acceptance 1 and 2: supersession and both directions | Native Prepare a replacement decision control; edit proposal through native fields, explicitly replace old citations with both current revisions, accept; previous snapshot remains exact, new record points back, and each visible lineage link opens the exact other record | Native lines 122–145; browser lines 118–179 |
| R5, current authority and denied disclosure | Restrict only replacement page; reader retains original access, replacement GET is 404 with no question; original UI shows unavailable, no replacement question and no link, including reload | Native lines 146–151; browser lines 183–197 |
| R6, existing Verify loading | Focused native case and helper are folded into existing registrations; both responsive cases remain | journeys.test.mjs import and step; registration count 211 before and after, sites 204 before and after |

Accepted snapshot comparisons cover the entire content object and byte-identical accepted_snapshot_json, including accepted timestamps and actor identifiers. Supersession changes state and lineage metadata while the acceptance content and accepted revision stay unchanged. Citation currency is recomputed on reads. The supporting revisions contain actual native-authored paragraph content; no application response or authoritative content is faked. The preparation receipt is captured from the genuine Worker before its response is delivered unchanged to a navigating browser.

The original source edit, acceptance, preparation and supersession receipts, full accepted, stale, earlier and replacement projections, direct-write refusal and denied-read bodies are retained for each width. Screens cover the stale accepted card, replacement with earlier link, earlier record with replacement link, and unavailable replacement. Each runs the existing accessibility and horizontal-overflow check.

## DONE-RIDERS

| Row | Result | Evidence or boundary |
| --- | --- | --- |
| 1 | Local PASS; exact Verify pending external gate | R1–R5 exercise every named outcome through native APIs and default built routes; acceptance sentences are unchanged |
| 2 | PASS | Populated two-source decision, whole snapshots, real second-member source edit, unchanged immutable refusal and stale-acceptance refusal, plus inaccessible replacement |
| 3 | Existing registrations INSPECTED; exact Verify recorded separately | Both responsive callers and native case are in existing push Verify paths, with no flag or new registration; local candidate execution recorded in test receipts |
| 4 | PASS | Exact candidate build metadata and local checks; final browser receipt metadata binds to candidate build |
| 5 | INSPECTED | Current page authority remains enforced by the existing decision read and evidence guards; revision resolution reuses REV-005. No new Base duty or held flagship capability is claimed |
| 6 | PASS locally; main cells retained | Generator write and check exit 0, then restore main's ACCEPTANCE.md and docs/CLAIMS.md. Main's Status, Gap, Evidence and counts remain unchanged for the lander |
| 7 | PASS | No acceptance point, ID, scope rider or obligation removed or changed |
| 8 | PASS | Non-owner preparation refused unchanged; stale acceptance refused unchanged; direct accepted editing refused unchanged; replacement read denied with no question |
| 9 | NOT APPLICABLE | Native wiki behavior only; no provider, legal, live account or distribution acceptance claimed |
| 10 | NOT APPLICABLE | No new custody or authority default adopted. Existing appointed-owner acceptance and preparation authority remains |
| 11 | PENDING GUARDED LANDER | Main equality, complete full-history publication scan, exact green Verify after generated views and Run site remain landing duties |

## Pre-ready self-check

1. Each target outcome is performed and inspected. Main's old lineage URL would fail the exact-record navigation checks; its stale preparation guard produced the recorded 409 failure. Exact Verify is reported separately without substituting another SHA.
2. No existing assertion or registration was removed, skipped, narrowed or put behind a width condition. Initial new-test failures were locator ambiguity, Chromium response-body lifetime, a volatile pagination cursor and failure to restore the caller route. The helper now compares all durable activity entries across pages and restores its entry route. Those harness corrections remove no outcome or existing assertion.
3. No credentials, erasure or archive replay implementation changed. Current reader refusal and duplicate-safe native preparation are exercised. Existing broader authority and erasure tests remain in Verify; no held flagship or agent authority claim is added.
4. Existing components and typography are preserved. Decision controls are text controls, and lineage uses ordinary text links. Existing shell icon controls retain their shared tooltips. The changed decision screens are inspected at 1440 and 390 with accessibility and overflow checks; no configuration screen is added.
5. Source lock and generated-view regeneration checks pass locally. Publication scan, main equality and Run site are unestablished in this cloud; no claim of a complete scan or main landing is made.

## Mechanical and inventory results

MECHANICAL lock=pnpm source:lock and pnpm source:check exit=0; views=node src/base/runtime/contract-docs.mjs write and check, then restore main generated files exit=0; ledger=none exit=0.

Contract totals are unchanged: 57 DONE, 240 PARTIAL, 41 MISSING, total 338. A guarded DEC-003 promotion alone would yield 58 DONE, 239 PARTIAL, 41 MISSING; that promotion is not committed by this builder. Expanded test registrations and sites are unchanged at 211 and 204; the recorded ordinary inventory remains 191, below the unchanged 200 cap. No test was deleted or added as a separate registration.

Plan row addressed: DEC-003 only. No held clause or FLAGSHIP, ADMIN-007, run-derived decision, agent commitment or impact-rehearsal scope is released. There is no new policy DEFAULT or remaining native acceptance GAP.

Local results, terminal push custody and exact-SHA CI are appended below after completion. Complete actual reports and receipts are published only to the separate evidence ref; evidence publication is not product acceptance or landing.



## Completed local results

The complete existing responsive callers passed on source 1e54a11f6e9c7e2a07760ef49fa1fd405cee9ffe: 390px in 726.675 seconds and 1440px in 565.876 seconds, total command exit 0, two passed and none failed or skipped. core-callers.json contains the actual command, durations, output digest and original build provenance.

Final metadata review found the newly added native-profile identity could not appear in the separate root Workers report. The root registry now retains exactly main's identities and clause scopes, while its existing DEC-003 reason and clause inventory describe the independently loaded native and browser proof. No registration or workflow changed. The final helper also includes build provenance directly in its receipts and waits for page history reads to settle before changing access, preserving the authorization epoch guard and the no-console-error proof.

No production byte, native test byte, caller registration or acceptance assertion differs from the complete passing caller source. proof-equivalence.json records that comparison. The final helper was then executed again at 1440 and 390 on this exact candidate, through genuine native routes and controls, including every acceptance assertion and explicit no-console-error checks. Both passed; its eight retained screenshots and both complete native receipt files carry this exact candidate's build provenance. This is fresh final-candidate runtime proof; the earlier full caller run is not mislabeled as a run of the final commit.

The exact final candidate also passed all four native profile tests, typecheck, first-party validation and source-lock checks. local-checks.json and mechanical.json retain actual commands and exits. No broad suite, CI dispatch or provider journey was added.


## Exact final CI and custody

Final product push succeeded through the fleet cloud guard on its first attempt: branch cloud/sd-slate-c-f206, head e7bda0b09948bf60c6caa3140080a0a9253ab610. Every candidate author and committer is the fleet identity, with no co-author trailers. Full history is present. The source main remains 67b706484e5430012d9c154c1e14090ea1e49bc2; remote-refs.txt verifies that main is unchanged and the cloud branch names the final candidate. No PR was required because this branch starts Verify directly.

Exact-head Verify Slate push run 42489131094 completed with failure only on generated-view freshness. App job 128757455519 ran `node src/base/runtime/contract-docs.mjs check` and returned exit 1 with "ACCEPTANCE.md: generated content differs; run contract-docs write." Aggregate job 128757588009 then failed its dependency check because APP failed and SHARDS and CONTRACT were skipped. Both failed-job archives were read exactly once, successfully. No real product assertion failed in CI, and skipped shards are not claimed as CI runtime proof. No CI repair, rerun or dispatch occurred. The task explicitly permits this generated-view-only outcome for READY; the guarded lander must regenerate the views and rerun the exact resulting tree's gates before landing.

The prior source candidate's Verify 42487261065 had the same permitted generated-view-only failure. All ten task GitHub calls are accounted for: baseline main discovery; two prior-candidate discoveries spaced at least 300 seconds; prior completed-run jobs and two log archives; final candidate discovery after its startup window; final jobs and two log archives. No further API calls are made. ci-receipt.json retains actual commands, run and job IDs, exits, conclusions and complete relevant error text. Runner environment sections and unrelated request archives are excluded from the selected evidence.

Baseline Verify 42416085031 and Run site 42416085015 were success on source main 67b706484e5430012d9c154c1e14090ea1e49bc2. They are not substituted for final-candidate proof. No main equality, final-candidate Run site or landing is claimed.

Publication scan: commit=e7bda0b09948bf60c6caa3140080a0a9253ab610; complete=unestablished; historyScanned=unestablished; findings=unestablished. Full-history scanning and landing remain the guarded lander's duties. There is no account or native-product blocker and no remaining native DEC-003 acceptance point. Counts remain unchanged pending the gate. The clone is to be removed after successful separate evidence publication; this packet and its receipts remain outside it.

CLAIM DEC-003 DONE points=1,2 tests=tests/profile/profile.worker.test.ts#FLAG-001 — core wiki public doors retain native content while flagship routes and queued work require opt-in; tests/qualification/ui-convergence/journeys.test.mjs#real core-wiki and touch-member journeys at 1440px; tests/qualification/ui-convergence/journeys.test.mjs#real core-wiki and touch-member journeys at 390px

PROBE DEC-003 1: default native decision workspace -> stale card and log warnings, unchanged snapshots, immutable refusal, current replacement acceptance, exact two-way lineage, and unavailable replacement with no question at 1440 and 390.
PROBE DEC-003 2: native acceptance of two page revisions, followed by another member's source edit -> complete accepted content and cited identifiers remain equal through API, UI and reload.

POST lanes/sd/INBOX.md: sd-slate-c-f206 DEC-003 proposed PARTIAL to DONE, points 1 and 2, cloud/sd-slate-c-f206 e7bda0b09948bf60c6caa3140080a0a9253ab610; final Verify 42489131094 has only permitted ACCEPTANCE.md freshness failure, jobs 128757455519 and 128757588009; prior Verify 42487261065 same exception. Native and both responsive proofs pass; counts remain 57 DONE, 240 PARTIAL, 41 MISSING and 211 registrations. Guarded regeneration, scan and landing remain pending.
