# Company agents in Slate

The wiki curator enters at `/mcp`. Discovery is at
`/.well-known/oauth-protected-resource/mcp`; people review agent activity,
approvals and Pause at `/agents`. The same door also accepts `/api/agent/mcp`.
Supported MCP versions are `2026-07-28` and `2025-11-25`.

The current declared set is tools, policy, pause, audit, idempotency and resources.
It covers workspace and activity reads; listing, reading and creating containers;
listing, reading, creating and editing pages; replacing page blocks; reading and
creating comments; and setting personal favorites and watches. `agent-surface.json`
is the exact registry and executable journey. Writes return a resource link to the
native page or container, read under the current person's permissions and policy.
Page and container text, including imported instructions, is untrusted content.

Business signs the company policy. No policy, an unanswered class, an expired
policy, a blocked class or Pause prevents the next agent effect. The autonomous
policy adds no human approval. A held effect saves its server-computed summary
and native revision; only the person named by policy can approve that exact
change. Native permissions apply throughout. An agent never sets company policy,
confirms its own approval, or acquires a person's identity from an email match.

The signed Business owner ID binds to Slate's native setup owner. Native member
IDs remain authoritative and inactive people cannot act. Business team mappings,
when present, use their durable native IDs; an admin is a Business policy editor
only through that signed mapping. Slate has no native admin role: ownership is
not inferred from a Business admin label. Automatic Business team reconciliation
and multi-sponsor conformance are not declared in this first subset.

The old standalone `/api/agent/tools` dispatcher is retired. Development-profile run, evidence, inquiry and effect jobs use the same door with their original narrow local credentials and native source/audience/effect grants; their wider provider journey is not claimed by the core-wiki conformance declaration. Existing native
SDK, device, import, connector and installation credentials retain their original
purposes; they do not receive wiki access merely by being presented to MCP.

Native activity labels an effect as `<agent> for <person>` and retains named
approvers separately. Retrying the same key returns one effect; changed arguments
conflict. Native revisions and current permissions still guard the write. A native person retains proposal acceptance and attestation; an agent cannot register its own confirmation as that person’s review. No
Undo is advertised because these adapters do not yet expose a reviewed native
reversal. No provider cost or spend reservation is claimed (`spend: {none: true}`).

Events, subscriptions and prompts are undeclared and return typed refusals.
Resource refresh, queued provider execution, mail edges, multi-sponsor scenarios,
timed/dual-host lifecycles and native owner administration remain partial.
Broader tools and record families in CONTRACT.md's Agent surface remain target
work: databases, tasks, sharing, administration, publication, connectors, AI,
inquiries, trials and maintenance are not advertised by this subset. Wiki writes refuse with `provider_edge_not_declared` when enabled chat, webhook or automation delivery would require an undeclared queued provider lifecycle. No target
capability is represented by a mock tool.

Verification uses the production signed `/auth/owner-claim` lifecycle and the real
D1 migrations. `tests/agent-door` contains only disposable public-door fixture and
journey tooling; no verification route or native-authority replacement is shipped.
