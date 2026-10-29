# Company agent access

Slate's declared shared-door profile contains tools, policy, pause, audit and
idempotency. Principal authorization and owner-bound tokens are mandatory.
The installed command and recorded agent-door runtime are pinned to released
rer 0.2.88. The same CORE array is declared in `agent-surface.json` and passed
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
