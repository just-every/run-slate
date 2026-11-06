# sd-slate-c-f175 — native draft sharing

Repository: just-every/run-slate
Branch: cloud/sd-slate-c-f175
Candidate: 725e1940848467c19b70fbc68f4a5d8997e7ec18
Base requested and retained: f38bdd94e85bdac4f6bdb28a2c6a7feec27205b6
Current main at integration: 93b7327adee97ac0ff691bfb5cbff68f4412a27a

LIFE-002 remains PARTIAL to PARTIAL. No clause is promoted or released. Counts remain 57 DONE, 240 PARTIAL and 41 MISSING, with 338 Status rows. All 698 parent table rows remain. Test registrations remain 207; no registration or existing assertion was removed, narrowed, skipped or moved behind a new branch or width condition. The source budget file has an older declared inventory of 205; this round adds zero registrations and does not alter that inherited budget.

## Plan and changes

The complete working plan is PLAN.md. The supplied continuation already covered most selected native member duties. Inspection found an ordinary draft author could not choose groups in the native Share panel: it fetched the owner-only group administration directory. The authorized sharing projection now supplies scoped principal labels for page editors, reusing the existing container directory rules. The page panel uses those labels instead of loading group administration or guest administration. Only a full-access editor receives the directory; guest subjects receive none, guest choices retain the previous owner boundary, unrelated workspace principals are absent, and group membership and email fields are not returned by this directory.

The existing HTTP publication sanity journey now also performs actual invitation delivery at a fake mail network edge, pending grant readback, harmless GET preview, explicit POST acceptance, a genuinely issued native guest session, exact body reads, view-only write refusal, full revocation on the same session, cancelled-link refusal without creating a person, and duplicate invitation replay without resurrection. Anonymous requests to sharing, invitations and publication also refuse without changing stored page, revision, grant, exposure, invitation, receipt or activity inventories. A second workspace fixture proves the authorized principal directory excludes its member and group.

The existing responsive draft journey adds ordinary member-author group selection, saved grant readback after reload, successful group-reader body access by the workspace owner only after the author grants it, then immediate refusal following removal. A newly invited guest accepts the actual delivered link in a clean browser context, reloads the private body under the issued session and loses access on the next request and reload after grant removal. Existing author, named member and group, copied address refusal, owner refusal, general-access refusal, anonymous-publication refusal, four policy combinations, populated search exclusion and lifecycle preservation assertions remain.

Only the LIFE-002 plan row is updated in this report: extend native sharing proof; keep the complete wider Gap. No acceptance text changed. The two generated view files were restored from main and are not committed. Base pins, homepage, logo and workflows are unchanged. No migration changed.

## Selected proof map

| Item | Public door and result | Test source |
| --- | --- | --- |
| Acceptance 1 selected body and own grants | Independent native author, member and group sessions; exact body and grant list; ungranted owner and member refused; same sessions refused after removal; replay cannot restore access | tests/flagship/content/draft-privacy.case.ts lines 9 to 116, called by the existing publication registration in tests/flagship/content/http.test.ts line 261; responsive draft journey lines 53 to 176 |
| Acceptance 1 selected link sharing | Actual delivered guest invitation, pending list, non-mutating preview, explicit acceptance, native session body read, cancellation, same-session revocation and unchanged replay | tests/flagship/content/draft-privacy.case.ts lines 153 to 197; tests/qualification/ui-convergence/draft-privacy-journey.mjs lines 178 to 212 |
| Acceptance 2 selected privacy | Both general-access profiles reject general grants and anonymous publication; sessionless document, grant, sharing, invitation and publication doors refuse; snapshots remain equal | tests/flagship/content/draft-privacy.case.ts lines 44 to 101 and 167 to 180; responsive draft journey lines 92 to 105 |
| Acceptance 4 preservation | All four lifecycle and general-access profile combinations retain the existing draft body, revision and exact named grants; author and grantees read, owner and anonymous do not | tests/flagship/content/draft-privacy.case.ts lines 92 to 101; responsive draft journey lines 92 to 105 |
| Ordinary author group selection | Native Share control selects and persists the group while group administration still refuses; owning the workspace does not grant the draft before the explicit grant or after removal | tests/qualification/ui-convergence/draft-privacy-journey.mjs lines 138 to 176 |
| Scoped principal directory | Unrelated workspace identities and groups are absent; no membership or email directory fields; ungranted and view-only readers cannot load the projection | tests/flagship/content/draft-privacy.case.ts lines 33 to 76 |

The existing Verify registrations remain the publication Workers registration and the 1440 page-creation and 390 core browser registrations. No new registration, registration flag or workflow edit was introduced. Both existing browser callers and all touched Workers checks passed locally on the exact candidate. CI is recorded separately below.

## Honest retained Gap

The requirement-wide exclusion corpus beyond the existing ordinary-page and discussion cases remains unproved: complete search, content-query, inbox, analytics, administrative and export-listing, other-tree and AI-grounding coverage. Acceptance 3 still lacks the complete every-role, policy, container, owner, automation and extension invariant. Acceptance 5 held company-policy outcomes remain unproved under ADMIN-007 and the shared company-policy prerequisites supplied in the brief. Full inherited SHARE-001 and SHARE-006 duties are retained, rather than certified by these selected draft outcomes. SHARE-007’s five-second cross-surface and AI removal and its general narrowing scope conflict remain unresolved and unclaimed by this full-revocation slice. Native work still omitted is unfinished proof; it is not described as an unavailable account. No new policy default, scope carve, account, provider result or DONE is claimed.

## DONE riders

This is a partial progress handoff, not a DONE judge request.

1. FAIL for full LIFE-002: the wider exclusion and policy outcomes above have no complete journey. The selected native outcomes have the mapped positive and refusal journeys.
2. PASS for the selected outcomes: populated native draft and live control, exact grant inventories, unsafe refusals with unchanged snapshots, same-session revocation and replay are exercised.
3. UNESTABLISHED full CI proof: exact-candidate push Verify 42167700378 completed with the expected generated-view failure, so its test shards were skipped. Existing registrations load these journeys when Verify reaches them. Local execution passed but is not claimed as recorded CI success; the lander regenerates views and runs full Verify.
4. Final receipts identify the exact candidate. Screens are regenerated by those executions. Any earlier exploratory receipts are supporting diagnostics only.
5. No new inherited duty is claimed; existing SHARE references and their retained Gap remain. Full inheritance is not certified.
6. PARTIAL Gap remains complete. Local contract write and check pass before restoring generated views; candidate stale generated views are intentional. No self-referential judgment stamp or full-DONE provenance is asserted.
7. PASS: no acceptance sentence or ID changed and no original obligation or parent Status row was removed.
8. PASS for the selected native authority boundary: ordinary author sharing succeeds, ungranted owner and member access refuses, guest and member view-only mutation refuses, revocation refuses the next request without mutation. Other authority invariants stay in the Gap.
9. PASS boundary honesty: fake mail network edge proves local delivery and native confirmation, not a live provider or inbox delivery. Held AI and company-policy results are not claimed.
10. No new policy decision or default was adopted; existing native authority rules are applied.
11. PENDING guarded landing: this task pushes only the named branch. Main equality, exact-head full Verify, Run site and COMPLETE full-history publication scan with zero findings belong to the fleet lander.

## Local development diagnostics

The first exploratory browser run exposed a new test harness mistake: it clicked Share after reload although the retained panel URL had already reopened it, closing the desktop panel and intercepting the phone click. The helper now opens only a closed panel. The focused 390 journey then passed. Two discarded foreign-workspace fixture drafts were corrected before publication: the seed helper required an address, and native sessions intentionally belong to the installation tenant, so the unrelated workspace’s group is an explicit isolation fixture. No product assertion was weakened. There was no failed CI repair round.

## Candidate results

On exact candidate 725e1940848467c19b70fbc68f4a5d8997e7ec18, using Node 22.20.0 and pnpm 10.12.4:

- Build passed.
- Eight tests in four touched Workers files passed.
- Both existing browser callers passed: complete 390 core journey in 488.94 seconds and 1440 page-creation journey in 98.21 seconds. Total command duration was 601.04 seconds, exit 0; no skipped or cancelled test. Twenty actual screenshots are retained under screens with exact build provenance.
- Typecheck and first-party checks passed.
- Contract generator write and check passed, generated views restored from main, source integrity and integration check passed. No migration ledger update was required.
- Final refreshed-main merge was already up to date. All seven candidate commits retain all parent rows and compliant identities; no fixture or changed product text contains an email-shaped literal. Source lock was checked again immediately before the guarded push.
- Product push succeeded. Exact candidate push Verify 42167700378 completed with the expected generated-view failure in app job 127727949652; dependent aggregate job 127728156270 failed and test shards were skipped. No product test failed in this run. The only failing app step is `Run node src/base/runtime/contract-docs.mjs check`. This matches the locally recorded stale-view failure and is the brief’s permitted READY exception. No PR was needed because the existing workflow accepts the named cloud branch. No Verify was dispatched or rerun.

Actual per-command receipts are retained in RECEIPT.json and candidate JSON files. PROBES.md records one observed public-door probe for each selected point. Full publication scanning and main landing remain with the guarded lander.

The main CI snapshot is retained in main-ci.json. Verify 42144247270 and Run site 42144247238 are successful on main 93b7327adee97ac0ff691bfb5cbff68f4412a27a. A later push Verify 42150976860 is a failed run of the separate cloud/sd-slate-c-f78-c1-land-7016577a08-rebase-93b7327adee97ac0ff691bfb5cbff68f4412a27a branch at the same SHA, with tooling job 127674495791 failed. Its one requested archive read, `gh run view 42150976860 --repo just-every/run-slate --job 127674495791 --log-failed`, returned no log text. No retry or unsupported blob download was made; the assertion is unestablished. This is not a failure of this task’s candidate or of a main-branch push. The actual main push Verify 42144247270 and Run site 42144247238 remain recorded success.

## Pre-READY self-check

Selected user-visible behaviors have positive and refused public-door assertions using populated native state. Full clause acceptance is not claimed. No existing assertion was removed or narrowed and no new width or environment exclusion was added. Current access and replay are checked; person erasure belongs to the retained wider obligations and is not newly claimed by this slice. The touched Share panel introduces no icon-only control, new configuration placement or text style; the existing adjacent icon controls use IconAction and the shared 300 ms hover and immediate focus tooltip rules in src/core/app/styles/header.css lines 53 to 78. Screens at both widths are retained. Source lock is fresh. Candidate Verify, publication scanning, main equality and Run site are reported independently and never inferred from local tests.

The committed candidate’s deliberate stale-view check was also executed: `node src/base/runtime/contract-docs.mjs check` returned exit 1 with exactly `ACCEPTANCE.md: generated content differs; run contract-docs write.` This is the expected generated-view condition after restoring main’s view files, not a product-test failure. The earlier generator write and check both passed. No generated view was committed or hand-resolved.

## Final custody and gates

PUSHED branch=cloud/sd-slate-c-f175 head=725e1940848467c19b70fbc68f4a5d8997e7ec18

Exact remote custody was confirmed with Git. Product HEAD, index and worktree are unchanged after checks. No PR was opened, no default branch changed, no history rewritten, no Verify rerun or dispatch performed. The actual successful local command receipts and screens identify this exact head. CI outcome is expected generated-view failure, not a claim of full green Verify. The cloud-generated-view exception authorizes READY handoff; the maintained lander must regenerate views, run exact-SHA full Verify, complete publication scanning and confirm Run site after landing. No source or workflow repair was made for the intentional view failure. No real blocker of the selected native progress remains; full LIFE-002 completion is still unproved as described above.

GitHub reads used seven calls: main exact-SHA discovery, separate cloud-run job metadata and one empty archive read; candidate discovery, final status, job metadata and one app-job archive read. No polling interval was shortened and no blocked blob download was retried. The final packet is published separately on the evidence branch. Product cleanup occurs only after evidence publication is confirmed.
