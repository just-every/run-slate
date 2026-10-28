# Slate contract rulings

### RL-1 — Native account authority

Date: 2026-10-10 · Ruled by: owner · Governs: WORK-008, WORK-009, WORK-010, WORK-015

Slate keeps its native accounts, sessions, roles, groups and guests. Base operator authentication uses Slate's adapters and its existing ledger; a second Base account or session ledger is not introduced. The 10 October decision and its implementation history are retained in CHANGELOG.md. This changes no clause status.

### RL-2 — Unconnected file-card readers

Date: 2026-10-22 · Ruled by: ct at 23:00Z · Governs: EMBED-004

An unconnected reader sees “Connect to view”. No metadata is disclosed when the reader's own provider access fails; show request access and the existing connect path. Recorded provider fixtures establish no real-provider acceptance.

### RL-3 — Slate's inquiry extension stays

Date: 2026-09-27 · Ruled by: owner · Governs: INQ-001, INQ-002, INQ-003, INQ-004, INQ-005, TRIAL-001, TRIAL-002, TRIAL-003, TRIAL-004, EFFECT-002

The accepted flagship extension includes inquiry, trial and customer activation in Slate. Those jobs stay in this contract; the cleanup does not move them to a sibling or change their status.

### RL-101 — API-001: Public REST API

Date: 2026-10-28 · Ruled by: ct · Governs: API-001

Question: May full members and owners use bounded personal tokens without guest, export or security-administration authority?

Adopted/proposed default: Hash-only once-issued tokens, container read/write within current rights, 90-day default/one-year maximum and inert restore.

Outcome: **adopt with rider**. Approve full-member/owner personal-token issuance with explicit container scopes bounded by current UI rights, finite expiry, immediate revocation, hash-free archives and permanently inactive restored credentials; guest tokens and undeclared privileged operations remain denied until explicitly specified.

Why: Confluence supports scoped member tokens with finite configurable expiry and revocation. Its default is one year, not Slate’s ninety days; the reviewed sources establish no common norm for ninety days, so choose the shorter disclosed default as conservative local custody. No Admin role is invented.

- [Source 1](https://support.atlassian.com/atlassian-account/docs/manage-api-tokens-for-your-atlassian-account/): Confluence account tokens may be scoped, are shown once and revoke immediately; new-token expiry is configurable from one day to one year.
- [Source 2](https://support.atlassian.com/confluence/kb/using-the-confluence-rest-api-to-upload-an-attachment-to-one-or-more-pages/): Confluence REST operations enforce the same page/space permissions as the UI.

Main evidence: `CONTRACT.md:1506` at `aa03efc5900ec95b739958411506d78d343176b7`.

Placement: API-001 owns personal-token execution custody; API-004 cites it and owns the administration UI delta.

Engineering/proof retained: OAuth and missing resource APIs remain implementation gaps; this rule does not narrow full API coverage or authorize new app installation/spend.

### RL-102 — API-004: App and token administration

Date: 2026-10-28 · Ruled by: ct · Governs: API-004

Question: Does missing OAuth/MCP administration justify carving the full token-administration clause or changing its status?

Adopted/proposed default: Default ADOPTED: PARTIAL with clause text unchanged; requested carve awaiting ct.

Outcome: **adopt**. Keep API-004’s complete owner/member administration target unchanged and partial; retain visibility, once-issued secrets, fresh session proof, immediate revocation and activity history, and implement OAuth/MCP administration under the same declared ownership boundary.

Why: This is principally an engineering/status carve request, not an unresolved custody policy. Confluence documents token administration and immediate revocation; absence of an app type is unfinished coverage, not grounds for a scope carve or DONE promotion.

- [Source 1](https://support.atlassian.com/atlassian-account/docs/manage-api-tokens-for-your-atlassian-account/): Confluence account tokens may be scoped, are shown once and revoke immediately; new-token expiry is configurable from one day to one year.

Main evidence: `CONTRACT.md:1527` at `aa03efc5900ec95b739958411506d78d343176b7`.

Placement: API-004 owns administration visibility only and cites API-001 custody; no acceptance carve is authorized.

Engineering/proof retained: False-positive policy ask: missing OAuth applications and MCP clients remain engineering work. Status changes require the normal judge, not this ruling.
