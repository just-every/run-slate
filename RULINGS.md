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

Question: May full members and owners use bounded personal tokens without guest, export or security administration authority?

Adopted/proposed default: Hash only once issued tokens, container read/write within current rights, 90-day default/one year maximum and inert restore.

Outcome: **adopt with rider**. Approve full member/owner personal-token issuance with explicit container scopes bounded by current UI rights, finite expiry, immediate revocation, hash free archives and permanently inactive restored credentials; guest tokens and undeclared privileged operations remain denied until explicitly specified.

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

Outcome: **adopt**. Keep API-004’s complete owner/member administration target unchanged and partial; retain visibility, once issued secrets, fresh session proof, immediate revocation and activity history, and implement OAuth/MCP administration under the same declared ownership boundary.

Why: This is principally an engineering/status carve request, not an unresolved custody policy. Confluence documents token administration and immediate revocation; absence of an app type is unfinished coverage, not grounds for a scope carve or DONE promotion.

- [Source 1](https://support.atlassian.com/atlassian-account/docs/manage-api-tokens-for-your-atlassian-account/): Confluence account tokens may be scoped, are shown once and revoke immediately; new-token expiry is configurable from one day to one year.

Main evidence: `CONTRACT.md:1527` at `aa03efc5900ec95b739958411506d78d343176b7`.

Placement: API-004 owns administration visibility only and cites API-001 custody; no acceptance carve is authorized.

Engineering/proof retained: False positive policy ask: missing OAuth applications and MCP clients remain engineering work. Status changes require the normal judge, not this ruling.

### RL-4 — Complete category target

Date: 2026-10-16 · Ruled by: owner · Governs: SAVE-006, PAGE-001, PAGE-009, BLOCK-005, BLOCK-006, BLOCK-007, BLOCK-008, SEARCH-001, WORK-015, NAV-006, NOTIF-003, MAIL-001, IMP-003, PORT-007, FLAG-001, ADMIN-007

The owner directed on 16 October 2026 that every seed's contract describe a genuine competitor to its category's incumbents. This amendment records which published clauses the target changes. It removes no requirement and no assertion, and none of these clauses is renumbered.

Affected IDs: `SAVE-006`, `PAGE-001`, `PAGE-009`, `BLOCK-005`, `BLOCK-006`, `BLOCK-007`, `BLOCK-008`, `SEARCH-001`, `WORK-015`, `NAV-006`, `NOTIF-003`, `MAIL-001`, `IMP-003`, `PORT-007`, `FLAG-001`, the [Out of scope](#out-of-scope) list, and the core-wiki launch amendment's disabled-surface list. Their mirrors in `RELEASE.json`, `seed.json` and `tests/requirements` change when a build round implements the target clauses below. This document changes no code.

Replacement behavior:

- **Live co-editing becomes the default.** It is no longer an optional deployment choice (`SAVE-006` → `COLLAB-001` to `COLLAB-005`).
- **Labels can be filtered and searched** (`PAGE-001` → `SEARCH-010`).
- **SAML SSO and SCIM provisioning** join the OIDC identity provider (`WORK-015` → `ADMIN-001`, `ADMIN-002`).
- **Native apps join the responsive client.** Native iOS, Android and desktop apps with offline pages and push notifications are added (`NAV-006` → `MOBILE-001` to `MOBILE-004`).
- **Chat delivery widens** from one Slack destination to several, across Slack, Microsoft Teams and Nook (`NOTIF-003` → `CHAT-001`).
- **Notification email and digests join sign-in and invitation mail** (`MAIL-001` → `NOTIF-005`, `NOTIF-006`). A workspace owner sets the default delivery for each event kind, and a member's own choice, including an unsubscribe, overrides it. A new workspace starts with Confluence's defaults (mentions and replies by immediate email, watched changes as a daily digest); a workspace upgraded from an earlier version sends only sign-in and invitation mail until an owner sets a default.
- **Cited answers become part of the default product** once an owner configures a provider and turns AI on. The core-wiki profile then no longer hides them (`AI-001`, `AI-015` → `ANSWER-001`). Until a build round meets `ANSWER-003`, the core-wiki profile keeps refusing AI surfaces as it does today.
- **Every target and push-further clause ships in the default product** (`ADMIN-007`). The core-wiki launch amendment's disabled-surface list no longer hides any surface that a target clause needs: Ask and AI writing and answers (`ANSWER-*`, `AI-016`, `AI-017`, `DB-016`), suggestions (`SUG-001`, `SUG-002`, used by `API-003` and `KEEP-002`), the external-agent and MCP surface (`API-003`), source connectors (`CONNECT-*`, `SEARCH-012`, `CHAT-002`, `EMBED-*`, `AUTO-007`), the runs, skills, claims and impact tracing that `KEEP-001` to `KEEP-010` use, live co-editing sockets (`COLLAB-*`), and the intelligence and connector jobs those clauses dispatch. Each surface is turned on by an owner action (an AI provider with AI on, a connected connector, a client grant), never by `SLATE_PROFILE`, and stays refused with `FEATURE_DISABLED` until its own safety acceptance passes. Each target clause's acceptance runs in the default profile; evidence produced under `SLATE_PROFILE=flagship` never satisfies a target clause. Inquiry, experiments, trials and production effects (`INQ-*`, `TRIAL-*`, `EFFECT-002`) stay the flagship extension.
- **Tasks gain assignees, due dates, My tasks and task reports** (`BLOCK-007` → `BLOCK-015`, `BLOCK-016`, `NAV-007`). Task items stay blocks and still never appear in a database view.
- **Watching widens** to whole containers and to pages a member creates or edits (`PAGE-009` → `PAGE-016`, `CONT-012`).
- **Confluence imports map every common macro, diagram, task and space permission** to a named Slate equivalent (`IMP-003` → `IMP-010`, `IMP-011`). The body gains a table-of-contents block and status labels (`BLOCK-006` → `BLOCK-017`, `BLOCK-018`), and diagrams.net diagrams become native (`BLOCK-019`).
- **Mentions reach groups** (`BLOCK-005` → `BLOCK-020`), and **page export adds Word** (`PORT-007` → `PORT-010`).
- **Attached files preview, keep versions and are searchable** (`BLOCK-008` → `BLOCK-021`, `BLOCK-022`; `SEARCH-001` → `SEARCH-013`). A PDF, Office or OpenDocument attachment opens in an in-page and a full-screen viewer; the raw file keeps `BLOCK-008`'s download disposition, and only the sanitized preview rendition Slate derives from it is served inline as a display request. Uploading a file with the same name to the same page creates its next version. Global search also matches the text inside attachments. `SEARCH-001`'s 500ms bound and every `SEARCH-005` exclusion apply to that text.
- **Personal notifications reach chat** (`NOTIF-003` → `CHAT-004`). Beside the owner-configured channel messages, a member who links their Slack, Teams or Nook identity can receive their own notifications as direct messages from the Slate app.
- **Confluence personal spaces become personal containers** where the space's owner maps to a member (`IMP-003` → `IMP-012`), instead of private containers owned by the importing member.
- **Old Confluence links keep working after cutover** (`IMP-003` → `IMP-013`, `IMP-014`, `SEARCH-014`, `EMBED-006`). Every Confluence import keeps its map from source page, blog post, space and attachment to Slate record, and Slate answers old Confluence URLs itself at an authenticated route, at an old hostname the buyer owns, in search, in pasted links, in chat unfurls and through the browser extension (`CARD-002`). Links between spaces imported in separate passes are rewritten when the target space arrives, instead of resolving only within one import, and an optional reviewed cutover step re-points the Jira issue links that pointed at migrated Confluence pages.
- **FLAG-001 stays the gate for the full flagship.** The category target sits beside it: the target clauses are the product's requirements, while the inquiry and trial extensions stay flagship requirements.

Security consequences:

- **Co-editing** moves live sockets into the default attack surface. `COLLAB-001` therefore requires the per-operation access recheck, revocation within five seconds and durable attributed operations that `SAVE-006` already demanded.
- **Notification email and push payloads** carry a page title, a link and, for watched changes, counts of what changed, and never a body. Section headings appear in a change summary only when a workspace owner turns that on (`NOTIF-005`), and never block or comment text. Recipient access is rechecked at send, and a title or heading the recipient cannot read is never sent.
- **SCIM bearer tokens and SAML signing certificates** are new secrets. They are covered by `BASE-SECRET-001`/`002` and are excluded from exports under `PORT-005`.
- **Personal access tokens, OAuth apps, webhooks and MCP clients** each act as exactly one member and never widen that member's access (`API-001` to `API-004`).
- **Offline copies on devices** are encrypted at rest by the operating system and erased on revocation or remote sign-out at the next connection (`MOBILE-003`). An offline copy is never a source for answers or exports.
- **Default-profile AI, MCP, connectors and suggestions** keep every `AI-*`, `SOURCE-*`, `SUG-*` and `CONNECT-002` guarantee. Moving a surface into the default product relaxes none of them (`ADMIN-007`).
- **Issue backlinks** write a Slate page's title and URL into Jira or Vector under the acting member's linked account (`EMBED-005`). A page in a `private` or `personal` container, a draft, or a page under a Confidential classification gets the neutral title "Slate page" instead, and opening a backlink still requires Slate access.
- **Task assignments, group mentions and shares with a message** never notify a member who cannot read the page; the actor is asked to share the page or cancel (`BLOCK-015`, `BLOCK-020`, `SHARE-009`).
- **Imported space permissions** become container grants only through reviewed principal mappings, never widen access when a source permission has no Slate level, and never publish anonymous access (`IMP-011`, `PORT-005`).
- **The diagrams.net editor** is served from the deployment's own origin and sends diagram content to no third party (`BLOCK-019`).
- **Attachment previews** are renditions of untrusted files. Slate renders them itself and never sends a file to a third-party viewer. A rendition runs no script or macro from the file, fetches no external reference, and is served same-origin in a sandboxed frame under a content security policy that allows no third-party request. Rendition and text extraction run as bounded jobs within `seed.json → limits`, and a file that fails to render shows its download state with the reason, never a partial rendition (`BLOCK-021`).
- **Attachment text in search and answers** is page content. It is never shown to a member who cannot read the page, and it is never counted in a total or facet they see (`SEARCH-013`, `SEARCH-005`). It is untrusted content to every AI run (`AI-007`).
- **Chat direct messages** carry the event kind, the actor, the page title and a link, never a page body or comment text. Recipient access is rechecked at send, and a member's chat identity link is a credential that unlinking or removal (`WORK-007`) revokes from the next event (`CHAT-004`).
- **Old-URL resolution** reveals no more than `LINK-004` allows. The resolver answers only signed-in members and guests, redirects to the record's permanent URL where the normal access check runs, and tells an unmapped URL apart only by naming the source space key the URL or the import records carry, never a page title. Lookups are rate-limited per member (`seed.json → limits.legacyLinkLookupsPerMinute`). An old hostname pointed at the deployment serves only redirects to the main origin: it sets no cookie, serves no app, API or file, and resolves nothing itself (`IMP-013`).
- **Cutover link rewriting** changes only link targets. Back-filled links (`IMP-014`) grant no access, keep every native edit and are reverted by Undo, and the Jira re-pointing step (`EMBED-006`) writes only under the running member's linked Jira account, previews every change, records each one in the run log and is reversible.
- **The Slate for Jira app** (`EMBED-008`) holds no Slate content. It asks Slate for each title and page list as the viewing Jira user's linked Slate identity, and shows "Restricted Slate page" when that identity cannot read the page.
- **Team-built agents** (`KEEP-010`) read only the intersection of their declared scope and what the member they run for may read, keep every `AI-*` guarantee, and can never verify, publish or change access.
- **No existing protection is relaxed.** `LIFE-002`, `SEARCH-005`, `AI-011`, `AI-013`, `STAT-003`/`004` and the container vetoes in `WEB-001` stay absolute under every target clause.

### RL-5 — Separate core-wiki release gate

Date: 2026-10-06 · Ruled by: owner · Governs: FLAG-001, ADMIN-007

The amendment dated 6 October 2026 authorizes the `core-wiki`
deployment profile as the default launch scope. This is a deployment choice,
not a ninth content policy, subscription tier or deletion of flagship requirements.
`SLATE_PROFILE=flagship` explicitly opts into the retained development surfaces;
it does not certify them. AI and SSO retain their separate default-off switches.

Core wiki retains native sign-in, membership and access, pages and blocks, trees,
comments, revisions, manual decisions, containers, structured records, templates,
manual publication, archive and erasure, ranked search, notifications, import,
export and restore. Every applicable baseline and all eight content policies
remain binding. Publication relocation, erased filename removal, prior-store upgrade,
complete portability and the original qualification suites are launch gates.

The default profile exposes no Ask, AI writing/answers, runs, inquiry, experiment,
claim, skill, impact, effect, external-agent/MCP, source-connector or suggestion
surface. Their direct APIs refuse with `FEATURE_DISABLED` after authentication;
UI links and panels are unavailable. Live co-editing sockets are disabled, while
ordinary block editing, presence and committed-content refresh remain available.
Intelligence and federation cron dispatch is disabled; previously queued jobs
refuse visibly without provider dispatch or success acknowledgment. Profile
changes erase no stored records, grant, receipt or applied migration. Export,
restore and erasure must still cover retained flagship records.

The amendment changes release scope under FLAG-001 only. SUG-001/002, SOURCE-001
through SOURCE-006, SKILL-001 through SKILL-003, EFFECT-001 through EFFECT-003,
AGENT-001/002, INQ-001 through INQ-005, TRIAL-001 through TRIAL-004 and the
flagship aspects of SAVE-006, DB-002, WEB-001, NOTIF-001 and AI-001 through
AI-017 remain requirements pending their full acceptance. Disabled capability is
not satisfied capability. FLAG-002/003/004 and the six complete journeys remain
the full flagship gate; no provider or prospective-value claim follows from a
core-wiki release. See ACCEPTANCE.md for the distinct evidence requirements.

Target (16 October 2026): the [Target amendment](#target-amendment--16-october-2026) narrows the disabled-surface list above. A surface that a target or push-further clause needs leaves the list when that clause's build round lands. It is then turned on by an owner switch in the default profile (`ADMIN-007`), not by `SLATE_PROFILE=flagship`, and until then it keeps refusing as described above. Inquiry, experiments, trials and production effects stay flagship-only.
