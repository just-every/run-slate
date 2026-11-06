# sd-slate-c-f169 — ordinary-page revision snapshots

The pushed product candidate is `94094121d1e0a18b99f86d8f03dd87e0389847a7` on `cloud/sd-slate-c-f169` in just-every/run-slate. REV-001 remains PARTIAL → PARTIAL. This round closes the selected ordinary-page snapshot proof in acceptance 1 and corrects a real extracted-text hashing error at adjacent formatting spans. It does not claim the whole clause DONE or release any Slate clause.

Overall counts remain 57 DONE, 240 PARTIAL and 41 MISSING, total 338. Published counts remain 41 DONE, 185 PARTIAL and 1 MISSING, total 227. All 338 parent Status identifiers and all 698 parent pipe rows remain. The test inventory stays at 207 registrations and 203 registration sites, above the inherited historical cap but unchanged by this round. No registration or existing business assertion was removed, narrowed or made conditional.

The complete plan is in PLAN.md. The returned plan row is REV-001 only: ordinary-page snapshots now have native mutation receipts, exact stored rows and visible retained-snapshot proof. Acceptance 2's complete matching-hash no-commit guarantee, acceptance 3's every-clause identifier agreement and full acceptance 4 remain unproved, including normalized-equal but structurally different writes. Database pages, records, containers, comments, templates, decision records and universal identifier non-reuse remain unproved. ADMIN-007 and shared company-policy prerequisites remain authoritative. SAVE-003's dated DEFER, frozen checks and no-third-fix loop, and the held SAVE-005 and REV-002 scopes are unchanged. No acceptance sentence was changed and no full plan was rebuilt.

## Product correction

Previously, extracting text from adjacent inline formatting spans inserted a space between them. The native page with bold `Café\t  fi` followed immediately by plain `rst` therefore hashed the visible word as `fi rst`. The reproduced native HTTP assertion expected canonical text `Café first second line alpha zeta Café snapshot`, SHA-256 `7f1fd1e25ca486cd88420075f0dccc0796cc58f415277ac30f21ba36a56e945d`, but the stored row contained the digest `c266e161a425bfc43a7d8fa7fc1e863541384756ba5c2a8f5ef4be1f51e8d437` for the incorrectly separated text. The actual failing probe and independent calculations are in inline-hash-probe.log and hash-regression.json.

`src/core/shared/knowledge/revisions.ts` now extracts adjacent inline spans without inserting a word boundary while retaining boundaries between logical block text. `src/core/features/pages/repository.ts` uses that extractor before its existing NFC normalization, whitespace collapse and SHA-256 digest. No schema or migration changed. Existing historical hashes are deliberately not rewritten; this boundary is stated in the Gap. This round does not establish the complete matching-hash no-commit guarantee for differently structured normalized-equal writes.

## Native and browser outcomes

The existing audit registration in `tests/qualification/core/audit-content.test.ts`, “ACT-002 BASE-OPS-005 audit content, publication, archive and version mutations once with actor and time”, invokes `revisionSnapshotProof` in `tests/qualification/core/revision-snapshot-proof.ts`.

Its six native HTTP writes cover create, title and complete-property changes, body replacement, workspace publication, later properties and a later body edit by a separately granted editor. Lines 15–35 independently reconcile each returned revision identifier, receipt, actor, autosave or publish origin, controlled commit time, immutable complete properties, body and whole D1 row. Lines 37–49 submit the known inputs, including reversed block order and a visible word split across formatting spans. Lines 50–56 reopen every retained snapshot after later edits and compare all stored rows without mutation. The six actual receipts, independent digest recheck, two authors and one-second controlled commit intervals are in worker-revision-receipts.json. Hash expectations never import the product extractor or hash implementation.

The existing `writeJourney` invokes `revisionSnapshotsJourney` in `tests/qualification/ui-convergence/revision-snapshots-journey.mjs`; the existing “real core-wiki and touch-member journeys at 1440px” and “real core-wiki and touch-member journeys at 390px” registrations load that helper. No registration was added. A genuine native email-outbox session creates an ordinary page through its native route, edits title and body in the rendered editor, reviews and publishes a workspace revision through the actual publication dialog, and makes later edits. Lines 20–36 reconcile every returned receipt, complete properties, submitted body and independent digest. Lines 73–88 reopen all six retained snapshots through the API and rendered history after reload, assert visible old and new content, and compare whole D1 rows with the emitted Worker stopped. Browser receipts retain all six snapshots at each width; four screenshots show the old and latest snapshots at 1440 and 390. The product UI, homepage, branding and existing appearance were unchanged.

PROBE REV-001 1: native create, title and body edit, workspace publication, later edit and history after reload → six immutable ordinary-page snapshots at 1440, exact D1 rows and independent hashes agree, all retained snapshots reopen with the expected old and new content.

PROBE REV-001 1: the same native doors at 390 → six immutable ordinary-page snapshots, exact D1 rows and independent hashes agree, all retained snapshots reopen with the expected old and new content.

Current-access, revoked-reader, erasure, replay and REV-006 deletion assertions remain in the existing native tests. No broader permission, deletion, provider or legal claim is made. These selected ordinary-page doors required no unavailable account, key or external installation.

## Verification and failures

Every command, actual exit, timestamp, duration, source head and dirty-tree status is recorded in checks.jsonl, with its referenced log. Final clean-head checks on `94094121d1e0a18b99f86d8f03dd87e0389847a7` passed:

- landing-native: all five existing tests in the audit and flagship content files, exit 0.
- landing-native-receipts: the existing audit registration with verbose actual revision receipts, exit 0.
- landing-build: production build under the pinned Node 22.20.0, exit 0; build-source.json binds the source, lock and output digests to this commit.
- landing-snapshots: the focused native snapshot helper at 1440 and 390, exit 0.
- landing-static: typecheck and `rer check --profile first-party`, exit 0.
- landing-views: contract generator write and check, exit 0, followed by whole-file restoration of ACCEPTANCE.md and docs/CLAIMS.md from origin/main.
- landing-mechanical: integration synchronization, source-lock generation and integrity check, exit 0. No generated contract view was committed.

The complete registered core callers also passed separately at both widths on preceding source `1b028009054d5f10e27d9ba2cac3d1b8efebad17`: candidate-core-1440 exit 0 and candidate-core-390 exit 0. Those runs validate the unchanged final session-renewal harness and its other assertions. They precede the hash extraction correction and richer snapshot fixture; they are not represented as full-core runs on the final head. The final native tests and focused browser helper validate those later changes on the exact final head.

Earlier failures remain in the packet. The first browser attempt had an incorrect new expectation for a native empty publication comment; the test now expects the actual submitted empty string. Later full-caller attempts outlived the fixture's ten-minute fresh-email proof, correctly receiving 403 STEP_UP_REQUIRED during private-channel creation or archive work; a cached identity switch restored an older token after a context-only renewal. The harness now renews both existing fixture identities through their native email confirmation door, updates cached tokens and contexts, and refreshes before later sensitive operations. It never bypasses the production guard. Both full callers then passed at source 1b028009. The enclosing core test budgets were increased to accommodate the expanded multi-screen work; product deadlines and all existing business timing assertions remain unchanged. Browser commands retained hard timeouts and all browser and server processes started by this run have ended.

The inline-span defect was reproduced as an actual nonzero native assertion before its source repair. During an overlapping repair run, a separate supporting HTTP test hit its unchanged 30-second harness timeout; the serialized five-test final native run passed without weakening that test. These local diagnostics are distinguished from CI. No CI runtime assertion failed, no failed-job rerun or speculative CI repair was made, and no workflow was edited.

## CI and custody

Exact-head push Verify `42161573452` completed with failure at app job `127708275078`: `node src/base/runtime/contract-docs.mjs check` reported “ACCEPTANCE.md: generated content differs; run contract-docs write.” Aggregate job `127708469878` then failed its dependency requirement; runtime jobs were skipped. This is solely the explicitly permitted generated-view freshness exception. The failed logs were each read once through `gh run view --log-failed` and retained in final-ci-app-failed.log and final-ci-aggregate-failed.log. Runtime CI is not claimed green. The guarded lander must regenerate the views, run exact-head Verify and perform the publication scan before landing.

The earlier candidate c68fb65ca4f78ebdf73124538b3481a1eb40d0fc had the same expected view-only failure in Verify 42151327795. Initial main `93b7327adee97ac0ff691bfb5cbff68f4412a27a` had green Verify 42144247270 and Run site 42144247238. Ten GitHub API or log-archive calls were used in total. No polling exceeded the allowed frequency. No PR was required or created because this repository's branch push starts Verify directly.

All five product commits were pushed successfully through cloud-push.py, with fleet author and committer identities and no co-author trailers. Published history was never rewritten. Current main was fetched and merged before the candidate, with no new main commits to merge. Main was never pushed or advanced. No evidence file was placed in the product branch. Product-ref.txt records remote branch custody; provenance.json records exact source and CI identities. A verified rescue bundle is retained outside the clone; its absolute path and SHA-256 are in bundle-receipt.json. The separate evidence publication transports this complete non-secret packet only to the dedicated evidence ref. Request-body debug lines, workflow environment sections and URL query strings were omitted from public diagnostic logs; packet-sanitization.json records those omissions.

MECHANICAL lock=`pnpm integration:sync && pnpm source:lock && pnpm source:check` exit=0; views=`node src/base/runtime/contract-docs.mjs write` then `check`, followed by restoration from origin/main, exit=0; ledger=none exit=0, no migration change.

## Rider review for this PARTIAL handoff

1. Selected ordinary-page acceptance 1 is reached through the native and browser doors above; broader families and acceptance outcomes remain unproved. No DONE claim.
2. Populated independent inputs, two actors, controlled times and exact rows pass; unsafe access and deletion assertions remain in existing tests.
3. The helper is loaded by existing Verify registrations. Exact-head local proof passed; exact-head CI runtime skipped after the permitted view failure, so CI runtime proof remains pending landing.
4. Final build, focused browser proof, native proof, typecheck and mechanical receipts name the exact candidate. Older full-core runs are explicitly identified by their different SHA.
5. No inherited Base duty was added, removed or claimed newly satisfied.
6. Evidence and Gap reflect the actual selected scope. Local view generation checks pass; generated files are intentionally restored for the guarded lander. Counts remain unchanged.
7. Acceptance text is unchanged. No rewrite or coverage-map change was made; every parent Status row remains.
8. Existing authority and dangerous deletion assertions remain intact; no weaker permission path was introduced.
9. No provider, retention, legal or external installation result is claimed.
10. No new custody, consent, spending or authority policy default was adopted.
11. Main equality, exact landing Verify, Run site and COMPLETE full-history publication scan remain guarded-lander duties. No cloud scan result or main landing is invented.

Pre-READY review: the selected behavior has native and visible snapshot assertions with independently calculated expectations; no existing assertion was removed or narrowed; existing authority, erasure and replay coverage remains; touched screens keep their existing controls and look. Local lock and touched checks pass. CI carries only the permitted generated-view failure. No DONE judge request is made. The product candidate has no known remaining real failure in this selected scope; the full REV-001 Gap remains authoritative.
