# Company agent access

Slate's declared shared-door profile contains tools, policy, pause, audit and
idempotency. Principal authorization and owner-bound tokens are mandatory.
The installed command and recorded agent-door runtime are pinned to released
rer 0.2.90 (Base `ab97e5e864013ef03fd7f1e1a335101dd9150891`). The same CORE array is declared in `agent-surface.json` and passed
to the production `createAgentDoor` factory.

No scopeable optional capability is declared: events, resources, prompts or
subscriptions. Their public doors return `capability_not_declared`. Native
resource visibility adapters remain private to the runtime. Multi-sponsor, mail
edges, resource refresh, timed lifecycle, dual host, queued lifecycle and
owner-native administration are unscoped by this first subset release; CORE
security checks, including native approvals and queued consent, still run. Native wiki activity is not a typed shared-door
resource event feed. BASE-AGENT-010 and SURFACE-005 remain partial / not-declared
for events and subscriptions, rather than claiming cross-product handoffs.

The shared door is connected to native workspace/activity/navigation reads and
page, block and container actions. Its full Agent surface adoption is still in
progress. The native interface remains authoritative; the target tool table is
not a claim that every drafted job is available through this door.

Every eventual shared-door call must resolve the signed Business subject to a
current native member id. An email match cannot select a sponsor or transfer a
binding. Native roles, page and container grants, field visibility, session
admission and fresh human proof continue to govern the corresponding action.
Company approval cannot replace native authentication or widen those grants.

Only a real native reversal may offer Undo. No provider cost or spend enforcement
is claimed; a conformance policy must use `spend: {none: true}`. Provider and
queued effects need their own native execution and revocation evidence before
they can be declared.

The portable deployment declaration supplies public `resend` /
`signin@example.invalid` values for disposable hosted verification. These are
not credentials. The native deployment hook still requires explicit
`SLATE_MAIL_PROVIDER` and `SLATE_MAIL_FROM`, and overwrites both values before
calling Base deployment. It refuses absent owner answers.

The previous `/api/agent/mcp` and `/api/agent/tools` dispatchers are retired.
Native SDK credentials retain their stored purposes and map to canonical tool
scopes; an unmigrated purpose grants no additional tool. Native credential
issuance and revocation still require a person’s session. The shared `/mcp`
door supplies current policy, consent and audit for supported calls.

## Released verifier limits

The 2026-10-29 continuation resolves 25 of the previous 37 failing points:
21 held approval/classification/receipt/completion assertions and four downstream
review-audit failures. Audit call indices change in a focused run; the four old
IDs were `BASE-AGENT-009.4.review.597`, `.771`, `.852` and `.868`, for page move,
group management, field deletion and view deletion. Those completed retries now
retain approval decisions and have their complete approval audit rows.
The local driver selects only the affected journeys with the released CLI's
real disposable installation, native fixtures and unchanged Base predicates.
The candidate's complete conformance run remains CI's responsibility.

`BASE-AGENT-007.phase4` was reproduced once in isolation with the original
blocked-phase scheduler on the refreshed source: 1294/1294 generated and
prerequisite assertions passed. The earlier phase-preparation failure did not
recur, so there is no new first error line to classify.

The publication success fixture preserves a direct native `full` grant for its
sponsor before granting workspace `view`. This keeps the sponsor authorized for
the approved retry while granting access to one additional member. The old
fixture replaced the sponsor's inherited `full` grant, correctly causing
`NOT_FOUND` on retry; neither native authorization nor Base checks are bypassed.

READY-PENDING-BASE: these 12 injection-after-mutation points remain failing in
rer 0.2.90:

- `BASE-AGENT-005.5.autonomous.pages_create_standard`
- `BASE-AGENT-005.5.autonomous.pages_create_sensitive`
- `BASE-AGENT-005.5.autonomous.pages_move_access`
- `BASE-AGENT-005.5.autonomous.grants_set_access`
- `BASE-AGENT-005.5.autonomous.grants_set_sensitive`
- `BASE-AGENT-005.5.autonomous.groups_manage_standard`
- `BASE-AGENT-005.5.autonomous.groups_manage_access`
- `BASE-AGENT-005.5.autonomous.pages_publish_access`
- `BASE-AGENT-005.5.autonomous.publishing_publish_access`
- `BASE-AGENT-005.5.autonomous.publishing_publish_sensitive`
- `BASE-AGENT-005.5.autonomous.fields_configure_destructive`
- `BASE-AGENT-005.5.autonomous.views_configure_destructive`

Base's `modules/agent-door/conformance/injection.mjs:21-23`, together with
`protocol.mjs:126-129`, mints a fresh write key after the original mutation.
The probe therefore requests a second native effect against consumed inputs.
These are the verifier gaps classified by gr on 2026-10-29, not accepted product
behavior. The probes and their checks remain unchanged; no BASE-AGENT clause
is promoted to done.

The required run-data migration also adopts Base's public `/run` chooser as
shipped: free local launch, Assisted and Managed request-access links and shared
prices, even while `paths.product` is null. The owner-approved homepage remains
unchanged.
