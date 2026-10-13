# Native CLI journey specification

`tests/local-journey/cli.test.mjs` runs the exact case “fresh README CLI setup, native sign-in at both widths, custody, transfer and reset” through a fresh source clone and the public rer commands. Its supporting scope includes WORK-013’s native `/setup` page, unfinished app-route redirect and completed redirect at 1440 and 390, with actual wizard completion. It also exercises setup idempotency and private-byte custody, one-use native outbox sign-in, dev and preview lifecycle, confirmed reset and a D1/R2 installation archive round trip.

`tests/release/delivery-runtime.mjs` separately checks the unpacked delivery Worker through HTTP: an unfinished authenticated owner follows `/app` to `/setup`, where the document renders the current identity; real native first-run completion makes `/app` render the workspace and `/setup` return to `/app`. Native page editing, search, readable export, profile boundaries and served asset bytes remain checked. Its identity fixture and local outbox establish local packaged-runtime evidence, not empty-store bootstrap, browser, provider or hosted acceptance.

The shared emitted browser harness obtains OS-assigned loopback ports once per workspace and retains that allocation across its persisted-state checkpoints. Explicit parent port allocations remain validated and fail if occupied. Native first-run and polish journeys keep their real Worker, D1, browser and existing product assertions.

The flagship no-provider Ask journey checks the public setup-instructions link, disabled submission, draft retention across navigation and reload, separation by page and member, and zero model runs. It does not pin OPERATIONS.md env-name prose or the instruction sentence.

This Node browser journey is run separately by `pnpm test:local-journey` and CI. It is outside the Workers-only report consumed by `test-evidence.json`; it cannot be registered as an observed Workers assertion or establish whole-clause acceptance there. `clause-inventory.json` keeps WORK-013 unproven beyond its listed supporting scope. The CLI journey uses the real application and local storage, with a test-only Git transport mapping for the public clone URL; it makes no provider or deployment request.

The 11 October identity preparation updates that same CLI case: the outbox link
opens `/auth/confirm`, script loading is blocked while the native confirmation
form POSTs, then the browser uses the resulting native session. At both widths
axe must report zero serious/critical findings on the confirmation page. The
journey probes setup's transient preview, dev and preview public listeners with
no key: Local Explorer API, scheduled handler and private local paths return
404. Harmless root/exports/@fs archive sentinels return 403/404 during dev.
The helper owns an explicit browser context;
the separate scan page permits axe's auxiliary page while the native POST page
keeps its script interception. These results do not establish the pending Base
email engine, dependency linking or dev personas.

The Workers case `prior native members groups guests and live sessions survive additive identity preparation; old links retire and new links require POST`
loads the pre-0020 schema, seeds real native rows, applies the additive migration
and compares native HTTP responses before and after it: owner, member and guest
sessions; owner-only group administration; direct guest grants; group-derived
page reads; and denied reads of other private pages. It then requests an email
through the native HTTP route, reads the real D1 outbox HTTP handler and confirms
with POST, preserving the owner's ID. On that same migrated store it follows the
configured provider's HTTP authorization/callback routes, verifies an RS256 token
from a substituted provider network edge, and preserves the existing member ID.
Provider state-cookie mismatch and replay remain refused; no prior issuer/subject
association is invented. Identities, grants, groups and content retain their rows.
`Base admission preparation binds existing native members without moving accounts and revokes the native session`
checks the public Base admission API against real native D1 records and native
HTTP session validation. Both are supporting regressions, not live cutover proof.

The existing emitted-artifact case “the emitted Worker serves every declared
surface and a real 404 everywhere else” now requests a real outbox link, previews
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

The source export feature moves to `workspace-export` without changing its
bytes or public routes, retaining Vite's `**/exports/**` private-folder denial.
Its existing supplementary Node case `import/export activity resolves through current actor authority`
reads activity with a subsequent request timestamp after export completion;
the fixture's original timestamp precedes the recorded export event. Its two
positive activity assertions and two other-member refusals remain intact.

The existing restore-identity matrix adds populated native identity bindings to
its nonempty-target cases. Both legacy and current first-run targets retain all
rows when restore is refused; the binding table is part of both archive policies'
native table inventory.
