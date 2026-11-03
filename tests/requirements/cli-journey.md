# Native CLI journey specification

`tests/local-journey/cli.test.mjs` runs the exact case “fresh README CLI setup, native sign-in at both widths, custody, transfer and reset” through a fresh source clone and the public rer commands. Its supporting scope includes WORK-013’s native `/setup` page, unfinished app-route redirect and completed redirect at 1440 and 390, with actual wizard completion. It also exercises setup idempotency and private-byte custody, key-gated native `RER_OPEN` sign-in, dev and preview lifecycle, confirmed reset and a D1/R2 installation archive round trip.

`tests/release/delivery-runtime.mjs` separately checks the unpacked delivery Worker through HTTP: an unfinished authenticated owner follows `/app` to `/setup`, where the document renders the current identity; real native first-run completion makes `/app` render the workspace and `/setup` return to `/app`. Native page editing, search, readable export, profile boundaries and served asset bytes remain checked. Its identity fixture and test-only mail transport substitution establish local packaged-runtime evidence, not empty-store bootstrap, browser, provider or hosted acceptance.

The shared emitted browser harness obtains OS-assigned loopback ports once per workspace and retains that allocation across its persisted-state checkpoints. Explicit parent port allocations remain validated and fail if occupied. Native first-run and polish journeys keep their real Worker, D1, browser and existing product assertions.

The flagship no-provider Ask journey checks the public setup-instructions link, disabled submission, draft retention across navigation and reload, separation by page and member, and zero model runs. It does not pin OPERATIONS.md env-name prose or the instruction sentence.

This Node browser journey is run separately by `pnpm test:local-journey` and CI. It is outside the Workers-only report consumed by `test-evidence.json`; it cannot be registered as an observed Workers assertion or establish whole-clause acceptance there. `clause-inventory.json` keeps WORK-013 unproven beyond its listed supporting scope. The CLI journey uses the real application and local storage, with a test-only Git transport mapping for the public clone URL; it makes no provider or deployment request.

The 15 October owner decision supersedes the former CLI mailbox sign-in
journey. At both widths, the printed `RER_OPEN` link enters a real native owner
session through the checkout's dev-key gate; editor and guest personas use the
same gate. Local mail is silently suppressed and no captured-mail page is
served. The journey probes setup's transient preview, dev and preview public
listeners with no key: Local Explorer API, scheduled handler, removed mailbox
routes and private local paths return 404. Harmless root/exports/@fs archive
sentinels return 403/404 during dev. Native email confirmation and step-up checks
use substitution only at the test mail transport edge, never an application
mailbox page. These checks do not establish live provider delivery.

The Workers case `prior native members groups guests and live sessions survive additive identity preparation; old links retire and new links require POST`
loads the pre-0020 schema, seeds real native rows, applies the additive migration
and compares native HTTP responses before and after it: owner, member and guest
sessions; owner-only group administration; direct guest grants; group-derived
page reads; and denied reads of other private pages. It then requests an email
through the native HTTP route, receives the message at the test-only mail
transport edge and confirms with POST, preserving the owner's ID. On that same
migrated store it follows the configured provider's HTTP authorization/callback routes, verifies an RS256 token
from a substituted provider network edge, and preserves the existing member ID.
Provider state-cookie mismatch and replay remain refused; no prior issuer/subject
association is invented. Identities, grants, groups and content retain their rows.
`Base admission preparation binds existing native members without moving accounts and revokes the native session`
checks the public Base admission API against real native D1 records and native
HTTP session validation. Both are supporting regressions, not live cutover proof.

The existing emitted-artifact case “the emitted Worker serves every declared
surface and a real 404 everywhere else” requests a native sign-in link with
substitution only at the test mail transport edge, previews
`/auth/confirm` without setting a cookie, confirms with same-origin POST, checks
cross-origin refusal and replay, and checks the retired GET route. The configured
and missing-configuration route matrices include `/auth/confirm`. This verifies
the Hono/Start ownership change against emitted Worker bytes.
The emitted harness uses Base's adopted production module loader and Wrangler
configuration converter directly in local workerd, preserving the isolated
configuration, binding overrides and persistence. It uses the same runtime path
as setup/preview, with Local Explorer and trigger handlers disabled. Wrangler
still performs local migrations; its development HTTP forwarding process is no
longer the emitted-artifact listener. No assertion, request, retry or extra
readiness request was added to obtain a passing confirmation.

After reset and re-setup, the CLI journey probes preview's announced ready URL.
The prior installation's saved origin can differ on a shared host; every public
preview path still has to return 404 without a key or session.

The source export feature moves to `workspace-export` without changing its
bytes or public routes, retaining Vite's `**/exports/**` private-folder denial.
Its existing supplementary Node case `import/export activity resolves through current actor authority`
reads activity with a subsequent request timestamp after export completion;
the fixture's original timestamp precedes the recorded export event. Its two
positive activity assertions and two other-member refusals remain intact.

The 16 October local workspace-export amendment (BASE-ACCESS-001, PORT-003/005)
is checked through the public HTTP doors: a local owner session with no email
proof stages a queued workspace ZIP export, runs it to Completed, reads status
and downloads the archive; the synchronous export door also succeeds. No mail
request is made. Anonymous and non-owner sessions, cross-origin mutations and
an owner whose role was removed are denied. The exception requires local mode
and the configured exact loopback origin. Hosted owners without fresh proof
still receive STEP_UP_REQUIRED after provider acceptance of the confirmation
email; a fresh Base proof admits the export. This is one-off local Worker
evidence with substitution only at the mail network edge, not a permanent new
test or live hosted/inbox acceptance. Installation archive HTTP export and other
sensitive operations retain their existing step-up checks.

The existing restore-identity matrix adds populated native identity bindings to
its nonempty-target cases. Both legacy and current first-run targets retain all
rows when restore is refused; the binding table is part of both archive policies'
native table inventory.

The populated installation restore case also applies a scratch-only additive
column migration before import, then re-exports and compares every retained row
and object byte, with the new column's default checked separately. This proves
additive schema replay; it does not claim compatibility across data-changing
historical migrations, which Base continues to refuse.

The 16 October managed first-open case `a claimed RER owner signs in to a ready default workspace` uses an empty emitted Worker, RER’s bootstrap POST, replay refusal, the declared login_hint form and real native email confirmation. At 1440 and 390 it opens the default workspace and Welcome page without the wizard. The sign-in sent state also checks whitespace at the address boundary. This is local browser coverage, not live delivery or custom RER app-name transport.

The CLI flagship credential leg explicitly configures its private development profile and requests credentials:mint’s email proof through the native /auth/step-up door. It privately receives the message at the test-only paid network edge, previews the real confirmation page and submits its native form in that same dev session. Credential issuance then succeeds with the durable proof the commit requires. No proof is injected and no authorization route is bypassed.

The guest invitation case removes its obsolete 24-hour lifetime pin; requested guest access expiry, pending/accepted grants, replay, expired access and revocation behavior remain checked.


## Member appearance journey

WORK-012 is exercised by `themeJourney` in `tests/qualification/ui-convergence/theme-journey.mjs`, through `settingsJourney` in `tests/qualification/ui-convergence/reading-journeys.mjs`. The existing desktop outline and phone tree registrations in `tests/qualification/ui-convergence/journeys.test.mjs` load it in push Verify. No registration is added.

The journey selects Light, Dark and Match device through Settings, observes each committed native preference, and checks painted backgrounds and readable text across every configured operator destination, each Settings section, page editing, database cells and record editing. Workspace destinations use their native navigation links, with separate document-door status checks; color inspection foregrounds the actual browser tab with motion enabled. Match device responds in place to both device schemes. Reload and a newly issued native identity session in a clean browser context at the other viewport preserve the preference; another member has independent durable choices. Two genuinely published exposures retain their own light and dark themes for signed-in and anonymous readers under both device schemes, including reload. Only identity and the mail-provider edge use the existing harness; application routes and responses are native. Captures remain outside product source. Existing polish assertions for settings, search and contrast remain intact.
The existing responsive core journey at 390px and the existing starter-template
journey at 1440px call `templateCaptureJourney` in
`tests/qualification/ui-convergence/template-capture-journey.mjs` for TMPL-005.
It authors a root, two children and a grandchild through native page mutations,
with distinct body and appearance properties. Every source node also has a
comment, historical body revision, direct grant, owner and reader watches,
readership, a page status and an active public exposure. The page's More menu
saves with child capture disabled and enabled. Retained previews and applied
pages must contain exactly the requested body, properties and descendants,
without those seven source record families or their identifiers. New creation
revisions and visits belong to the copies; effective access comes from the
chosen destination. Native receipt retry creates no extra pages, and a reader
with destination view access cannot acquire the source comment grant. Existing
preview, starter-template and creation assertions remain in their registrations.

## Identity provider journey

The WORK-015 native provider journey extends the existing published-identity upgrade registration in `tests/flagship/core/identity-upgrade.test.ts`. It issues and accepts an actual member invitation before signed RS256 OIDC sign-in, then refuses an uninvited verified identity without changing members, bindings or sessions. It removes the admitted member and re-invites a new address through the native invitation doors: the new identity cannot read the old private page, old native and provider sessions stay revoked, old grants stay revoked, used invitations cannot replay, and the old provider subject cannot move to the new identity. Discovery and token outages and a wrong signature each refuse sign-in without identity writes while real native email confirmation still succeeds. The disabled-provider case also completes native email sign-in. Only the provider and mail network edges are substituted.

The existing emitted-Worker admission registration calls `providerFallbackFlow` in `tests/e2e/provider-fallback-flow.mjs` and `signInHintFlow` in `tests/e2e/signin-hint.mjs`. A synthetic provider discovery outage is observed at the outbound edge; its actual browser form returns to sign-in with the affected provider named, an enabled email door and no session. Email confirmation then creates a native session that survives reload while that provider stays broken. The unconfigured-provider journey identifies the missing OIDC option and completes email sign-in. Behaviour assertions use desktop width, and optional candidate screenshots capture the changed sign-in screens at 1440 and 390. Existing responsive assertions remain intact. The journeys run in push Verify's Workers shard and emitted-artifact contract job; they establish local native behaviour, not live tenant delivery. ADMIN-001 and ADMIN-002 retain SAML and SCIM; the R-12 field proof register retains real tenant receipts.

WORK-013 push coverage also uses the existing `real core-wiki and touch-member journeys at 1440px` and `real core-wiki and touch-member journeys at 390px` registrations in `tests/qualification/ui-convergence/journeys.test.mjs`. Their `setupWorkspace` helper in `tests/qualification/ui-convergence/browser-support.mjs` drives the wizard, skips invitations, checks exactly one workspace, one non-personal space and one page, and reloads persisted names. It checks unfinished-owner operator routes, completed-owner setup redirection and a genuinely later member admitted through a native invitation in a fresh browser context. Missing, invalid and revoked sessions cannot open setup or read or submit completion; the later member cannot complete it, and repeated completion changes no domain records.

The existing `preview and bootstrap owner sign-in preserve identity and single-use authority` Workers registration in `tests/flagship/core/preview-owner-signin.test.ts` invokes `tests/flagship/core/owner-bootstrap.case.ts`. It exercises verified bootstrap and a signed owner claim using an ephemeral test signing key. Both doors create the configured deployment name, General, Welcome and the completed marker; workspace, space, title and body edits persist through native HTTP. A real D1 trigger fails the final page-revision insert and the entire bootstrap rolls back, including owner authority. Invalid and foreign claims, replay and replay after membership and session revocation are refused without new records or authority.

The existing emitted admission registration in `tests/e2e/production-artifact.test.mjs` invokes `tests/e2e/managed-first-open.mjs` in push Verify's contract job. It retains native bootstrap and email confirmation, checks the default General space and Welcome page without the wizard, returns a completed owner from setup to the workspace, and persists meaningful workspace, space, title and body edits through reload at 1440 and 390. Only the paid mail edge is substituted; these journeys make no live delivery or hosted-provider claim.

## Retained workspace transfer jobs

PORT-003 uses `transferJobsJourney` in `tests/qualification/ui-convergence/transfer-jobs-journey.mjs`. The existing desktop readable-export registration and phone core-wiki registration in `tests/qualification/ui-convergence/journeys.test.mjs` invoke it in push Verify. It enters Settings to export a populated workspace, downloads and opens the real ZIP, then enters the first-run restore control in a separate empty native deployment. No application response is substituted. A test-only storage gate pauses the native R2 boundary so Queued and Running receipts can be read independently and reloaded before work finishes. A document reloaded while Queued must follow the native Running transition without a manual refresh.

The journey reconciles every rendered count with native persisted status and completed counts with the actual archive. Real D1 triggers force late export and restore publication failures. Failed receipts survive reload and replay, identify the failed publication without exposing internal SQL or raw exceptions, expose no download or successful-restore action, and refuse a guessed download route. A new operation succeeds after the fault is removed; the restored workspace requires fresh sign-in and retains the original pages. Queued and failed jobs explicitly show zero completed records. Captures cover the transfer screens at desktop and phone widths without another registration.

The existing populated ZIP round-trip registration in `tests/portability/roundtrip.test.mjs`, loaded by the tooling Verify shard, additionally forces that late native restore failure after original R2 files have been staged. It restarts the Worker, reads the same terminal failure, checks that canonical pages, containers and files remain absent, and retries the original archive. Its existing full retained-table, identity, search, publication, grant and original-byte comparisons remain in place. The Workers-only supporting-evidence inventory does not aggregate these Node and browser registrations; the contract Status row names their public-door evidence directly.

## One workspace identity journey

WORK-001's `workspaceIdentityJourney` in
`tests/qualification/ui-convergence/workspace-identity-journey.mjs` is called by
`settingsJourney` inside the existing registrations “page outline follows headings
and navigates long pages at 1440px” and “space tree title filtering preserves
ancestors, access and expansion at 390px” in
`tests/qualification/ui-convergence/journeys.test.mjs`. The desktop journey saves
a different name and mark through Settings, reads both persisted values, sees
both in the operator header immediately and after reload, reopens both saved
controls, then signs in a fresh native member session through the substituted
mail network edge. That member sees the same identity and cannot change it;
refusal preserves the saved workspace. Its setup route redirects to the app.
The existing phone registration shows the edited Settings and visible operator
identity with the navigation open. Slate's card mark remains visible beside the
workspace identity. No browser registration is added.

`ownerBootstrapCase` in `tests/flagship/core/owner-bootstrap.case.ts`, loaded by
“preview and bootstrap owner sign-in preserve identity and single-use authority”
in `tests/flagship/core/preview-owner-signin.test.ts`, supplies WORK-001 acceptance
2 and 3 and the sole-workspace ownership proof through native HTTP. An empty
store accepts the configured owner's bootstrap once; replay returns 409 without
another session or a changed workspace, member, container or page. Real container,
page, database record and comment creations are read through their public APIs
and checked in populated canonical D1 snapshots: containers and pages use the
sole workspace, records agree through their page and database, and comments agree
through their thread, page and author. POSTs to the workspace creation paths
return 404, and repeating first-run completion returns 409 without changing those
snapshots. A separately emptied store accepts a genuinely ES256-signed native
owner claim, then refuses claim replay and token bootstrap with unchanged records.
The existing native first-run replay and WORK-013 custody assertions remain
loaded and unchanged. These are local native runtime proofs with no hosted,
live mailbox or provider acceptance claimed.

## Typed formatting through the native editor

`tests/qualification/ui-convergence/typed-shortcuts-journey.mjs` exports `typedShortcutsJourney`, called by `writeJourney` in the existing “real core-wiki and touch-member journeys” registrations at 1440 and 390. It opens the real reference and reconciles every accepted Markdown input with its displayed entry: three heading levels, both bullet aliases, numbered lists, both quote aliases, both task aliases, code fences, dividers, bold, italic and inline code. Insert and mention entries, the task due-date picker and the conversion-undo command remain present.

For each input, native browser typing must produce its stored block type and content, with rendered inline marks where applicable. One keyboard undo must restore every character without a click that repairs focus. Native API read-back and reload must retain the unformatted literal text; retyping must convert again and survive another reload with the same block identifier. The divider case specifically keeps keyboard undo reachable after its textbox disappears. The reference and resulting editor are captured at both responsive widths.

`tests/ui/polish/editor-focus.mjs` retains the existing rich-heading journey inside “genuine insertion focus lifecycle at 1440px”: heading levels one through three preserve bold, italic, underline, colour, a link, a date mention, the comment anchor and block identifier across conversion, keyboard undo, reinsertion and reload. These Node journeys are invoked by push Verify, outside the Workers-only evidence registry. The responsive writing deadline includes the additional conversion and reload corpus; no prior assertion or registration is removed.

## One keyboard reference throughout the operator app

`tests/qualification/ui-convergence/shortcut-reference-journey.mjs` exports `shortcutReferenceJourney`, folded into the existing responsive Settings callers in `tests/qualification/ui-convergence/journeys.test.mjs`. From every configured operator destination, each available Settings section, a space, a page editor, a database and a record editor, the same native keyboard command opens the reference and Escape returns to the unchanged destination. Every documented keyboard command remains in that reference. The real page editor then commits bold, italic and underline from native selection shortcuts; opening, searching and closing the reference preserves those blocks and restores editor focus. Subsequent typing saves and survives reload, workspace search opens from the focused editor, and Escape closes phone navigation with focus returned to its trigger.

The complete typed catalog is exercised by `typedShortcutsJourney`. `tests/qualification/ui-convergence/tables-journey.mjs` retains all four native table structure commands. `tests/qualification/ui-convergence/presentation-journey.mjs` exercises both arrow keys and both page keys in the real read-only presentation, retaining its existing content, scroll, focus and unchanged-revision assertions. Existing focus and mention journeys retain the native insertion and mention doors. Settings caller deadlines include the added navigation and editing corpus; all existing assertions and registrations remain active.

`tests/qualification/ui-convergence/task-assignment-journey.mjs` retains the native task assignment and dating flow at both widths. Typing `//` opens the real date picker; the reference lists that accepted input, opens while the picker has focus, and closes back to the unchanged task and date field before a native due date is committed.

These supporting journeys retain main’s current partial judgments for BLOCK-004 and WORK-014; they do not replace the existing Status, Evidence or Gap rows in CONTRACT.md.

## Native version deletion

The existing `two people edit at once, lose access mid-edit and restore history at 1440px`
registration calls `historyJourney` in `./tests/qualification/ui-convergence/two-people-history.mjs`,
which calls `versionDeletionJourney` in `./tests/qualification/ui-convergence/version-deletion-journey.mjs`.
The existing `real core-wiki and touch-member journeys at 390px` registration calls the same
helper for the phone proof. Both registrations run on push Verify through the existing shard assignments.

For REV-006, actual publication review controls create three numbered versions with distinct
content. An edit-only member sees no delete control and a direct deletion is refused. A full
member cannot delete either the distinct working revision or the published revision. Under
autosnapshot, deletion is hidden and refused. Refusals preserve all snapshots and deletion activity.
Under labelled history, the full member confirms deletion of version 2. After reload its
content and label are unavailable while its ordinal, deleting member and formatted deletion
time remain visible. Every other revision, the working body and the published body are retained.
An exact request replay returns the original receipt, keeps the original attribution and time,
and creates no second activity entry.

The existing content HTTP registration additionally reads back cleared durable revision content,
all retained snapshots and the one deletion activity. The existing audit-content registration
reconciles the tombstone's actor and time with the committed activity receipt under replay.
These are local native-runtime proofs; they make no provider or release claim.
