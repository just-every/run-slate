# Slate SHARE-009 native message flow

Tag: sd-slate-c-f192
Repository: just-every/run-slate
Branch: cloud/sd-slate-c-f192

Plan:
1. Map the existing clause and loaded public journeys. Acceptance 1 and 3 lack a complete native-member journey; acceptance 2 lacks inbox and email proof.
2. Implement optional plain text with a named seed limit enforced at the route, read-only recipient review, explicit View-grant consent, atomic accepted grants and one inbox event, sender activity, current access and replay protection.
3. Extend the existing sharing journey without another registration. Use independent published pages and native invitations and sessions. Reconcile cancellation, limit refusal, replay, authority loss, erasure, inbox, activity, unchanged body and responsive readback.
4. Run touched proof and typecheck, generator write and check, restore generated views, synchronize integration and lock last. Preserve all parent Status rows. Merge fresh main after any published save.
5. Push only the task branch, discover exact-SHA Verify, and publish this report and actual receipts through the separate evidence ref. Guarded publication scan, main landing and Run site remain with the fleet.

Scope: SHARE-009 remains PARTIAL. This round implements native members only. Email delivery and preferences under NOTIF-005 and NOTIF-006, groups, email-address and guest admission, and complete delivery and audience behavior remain unproven. SHARE-007 general grant-narrowing conflict, existing sharing scopes, live SHARE-002, ADMIN-007 and company-policy prerequisites remain unchanged. No release or main DONE count is claimed.

Implementation results:
- The existing Share panel now offers a native-member message form using limits.shareMessageCharacters from seed.json. The strict server schema and the textarea enforce the same limit. The field is optional and rendered as plain text.
- Recipient review performs no mutation. Final confirmation rechecks sender and recipient authority. Only explicitly accepted missing View grants are inserted, together with a single logical share event, an operation receipt and sender activity in one native D1 batch. Existing grants and all page and block bytes remain unchanged.
- The inbox shows one item per recipient, current readable title and link, sender and plain-text message. Sender activity exposes its retained message only to the sender. Current access filters retained inbox items, and sender erasure deletes the sent message items while retaining content-free activity.
- No email transport, new guest admission, group expansion or policy change is claimed. The full clause remains PARTIAL, and no DONE judge request or release claim is made.

Proof map (existing desktop core registration, shareMessageJourney):
- Acceptance 1 native member slice: lines 21–59 create native membership and an independent published page, establish readable Morgan and unreadable Casey, and review both through Share.
- Acceptance 2 inbox slice: lines 95–135 reconcile one message item, current sender, title, literal message and link, actual inbox rendering, source-page readback, unchanged body and sender-only retained activity.
- Acceptance 3: lines 62–105 prove no effects before consent or after cancellation, refused unaccepted grants, only the accepted View grant, one item and one activity under exact capture replay.
- Additional authority and erasure: lines 140–206 refuse read-only sends, hide revoked recipient items, preserve revocation under replay, reject changed recipient access after review, require fresh explicit consent, reject revoked sender captures and erase sent messages with their sender.
- Phone proof: lines 176–191 capture the independent second published source and inbox at 390; functional assertions run in the existing 1440 registration. New icon-only controls: none. Existing tooltip behavior remains intact. Labels use the existing 13 px form typography; message whitespace wraps safely.

DONE-RIDERS disposition (no DONE claim):
1. PARTIAL: native acceptance 1 and 3 and the inbox portion of 2 are exercised; email and wider recipient duties remain unproven.
2. PASS for this slice: real native allowed and refused paths reconcile populated grants, inbox and activity; failures change nothing.
3. PENDING exact-SHA Verify. The helper is loaded by the existing desktop core registration in the Verify shard command; no new registration or environment opt-in.
4. Exact final build and browser provenance are recorded in the packet; final result recorded below.
5. PASS: SHARE-009 retains its existing BASE-ROLE-001 citation; no inherited duty is dropped.
6. PARTIAL retained with an explicit complete remaining Gap. Generator write and check pass before restoring the generated views from main; committed stale views are intentional for the lander. No new self-referential judgment stamp is claimed.
7. PASS: acceptance text is unchanged, all 338 Status IDs and 698 parent table rows retained, and counts remain 57 DONE, 240 PARTIAL, 41 MISSING.
8. PASS for this slice: only a current full-access native member can send or grant; read-only and revoked sender attempts refuse unchanged. Recipient access is also rechecked at confirmation and readback.
9. PASS boundary honesty: inbox only; email, settings, groups and guest behavior remain unproven. No live provider receipt is claimed.
10. PASS: existing native full-access grant authority is reused; no new company policy or ct scope ruling is invented. The same standing prerequisites remain named in the Gap.
11. PENDING guarded landing, exact main equality, publication scan and Run site; no count is claimed on main.

Pre-ready self-check:
- Native success, cancellation, limit refusal, missing consent, changed recipient access, replay, revoked sender and erased sender paths have public-door assertions. No existing assertion was removed, weakened or moved behind a new condition; the new helper uses the existing desktop registration.
- Registrations: 207 before and 207 after, matching actual AST counts; the pre-existing test-budget.json reported count is unchanged.
- No added email-shaped fixture strings. Bare slash pairs in the diff are imports, real paths or routes. No homepage, logo, Base pin, workflow or release prerequisite changed.
- Full-history cloud publication scan is not run or claimed. The guarded fleet lander owns the required scan and main gates.

An initial broad local run was invalidated when a concurrent build removed .cache/slate/build-source.json. No product change was made in response. Build and browser commands are now sequential, and the invalidated run is not passing evidence.

Plan row changed: SHARE-009 only, PARTIAL to PARTIAL. Acceptance 1 and 3 and acceptance 2 inbox coverage now name the loaded native message journey. Full acceptance text and all other rows remain unchanged.

MECHANICAL lock=pnpm source:lock then pnpm source:check exit=0; views=node src/base/runtime/contract-docs.mjs write then check exit=0 before restoring ACCEPTANCE.md and docs/CLAIMS.md from origin/main; ledger=none exit=0 (no migration).

Known base main at inspection: bc567c9b6f6b25c98cb6fa05b9ab0fe37628a547. Verify Slate push runs 42183473801 and 42179706478 and Run site push run 42183473597 completed successfully on that exact SHA. Product head remains branch-only until the fleet lands it.

No new permanent test registration, assertion deletion, default-branch push, PR or provider dispatch. The ordinary branch push is the existing Verify entry point.

Final local results at 9167d6df3012153be7636fc77d29a7b0ad2f6f5e:
- Full desktop core registration: PASS, 1 test, 0 failures, 500435.840505 ms including startup. Its native message proof includes the changed-access-after-review refusal and fresh consent path. The build provenance names this exact commit and tree 506507d275eba8db7d0c3eba36849e96ba3df8b9.
- Worker regression check: PASS, 3 files and 3 tests (activity, notification transport and core authority); the relevant product and test bytes match the final candidate.
- Typecheck, first-party, integration, source lock and regenerated view checks: PASS. Generated views were restored whole from main and are absent from both product commits. No migration changed.
- Final fetch and merge found main unchanged. Both candidate commits have fleet authors and committers and no trailers. The guard pushed cloud/sd-slate-c-f192 successfully, and ls-remote returned the exact candidate SHA. No PR is needed for this repository's existing branch-push Verify entry point.

Final browser supplement: the committed native share-message journey passed again on the same exact candidate, with sender Activity captured at 1440 and 390. Six selected screens and their complete browser receipts cover Share review, recipient Inbox and sender Activity at both widths. Their provenance names 9167d6df3012153be7636fc77d29a7b0ad2f6f5e; no serious or critical accessibility finding and no horizontal overflow was observed. No product or test byte changed after the passing desktop core run.

Exact-SHA CI: Verify Slate push run 42206008866 completed failure. App job 127852759521 fails solely at `node src/base/runtime/contract-docs.mjs check`, with the observed error `ACCEPTANCE.md: generated content differs; run contract-docs write.` Aggregate job 127853001770 fails because app failed and its dependent shards and contract jobs skipped. Both failed-job archives were read once through gh run view. This is the brief's explicitly permitted generated-view exception; no product assertion failed in CI, and no repair, dispatch or rerun was made. The branch run does not establish green recorded journey execution: DONE-RIDERS row 3 remains unestablished until the guarded lander regenerates the views and obtains exact-SHA green CI. Row 11 likewise remains pending. This is a PARTIAL candidate with all selected native POINTS proven locally.

Custody: product branch cloud/sd-slate-c-f192 is pushed at 9167d6df3012153be7636fc77d29a7b0ad2f6f5e. It is not main and no acceptance or landing is claimed. Publication scan, generated-view landing commit, final green Verify and Run site are guarded-fleet duties. Evidence publication is a separate report-only tree on evidence/sd-slate-c-f192. No real blocker remains within this round's selected native-member slice; the full remaining clause Gap is unchanged in scope.
