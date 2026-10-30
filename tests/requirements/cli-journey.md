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

## Typed formatting through the native editor

`tests/qualification/ui-convergence/typed-shortcuts-journey.mjs` exports `typedShortcutsJourney`, called by `writeJourney` in the existing “real core-wiki and touch-member journeys” registrations at 1440 and 390. It opens the real reference and reconciles every accepted Markdown input with its displayed entry: three heading levels, both bullet aliases, numbered lists, both quote aliases, both task aliases, code fences, dividers, bold, italic and inline code. Insert and mention entries and the conversion-undo command remain present.

For each input, native browser typing must produce its stored block type and content, with rendered inline marks where applicable. One keyboard undo must restore every character without a click that repairs focus. Native API read-back and reload must retain the unformatted literal text; retyping must convert again and survive another reload with the same block identifier. The divider case specifically keeps keyboard undo reachable after its textbox disappears. The reference and resulting editor are captured at both responsive widths.

`tests/ui/polish/editor-focus.mjs` retains the existing rich-heading journey inside “genuine insertion focus lifecycle at 1440px”: heading levels one through three preserve bold, italic, underline, colour, a link, a date mention, the comment anchor and block identifier across conversion, keyboard undo, reinsertion and reload. These Node journeys are invoked by push Verify, outside the Workers-only evidence registry. The responsive writing deadline includes the additional conversion and reload corpus; no prior assertion or registration is removed.
