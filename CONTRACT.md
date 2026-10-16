# CONTRACT.md — Slate

What this product does. Every clause has a stable ID and requires tagged observable evidence. A clause without executed acceptance evidence remains uncovered; code presence or a green foundation check is not satisfaction. See `ACCEPTANCE.md` for the full release gate. Security, privacy, and operational guarantees are in `BASELINE.md`; a clause here may supersede one of them by naming its `BASE-` ID. `BLOCK-008` supersedes `BASE-INPUT-003`'s download disposition, narrowly and with its own test; no other clause supersedes a baseline clause. Capacity and rate limits are in `seed.json → limits`. Times are p95 at those limits. Clauses marked *Policy* have a default that buyers may replace through the named extension point. There are eight, they are the eight divergences between the products in this family, and each names both profiles and what each one shows and hides. A rule that can be written down is written down instead of becoming a ninth.

## Scope

A knowledge workspace for one business: the family a Notion user and a Confluence user both arrive from. The primary record is a page — a title, an icon, a cover, a byline and a body of blocks — living in a tree inside a container, commented on in place, versioned, shared with named people and groups, and exposed to the anonymous web only by an explicit act. Members organise pages into containers, keep structured records in the same tree, search everything they may read, and ask AI over the same boundary. Slate replaces Notion, Confluence and Guru: it imports each product's own export (Guru under `IMP-008`), ships Notion's conventions as its defaults, and reaches Confluence's through the eight policies below. It is one product, not a suite. The accepted full flagship adds federated operational memory, authorized skills and effects, collaboration, and sustained inquiry through reproducible experiments and reusable learning. The complete flagship still requires all six USER-JOURNEYS.md journeys, FLAGSHIP-DELIVERY.md and the FRONTIER-EXTENSION.md inquiry loop. The 6 October 2026 core-wiki launch amendment below separately authorizes a core-wiki launch candidate without claiming flagship acceptance. Requirements are accepted; implementation, provider and release acceptance remain pending independent evidence. Exclusions appear below.

The words in this contract are the family's, not either product's. A **container** is what Notion calls a teamspace and Confluence a space. A **record** is what Notion calls a page in a database and Confluence an entry. A **page body** is what Notion calls blocks and Confluence elements or macros. A **member** is a person with an account in the workspace; `BASELINE.md` calls the same person an operator, and the two words mean one thing. An edition relabels these words; no clause changes when it does.

## Product target — 16 October 2026

Slate is the owned company wiki and knowledge workspace a US small or mid-size team buys instead of a Confluence space, a Notion wiki or a Guru knowledge base: real-time block editing, spaces and page trees, databases, permission-aware search and cited AI answers, kept current by verification and by agents that notice when knowledge has gone stale. This contract describes that product, which is what Slate is being built towards, and marks how close the current code is (see [Status](#status)).

| | |
| --- | --- |
| Category | Team wiki and knowledge management |
| Incumbents a buyer switches from | Confluence, Notion, Guru |
| Up-and-comers it must also beat | Slite, Outline, Glean (and Dust for team agents) |
| First buyer | A US team of 20 to 500 people moving a Notion wiki, a Confluence space or a Guru knowledge base; costs in USD, no per-seat pricing, the buyer's own Cloudflare account |
| What switching means | Their content arrives with its hierarchy, links, comments, owners and an explicit list of what did not map; every daily job (writing together, organising, finding, asking, verifying, reviewing) has a Slate equivalent; their chat, issue tracker, file store and identity provider plug in; their admins keep SSO, SCIM, audit, guest control and analytics |

A buyer replacing an incumbent needs the whole job, so the target is the whole job:

- **Write together.** Live co-editing with presence and cursors (`COLLAB-001` to `COLLAB-005`), rich blocks, tables, synced blocks, columns, a table of contents, status labels, equations and diagrams including diagrams.net (`BLOCK-001` to `BLOCK-020`), attached files with in-browser previews, versions and full-text search (`BLOCK-021`, `BLOCK-022`, `SEARCH-013`), comments, person and group mentions, assigned tasks with due dates, My tasks and task reports (`BLOCK-015`, `BLOCK-016`, `NAV-007`), reminders, suggestions and page locks.
- **Organise.** Spaces (containers) with page trees, labels, starter and custom templates, blogs, a company hub, and watching of pages and whole containers with autowatch (`PAGE-016`, `CONT-012`), plus databases with relations, rollups, formulas, board/calendar/timeline views, forms and dashboards (`DB-001` to `DB-016`).
- **Find and ask.** Ranked permission-aware search that prefers verified current pages, and cited AI answers in the product, in chat and over MCP that never use a page the asker cannot read (`SEARCH-*`, `ANSWER-*`, `AI-*`).
- **Keep it true.** Owners, review dates, verification and lapse, expert review queues, verification rules, Guru-style knowledge cards, agents that find contradicted or stale pages and propose exact fixes for a human to accept, and agents a team builds for itself under the same controls (`STAT-*`, `CARD-*`, `KEEP-*`, `KEEP-010`).
- **Connect.** Slack, Microsoft Teams and Nook; Jira and Vector; GitHub and GitLab; Google Drive, SharePoint/OneDrive and Chest; Figma, Miro, Lucid and Loom embeds; the issues that link to each page and a Slate for Jira app that renders Slate links and lists a space's pages in the Jira project (`EMBED-007`, `EMBED-008`); personal notifications as chat direct messages (`CHAT-004`); a public REST API, webhooks, an MCP endpoint, and published Zapier and Make apps (`CHAT-*`, `EMBED-*`, `CONNECT-*`, `API-*`).
- **Administer.** Roles, groups, guests, SAML SSO, SCIM, audit export, content governance, workspace analytics and workspace notification defaults (`WORK-*`, `ADMIN-*`, `NOTIF-006`). Every one of these surfaces, and every AI, connector and MCP surface, ships in the default product and is switched on by an owner (`ADMIN-007`).
- **Move in and out.** Notion, Confluence, Guru, Google Docs, Word and SharePoint imports, with Confluence macros, diagrams, tasks and space permissions mapped to named Slate equivalents (`IMP-010`, `IMP-011`); old Confluence links that keep working after the Confluence site is cancelled, because Slate resolves old URLs itself, back-fills links between spaces migrated in separate passes and re-points the Jira links to migrated pages (`IMP-013`, `IMP-014`, `SEARCH-014`, `EMBED-006`); and complete exports, including Word, and restores (`IMP-*`, `PORT-*`).
- **Anywhere.** The responsive web app, native iOS and Android apps, a desktop app, offline pages and push notifications (`NAV-006`, `MOBILE-*`).

### Neighbouring products stay separate

Slate is one product. Where the market sells a neighbouring product separately, Slate connects to it and does not rebuild it; when the neighbour is a Run Edit Run sibling, Slate links to that sibling first and to the US incumbent second.

| Job | Owned by | How Slate meets it |
| --- | --- | --- |
| Issue tracking and sprints | [Vector](https://github.com/just-every/run-vector) (or Jira, Linear) | Live issue embeds, create-issue-from-text, backlinks, issues that link here, re-pointed Confluence links, the Slate for Jira app and issue-triggered automations (`EMBED-001`, `EMBED-005` to `EMBED-008`, `AUTO-007`) |
| Team chat | [Nook](https://github.com/just-every/run-nook) (or Slack, Microsoft Teams) | Notifications, unfurls, ask-in-chat and capture-to-page (`CHAT-001` to `CHAT-003`) |
| File storage and sync | [Chest](https://github.com/just-every/run-chest) (or Google Drive, SharePoint) | Live file cards, embeds and connected search (`EMBED-004`, `CONNECT-001`) |
| Large relational databases and internal apps | [Cradle](https://github.com/just-every/run-cradle) (or Airtable) | Wiki-scale databases inside pages, within `seed.json → limits` |
| Standalone forms and surveys | [Pencil](https://github.com/just-every/run-pencil) (or Typeform) | Database intake forms only (`DB-013`) |
| Courses and training records | [Beam](https://github.com/just-every/run-beam) (or TalentLMS) | Reading paths built from wiki pages (`KEEP-007`) |
| Customer-facing help centre and ticket deflection | [HappyToHelp](https://github.com/just-every/run-happytohelp) (or Zendesk) | Published pages and cards that HappyToHelp can cite (`WEB-*`, `API-003`) |
| IT service desk knowledge | [Linen](https://github.com/just-every/run-linen) (or ServiceNow) | Pages Linen cites through the API |
| Identity provider | [Auth](https://github.com/just-every/run-auth) (or Okta, Microsoft Entra ID) | SAML service provider and SCIM client (`ADMIN-001`, `ADMIN-002`) |
| Workflow automation across apps | [Crank](https://github.com/just-every/run-crank) (or Zapier, Make) | Webhooks, REST API, in-product rules, and published Zapier, Make and Crank apps (`API-001`, `API-002`, `API-005`, `AUTO-*`) |
| Product feedback boards | [Penny](https://github.com/just-every/run-penny) (or Canny) | Not rebuilt; pages link to feedback items |
| Compliance automation | [Evidence](https://github.com/just-every/run-evidence) (or Vanta) | Policy pages with owners and review dates that Evidence reads |

Cross-functional task and project management (Asana, monday.com, ClickUp) belongs to no sibling. Slate's databases can hold a lightweight tracker, but Slate does not become a project-management product.

### How to read this contract

- **Published clauses** are the `- **ID — Title.**` bullets in the sections from [Public landing](#public-landing) to [Full flagship and sustained inquiry](#full-flagship-and-sustained-inquiry). Each is registered in `seed.json → capabilities`, `tests/e2e/contract-coverage.test.ts` and `tests/requirements/clause-inventory.json`, and is checked by `scripts/check-contract.mjs` and `scripts/verify.mjs`.
- **Target clauses** are the `#### ID — Title.` headings in [Target clauses](#target-clauses) and [Push further](#push-further). They are binding product requirements that are not yet registered. A build round that starts one registers it in the same change: a `seed.json` capability, a planned `contract.todo` entry, and a clause-inventory entry with its unmet reason. It also turns the heading into a published bullet with the same ID. IDs never change.
- **Status** (in [Status](#status) and after each target clause) is `done`, `partial` or `missing`, judged from the code and tests at commit `8956e45` (16 October 2026). `done` means the behaviour ships in the default `core-wiki` profile and a cited test or journey exercises it. `partial` means some of it ships, or it ships only under the explicit `SLATE_PROFILE=flagship` opt-in, or there is code with no requirement-level test. `missing` means there is no implementation. Status is a build-planning judgement, not acceptance.
- **Acceptance runs in the default product.** Every target and push-further clause's acceptance runs with `SLATE_PROFILE` unset, with only the owner switches that clause names turned on (`ADMIN-007`). A journey that passes only under `SLATE_PROFILE=flagship` leaves the clause `partial`. [ACCEPTANCE.md](ACCEPTANCE.md) still decides acceptance, and the clause inventory still records every published clause as unproven until it is independently verified.

## Target amendment — 16 October 2026

The owner directed on 16 October 2026 that every seed's contract describe a genuine competitor to its category's incumbents. This amendment records which published clauses the target changes. It removes no requirement and no assertion, and none of these clauses is renumbered.

Affected IDs: `SAVE-006`, `PAGE-001`, `PAGE-009`, `BLOCK-005`, `BLOCK-006`, `BLOCK-007`, `BLOCK-008`, `SEARCH-001`, `WORK-015`, `NAV-006`, `NOTIF-003`, `MAIL-001`, `IMP-003`, `PORT-007`, `FLAG-001`, the [Out of scope](#out-of-scope) list, and the core-wiki launch amendment's disabled-surface list. Their mirrors in `RELEASE.json`, `seed.json` and `tests/requirements` change when a build round implements the target clauses below. This document changes no code.

Replacement behaviour:

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
- **Attached files preview, keep versions and are searchable** (`BLOCK-008` → `BLOCK-021`, `BLOCK-022`; `SEARCH-001` → `SEARCH-013`). A PDF, Office or OpenDocument attachment opens in an in-page and a full-screen viewer; the raw file keeps `BLOCK-008`'s download disposition, and only the sanitised preview rendition Slate derives from it is served inline as a display request. Uploading a file with the same name to the same page creates its next version. Global search also matches the text inside attachments. `SEARCH-001`'s 500ms bound and every `SEARCH-005` exclusion apply to that text.
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

## Core-wiki launch amendment — 6 October 2026

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
refuse visibly without provider dispatch or success acknowledgement. Profile
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

## Shared identity with native accounts — owner decision, 10 October 2026

The approved COMMON-LOGIN phases 1–4 supersede the 8 October implementation
exemption. Slate retains **own accounts, sessions and roles**, including its
existing member IDs, group memberships and scoped guests. Base owns the intended
identity proof and dependency protocols. No second owner or operator ledger is
introduced. WORK-008, WORK-009, WORK-010 and WORK-015 remain binding.

Base operator-auth now signs Slate in. The copied Base modules are byte-exact at
`9ec15a63a410d209cd5a179749336bb61751e0f6`. `src/core/features/session/native/`
supplies Base's paired native accounts and proof adapters over Slate's own
`members`, `sessions` and `member_identity_bindings`; the service never creates
Base account or session tables. Admission, proofs and owner lookups are scoped to
the installation's workspace, selected by the server. Member IDs, owner/member
roles, groups, scoped guests and the `slate_session` cookie are unchanged.

- **Email (BASE-ACCESS-001).** `POST /api/auth/magic` asks Base for a one-use
  link (one hour, keyed digest only). GET `/auth/confirm` previews; a same-origin
  POST consumes the proof and issues a 30-day native session in one D1 batch that
  rechecks the member's status, email and authority version. Links sent before
  this release, by either earlier engine, show the request-new-link page.
- **Incumbent provider (WORK-015).** Base's `legacy-rs256` preset keeps the
  configured issuer, client and the registered `/api/auth/identity/callback`, and
  adds exact HTTPS pins for the authorization, token and JWKS endpoints. The first
  provider sign-in binds the issuer/subject to the member whose verified mailbox
  it presents; a binding never moves to another member. Provider sessions last at
  most 24 hours and end when the provider configuration or its pin changes.
- **Authority (WORK-008/009/010).** `member_authority` advances on any email,
  role, kind, status or ownership change. Sessions issued from now on, and every
  pending proof, are fenced at that version. Sessions from before this release
  keep their existing contract: valid until expiry, revocation or removal, with
  the member's current role read on every request. Nobody gains authority.
- **Step-up.** Workspace export, restore, permanent deletion, ownership changes,
  owner removal or erasure, agent credentials and connectors need a Base email
  proof from the last ten minutes in the asking session. Without one, Slate emails
  the member a confirmation link and refuses the attempt; the commit repeats the
  proof check. Amendment — 16 October 2026 (BASE-ACCESS-001, PORT-003/005):
  the native workspace ZIP export alone accepts the signed-in local owner without
  email proof when `LOCAL_DEVELOPMENT=true` and the runtime admits an exact
  loopback origin. Local mail is suppressed. Hosted exports and installation
  archive HTTP exports retain Base step-up. Current owner authorization, complete
  read coverage, origin checks and export identity/ACL commit guards still apply;
  the local exception neither issues nor stores an email proof.
- **Dev identity (SC-05).** The local-only entry `src/dev/server.ts` serves
  key-gated dev sessions for the claimed owner and real `editor` and `guest`
  personas at `<as>@dev.localhost`. Local mail is suppressed; there is no local
  email outbox. Archives exclude sessions and restore every non-owner member inactive.

Slate has no domain rules, passwords or linked dependency providers, so Base's
domain, password-revocation and dependency logout/fence paths have no Slate flow;
those service methods refuse as Base specifies. Invitation acceptance remains
Slate's native account administration.

## HOME-001 amendment — 8 October 2026

The owner asked for the public root to become a marketing landing page. This amendment
changes `HOME-001` only; every other requirement ID and assertion is unchanged.

Affected IDs: `HOME-001`, its mirrors in `seed.json` (capability `public-landing` and
`deploy.publicPaths` notes), `DIVERGENCE.md` item 4, `deploy/REQUEST-OWNERSHIP.md`
and `tests/requirements`. `BASE-PUBLIC-001` to `BASE-PUBLIC-003` still govern the
anonymous surface through the shared baseline and are neither satisfied nor waived by
this change.

Replacement behaviour: the root was an owner identity plate that forbade marketing
claims and any feature tour. It is now a static landing page that describes the
default `core-wiki` product (hero, open source and the MIT licence, pages, databases,
access-aware search, sharing and publishing, revision history, the other core-wiki
capabilities, moving in from another wiki, a closing call to action) around the
owner's mark, name, description, sign-in action and optional credit. Claims are
limited to capabilities the default profile ships; flagship-only surfaces are never
advertised.

Security consequences: none of the plate's protections is relaxed. The root still
reads no workspace record, member identity or session, is matched exactly and lists
no workspace content, is rendered per request, sets no cookie, runs no analytics and
loads only same-origin resources (the typeface is self-hosted and every illustration
is inline). The only new outbound surface is plain navigation links to the source
repository, its guide, its licence and the credit; the page loads nothing from them.
Metrics, testimonials, customer logos and pricing remain forbidden; the page may state
only that there is no per-seat pricing.

Revised 9 October 2026: the owner approved a redesigned page in the 12ui Design
workspace, drawn by hand as inline SVG and HTML with CSS. Affected IDs are unchanged
(`HOME-001` and the mirrors listed above). The replacement behaviour is the section
list above, with the other core-wiki features shown on the page (comments, templates,
verification, inbox, containers, backup and restore) among its sections: the clause now
names the sections and the one illustrated style, and the sample names and pages in the drawings are inline drawings, never workspace records or
member identity. Security consequences: none. The page is still rendered per request,
reads no workspace record or session, sets no cookie, runs no tracking, loads only
same-origin resources (no raster or embedded image, no third-party font) and keeps its
fixed light palette when the document is dark; its motion is optional, CSS-only,
gated on no reduced-motion preference and never loops. The same revision simplifies the decoration: Slate's logo is two stacked cards with no letter, the landing no longer renders the buyer-configured mark and the decorative tick lines are dropped, with no security consequence.

## HOME-001 amendment — first-party documentation and card mark (9 October 2026)

This amendment changes `HOME-001` only; every other requirement ID and assertion is unchanged. It carries two changes to the
landing: Slate's card mark replaces the buyer-configured mark everywhere, and the landing's setup links open first-party
documentation instead of the source repository. The documentation itself is the separate `DOCS-001` addition below.

Affected IDs: `HOME-001` and its mirrors (`seed.json` capability `public-landing` and `deploy.publicPaths` with its notes,
`RELEASE.json`, `DIVERGENCE.md` item 4, `deploy/REQUEST-OWNERSHIP.md` and `tests/requirements`). `BASE-PUBLIC-001` to
`BASE-PUBLIC-003` still govern the anonymous surface through the shared baseline and are neither satisfied nor waived.

Replacement behaviour, card mark: the buyer-configured mark is removed from the owner identity configuration altogether. The
landing header and footer, the sign-in page and the app's sidebar all show Slate's card mark beside the owner's name (the letter
tile on the sign-in page and the glyph in the sidebar are gone), and the favicon is the same card mark, served from the
deployment's own origin as `/favicon.svg`, `/favicon-32.png`, `/favicon.ico` and `/apple-touch-icon.png`, which are declared in
`seed.json → deploy.publicPaths`.

Replacement behaviour, documentation links: the landing's links no longer go to the source repository's readme. "Read the guide"
opens `/docs`, "Deploy your own" and "Read the setup guide" open `/docs/install`, and the header and footer each gain a Docs link
to `/docs`; all of them are client-side links to first-party pages. The source repository link and the credit link stay outbound
navigation. The root lists no workspace content and links only to these targets, the sign-in page, the source repository and,
while the credit toggle is on, the credit; the page's wording, sections and limits are otherwise unchanged.

Security consequences: none beyond four fixed same-origin static files answered by the assets binding, with no session read, no
cookie and no third-party resource, and the documentation links, which are plain same-origin navigation to the public `/docs`
paths declared by `DOCS-001`. The workspace's own `mark` setting in the database is a different thing and is unchanged. No
existing protection is relaxed.

## DOCS-001 addition — 9 October 2026

The owner asked for first-party documentation, so the setup guide the landing links to is no longer the repository's readme.
This addition adds `DOCS-001`; the `HOME-001` link changes it enables are recorded in the amendment above.

Affected IDs: `DOCS-001` (new) and its mirrors in `seed.json` (capability `public-documentation`, and `deploy.publicPaths` with its
notes), `RELEASE.json`, `DIVERGENCE.md` item 4, `deploy/REQUEST-OWNERSHIP.md`, `src/core/app/http-security.ts` (the public-document
rate limit) and `tests/requirements`. Every other requirement ID and assertion is unchanged.

New behaviour: `/docs` and `/docs/<slug>` become public documents. The documentation Markdown is rendered to HTML at build
time, by a Vite plugin, from the files `docs/site.json` publishes: the Overview, Install and deploy, Moving in and Backup and
restore under "Start here", and Email delivery and the Cloudflare footprint under "Run it". Every other Markdown file stays on
GitHub, with a reason in the manifest.

Security consequences: the new public path is a static build artifact. It reads no workspace record, member identity or
session, sets no cookie, loads only same-origin resources, and sits behind the configuration gate and the same
public-document rate limit as the landing, so a misconfigured deployment answers it with `503` and a flood is limited at
the declared rate. Markdown is rendered with raw HTML disabled, a link-scheme allowlist and images restricted to
`docs/media/`, and no Markdown library reaches the Worker or the browser bundle. Published pages are limited to the default
profile by the manifest and its tests. No existing protection is relaxed.

## HOME-001 amendment — the Lobby and the run site (13 October 2026)

The owner decided on 12 October 2026 that every seed has two homepages: an installed instance answers `/` with the shared
Lobby, and the owner-approved landing page becomes the static run site at `run-slate.com`, whose primary action reads
**Run Slate** and opens `/run`. This amendment changes `HOME-001` only; every other requirement ID and assertion is unchanged.

Affected IDs: `HOME-001` and its mirrors (`seed.json` capability `public-landing` and `deploy.publicPaths` with its notes,
`RELEASE.json`, `DIVERGENCE.md` item 4, `deploy/REQUEST-OWNERSHIP.md` and `tests/requirements`). `DOCS-001` is unchanged: an
installed Slate still serves `/docs`, and the run site carries the same pages. `BASE-PUBLIC-001` to `BASE-PUBLIC-003` still
govern the anonymous surface through the shared baseline and are neither satisfied nor waived.

Replacement behaviour: `/` on an installed Slate is Base's Lobby (`src/base/runtime/lobby.ts`, edition identity in
`src/identity.ts`): Slate's mark and name, one line naming the owner's deployment, and Finish setup (to `/setup`) until the
owner finishes first-run setup (`workspaces.first_run_completed_at`, `WORK-013`), then Sign in (to `/signin`). Base's
`GET /setup/state` answers `{"state":"unclaimed"}` or `{"state":"claimed"}` from the same reading. The approved landing page
is unchanged except that its two "Deploy your own" actions read "Run Slate" and open the Run page at `/run`, and the header
pill, footer link and closing link to sign-in are left out. `rer build --site` renders it once (`src/site/pages.tsx`) with the
Run page, the docs and a not-found page, and `rer deploy --site` publishes those static files on `run-slate.com`.

Security consequences: the Lobby and `/setup/state` reveal one fact to anyone, whether the owner has finished first-run setup.
They read no other workspace record, member identity or session, set no cookie, run no script, answer another origin or Host
with the ordinary `404` and send `no-store`; the Lobby's content security policy admits only its hashed style and same-origin
theme, font and image files (one more declared public static path, `/brand/band.svg`, beside the existing `/rer-theme.css` and
`/slate-mark.svg`). The run site is static files built from the edition's source: `rer build --site` refuses a page that links
an instance-only route or loads from another origin, and refuses server code, settings, data, the owner's identity, a secret
or the dev key in its output. No existing protection is relaxed.

## Public landing

- **HOME-001 — Public landing.** An installed Slate answers its public root path (`/`) with the shared Lobby (Base `lobbyResponse`): Slate's card mark and name, one line naming the owner's deployment, and one action, Finish setup (to `/setup`) until the owner has finished first-run setup (`WORK-013`) and Sign in (to `/signin`) after, over Slate's floor art; Base's `GET /setup/state` answers exactly `{"state":"unclaimed"}` or `{"state":"claimed"}` from the same reading. The Lobby and `/setup/state` reveal only that state: they read no other workspace record, member identity or session, set no cookie, run no script, load only same-origin files, answer another origin or Host with the ordinary `404`, are rendered per request and send `no-store`. The product's static landing page is the run site's homepage (`run-slate.com/`), written by `rer build --site` from the edition's own source and configuration with no installation data. Its header and footer carry the configured owner name beside Slate's card logo, the same card mark the sign-in page and the app show beside the owner's name and the deployment serves from its own origin as its favicon (an SVG with PNG fallbacks and an apple-touch icon), the name being the page's only top-level heading, and the footer shows the owner's one-line description. The body is a fixed, owner-editable description of the product in one illustrated style: a hero that says what Slate is, then a section each for open source under the MIT licence, pages, databases, search that respects who is asking, sharing and publishing, revision history, the other core-wiki capabilities (comments, templates, verification, inbox, containers, backup and restore) and moving in from another wiki, and a closing call to action. "Run Slate" in the hero and in the closing call to action opens the run site's Run page at `/run` (install rer, then clone the public source and start it with `rer dev`); a Docs link in its header and footer and a "Read the guide" link open `/docs`, and "Read the setup guide" opens `/docs/install` (the run site carries the same first-party pages as `DOCS-001`); and it links to the source repository. The landing links only to those targets, the source repository and, while the credit toggle is on, the credit, and never to an instance-only route (sign-in, setup, the app or its API). It describes only capabilities the default `core-wiki` profile ships. It may show a static “Powered by Slate · runeditrun.com” link when the buyer-configured credit toggle is on, which is its default. The landing exposes no workspace records or member identity and shows no metrics, testimonials, customer logos, plans or prices (it may say only that there is no per-seat pricing). It sets no cookies and runs no analytics or tracking; every font, style and image is served from the run site's own origin and every illustration, with the sample names and pages in its drawings, is drawn inline, so it loads no third-party resource. It stays readable without scripts and with reduced motion, and keeps its own fixed light palette in a dark-themed browser. Pages published to the anonymous web are served under the published-page prefix and are governed by `WEB-001` to `WEB-007`; the root never lists them.
- **DOCS-001 — Public documentation.** The public paths `/docs` and `/docs/<slug>` serve Slate's first-party documentation: the Markdown files that `docs/site.json` lists as published, in the sections and order it gives, which is the only navigation. The documentation Markdown is rendered to HTML at build time: a Vite plugin renders each page to static HTML when Vite loads it, in a build and in development, and never in the Worker or the browser: the emitted Worker and client bundles contain no Markdown or syntax-highlighting code, and each page is its own lazily loaded chunk that the Worker renders per request inside the landing's own header, footer, paper, ink and typeface. A page has its title as its one top-level heading (the landing's brand heading is not repeated), a section menu, an on-this-page list, previous and next links, tables in labelled scrollable regions and an Edit-on-GitHub link. Every Markdown file at the repository root, under `docs/` and as a top-level `<directory>/README.md` is either published or listed in the manifest as GitHub-only with a reason, and an unlisted file, a broken link or anchor, raw HTML, an image outside `docs/media/` or an absolute build-machine path fails verification or the build. Published pages describe only the default `core-wiki` profile, contain no maintainer-only material, and never advertise a flagship-only surface. The documentation reads no workspace record, member identity or session, sets no cookie, runs no analytics or tracking and loads only same-origin resources. An unknown, miscased or nested slug answers the branded `404`, a misconfigured deployment answers `/docs` with the same `503` as the landing, and `/docs` shares the landing's public-document rate limit.

## Workspace and members

- **WORK-001 — One workspace.** A deployment holds exactly one workspace and every container, page, record and comment belongs to it. Its name and mark are editable in settings and shown in the app header. No interface or endpoint creates a second workspace.
- **WORK-003 — Member management.** Members are invited by email address and removed in settings. A workspace owner may invite any person and remove any member other than the setup member; a member may invite and may remove no one. The member created at setup can be removed only by themselves, and `WORK-007` rejects removing the last workspace owner. No policy value, extension, automation or AI action changes any of this.
- **WORK-006 — Invitations.** An invitation is single-use, can be revoked before it is used, and can no longer be accepted 7 days after it was sent; an expired invitation is retained, not deleted. Requesting an invitation returns the same response whether or not the address already belongs to a member.
- **WORK-007 — Removal.** Removing a member revokes their sessions and unused invitations immediately, removes their personal grants from every page and container, archives their personal container and its pages (`CONT-005`) rather than exposing or deleting them, leaves each page they owned with no owner and offers reassignment in bulk (`CONT-006`), and keeps their name on existing activity until personal-data erasure anonymises it (`BASE-DATA-003`). Removing the only remaining workspace owner is rejected.
- **WORK-008 — Roles.** A member is a workspace owner or a member. Workspace owners administer the workspace: settings, members, groups, guests, containers they are not in, and the site-wide switches in `CONT-007`. Every other permission comes from a grant on a page or a container (`SHARE-001`, `CONT-009`), never from the role.
- **WORK-009 — Groups.** A workspace owner can create a named group, add and remove members, and use it as a grant principal anywhere a person can be used. Changing a group's membership changes access at once and writes one activity entry, and deleting a group removes its grants without touching the grants of its members.
- **WORK-010 — Guests.** A guest is a person invited to named pages or containers only. A guest is outside the member count and the member list, reaches nothing but what they were granted, and cannot see the container index, the workspace member list, or search results beyond their grants. A container may forbid guests (`CONT-007`).
- **WORK-011 — Workspace settings.** Settings are a shell with its own navigation, holding workspace identity, members, groups, guests, the status vocabulary, published-page and guest switches, connected services, AI, import and export. It is separate from a container's own settings shell (`CONT-004`), and a change in one never silently changes the other.
- **WORK-012 — Theme.** Light, dark and follow-the-system are offered, apply to every operator surface including editors, and persist per member across sessions and devices. The anonymous read view uses the published page's own theme (`WEB-002`), never the reader's member setting.
- **WORK-013 — First run.** An owner claimed through RER’s verified bootstrap or signed claim receives the configured deployment name, a General space and a Welcome page atomically, with first run complete; the name, space and page remain editable. RER currently does not convey its independently renamed app name. A local deployment runs a short wizard that names the workspace, creates the first container and its first page, and ends on an invitation step that can be skipped. It runs once, is never shown to a member who joins later, and creates nothing beyond those three records. Its native owner wizard lives at `/setup`: unfinished owners are redirected there from operator app routes after sign-in; completed setup and later members proceed to `/app`. The same native session and owner authorization guard the route and completion API.
- **WORK-014 — Shortcut reference.** One reference lists every keyboard shortcut and every typed formatting shortcut the editor accepts, is reachable from anywhere in the operator app by a single shortcut, and matches what the editor actually does.
- **WORK-015 — Identity provider.** Sign-in is by the baseline's magic link (`BASE-ACCESS-001`) and, when a workspace owner configures one, by an identity provider through `identity.provider.v1`. A provider sign-in creates no member who was not invited or allow-listed, and an unconfigured or failing provider leaves magic-link sign-in working and says which is unavailable. There is no password, no security question and no account-recovery path, because `BASE-ACCESS-001` stores no password: access to the mailbox is the credential, and the identity provider is the only alternative to it. A member who has lost their mailbox is re-invited at a new address (`WORK-003`), which is not a recovery flow and does not restore their old sessions. Target (16 October 2026): SAML single sign-on and SCIM provisioning are `ADMIN-001` and `ADMIN-002`.

## Editing and saving

- **SAVE-001 — Durable save state.** An editor shows Saving until the write and its activity entry are committed, then shows Saved within 2 seconds of the commit.
- **SAVE-002 — Failed writes.** A failed write leaves the editor in a failed state, never Saved. It keeps the unsent value, names the failure, and offers an explicit retry.
- **SAVE-003 — Revision conflicts.** Every edit is submitted with the revision it began from: the block's revision for a body edit, the page's for a title, property, structure or order change. An edit against a superseded revision is rejected with 409, keeps the local draft, and offers compare, reload, or explicit overwrite. Slate never resolves a conflict by last write wins.
- **SAVE-004 — Network loss.** While the server is unreachable the editor shows Offline and keeps the unsent draft in browser storage as recovery only. A recovered draft is labelled unsaved and never appears in the tree, in lists, in search, or in export as workspace data.
- **SAVE-005 — Operation keys.** Every mutation accepts an operation key. Repeating a key with the same body within 24 hours returns the first response and creates no second record, notification, AI run, publish, import, or activity entry; repeating it with a different body is rejected with 409.
- **SAVE-006 — Concurrent editing and optional co-editing.** Different blocks can be edited concurrently; revision conflicts retain SAVE-003 and unsent text. Committed blocks refresh within ten seconds without replacing a reader’s unsaved block. A page shows who has it open. Deployments may enable real live co-editing, shared cursors and presence with durable accepted operations, current ACL checks, revocation, reconnect recovery and attributable revision history. Co-editing never silently loses an accepted edit or converts unconfirmed local text into Saved. The full flagship acceptance exercises real co-editing; a deployment may keep it disabled. Target (16 October 2026): live co-editing becomes the default behaviour, specified by `COLLAB-001` to `COLLAB-005`.

## The page

- **PAGE-001 — What a page is.** A page has an identifier, a title, an optional icon, an optional cover, an owner, contributors, created and updated times, a container, a position in that container's tree, a body (`BLOCK-001`), a lifecycle state (`LIFE-001`), grants (`SHARE-001`), a revision (`REV-001`) and a set of labels. A label is a short text tag, unique on the page, added and removed by anyone with edit access, shown in the page's details (`PAGE-007`), carried through import (`IMP-003`) and through export and re-import (`PORT-001`, `PORT-002`, `PORT-007`), and never discarded; filtering and searching by label is target clause `SEARCH-010`. A database record is a page (`DB-010`), and every comment thread, revision, decision record and public exposure record names exactly one page.
- **PAGE-002 — Creation.** A member with edit access on the destination can create a page blank or from a template (`TMPL-003`), from the tree, from the global create action, or as a child of an open page. It is created in exactly one container at one position, and its initial lifecycle state follows `LIFE-006`.
- **PAGE-003 — Identity survives everything.** A page keeps its identifier for its lifetime. Renaming it, editing it, moving it within or between containers, archiving, trashing, restoring, publishing and unpublishing never change it, and every link, mention, citation, content query and search result continues to resolve to it (`LINK-001`).
- **PAGE-004 — Move.** A member with edit access on both places can move a page to another position, another parent, or another container, choosing the destination from a searchable picker. Children move with it, grants are re-resolved against the new parent and the change is shown before it is applied, and comments, versions and links are unchanged.
- **PAGE-005 — Duplicate.** Duplicating a page copies its title, icon, cover, body and properties into a new page with a new identifier, optionally including its children. It copies no comment, version, watcher, analytics figure, grant beyond the destination's inheritance, or public link.
- **PAGE-006 — Icon and cover.** A page takes an icon from emoji, a supplied icon set or an upload, and a cover from a gallery, an upload or a link. Both are removable, both render in the tree and in search results where the surface has room, and neither is required.
- **PAGE-007 — Details.** A page's details show its owner, creator, contributors, created and updated times, length, status (`STAT-002`), labels (`PAGE-001`), views (`PAGE-013`) and the pages that link to it. A member with `full` access can reassign the owner, which changes no grant and writes one activity entry.
- **PAGE-008 — Favourite.** A member can favourite a page or a container and unfavourite it. Favourites are personal, are listed in the navigation (`NAV-003`), and are visible to no other member.
- **PAGE-009 — Watch.** A member can watch a page, and watches it implicitly after commenting on it until they stop. A watched page delivers its comments, replies and published changes to that member's inbox (`NOTIF-001`). Watching is personal and a member's own action never notifies them. Target (16 October 2026): `PAGE-016` also watches a page its creator or editor creates or edits, and `CONT-012` watches a whole container.
- **PAGE-010 — Outline.** A page shows an outline built from its headings that reflects the current body within 2 seconds of an edit, and selecting an entry scrolls to that heading. A page with no headings shows no outline rather than an empty one.
- **PAGE-011 — Present.** Present mode fills the screen, paginates the page by its top-level headings, and shows no navigation, comments or editing affordances. Leaving it returns to the same scroll position.
- **PAGE-012 — Page display options.** Each page carries its own typeface from a fixed set, small-text and full-width toggles, and these are stored on the page and are the same for every reader. They change no stored content and survive export and import.
- **PAGE-013 — Analytics.** A page records total views and unique viewers over time with the members who viewed and edited it, and a container rolls the same figures up over its pages. Both scopes ship and neither is gated by a plan, a role beyond read access to the page, or a policy. A member's own views of their own page are counted and labelled as such, and analytics never expose a viewer a member could not otherwise see.
- **PAGE-014 — Reactions.** A member can add and remove an emoji reaction on a page and on a comment (`COMM-005`). Reactions show who reacted, are not notifications, and are not counted in analytics.

## The page tree

- **TREE-001 — A nested tree in a container.** Every container holds one tree of pages of unlimited depth. A node shows its icon, title and whether it has children, expands and collapses, and remembers its expansion per member. A page has exactly one parent — a page or the container root — and appears in exactly one place.
- **TREE-002 — Reordering and nesting.** A member with edit access can reorder a page among its siblings and re-parent it by dragging or through `PAGE-004`. Order is explicit and stored, is the same for every member, and never changes as a side effect of an edit, a rename or a publish.
- **TREE-003 — Shared with me.** A member's navigation lists pages granted to them individually that sit in containers they are not a member of, with their container named. Removing the grant removes the entry within the same load.
- **TREE-004 — Filter the tree.** Each container's tree carries a filter over page titles that narrows the visible nodes while keeping their ancestors, matches within 200ms of typing, and clears in one action without changing expansion state.
- **TREE-005 — Create in place.** A page can be created at the foot of a tree, as a child from any node's own actions, and from one global create action available on every operator screen. Each names the destination before creating.

## The page body

- **BLOCK-001 — A body of blocks.** A page body is an ordered tree of typed blocks, each with an identifier, a type, content, and optional children. Every block has a drag handle, can be reordered and nested, can be selected with its neighbours, and can be duplicated or deleted. Block identifiers survive editing, moving and export, and an anchored comment (`COMM-001`) points at one.
- **BLOCK-002 — Inline text.** Text in a block carries bold, italic, underline, strikethrough, inline code, colour, links, and mentions, and nothing else. It is stored in one format, rendered under `BASE-INPUT-002`, and round-trips unchanged through page export, workspace export and import.
- **BLOCK-003 — The insert menu.** Typing `/` at the cursor opens an insert menu grouped by kind, filtered by what is typed, navigable and selectable by keyboard alone, and it inserts at the cursor without leaving the editor. Every block type this contract names is reachable from it, and on a touch client the same list is reachable from a labelled control above the keyboard.
- **BLOCK-004 — Markdown shortcuts.** Typed Markdown converts as it is written — headings, lists, quotes, code fences, dividers, bold, italic and inline code — and each conversion is undone by one undo without losing the typed characters. The reference in `WORK-014` lists every shortcut the editor accepts.
- **BLOCK-005 — Mentions.** Typing `@` offers people, pages and dates in one list. A person mention notifies them (`NOTIF-001`) and renders their name; a page mention renders the page's current title and follows renames and moves (`LINK-003`); a date mention renders in the reader's locale. Target (16 October 2026): `BLOCK-020` adds group mentions.
- **BLOCK-006 — Structured blocks.** The body carries headings, bulleted, numbered and toggle lists, quotes, dividers, callout panels, expandable sections, tables with header rows, and code blocks with a language and copy action. Each survives export and import and each has a Markdown or import equivalent named in `IMP-002` and `IMP-003`. Target (16 October 2026): a table-of-contents block (`BLOCK-017`), status labels (`BLOCK-018`) and diagrams.net diagrams (`BLOCK-019`) join them, and `IMP-010` names the Confluence macro each one replaces.
- **BLOCK-007 — Task items.** A checkable item in the body toggles for anyone with edit access, records who completed it and when, and is counted where the page shows a completion figure. It is a block, not a record in a database, and it never appears in a database view. Target (16 October 2026): `BLOCK-015` adds an assignee and a due date, `NAV-007` a My tasks view and `BLOCK-016` task reports; a task item stays a block and still never appears in a database view.
- **BLOCK-008 — Media blocks.** Images, video, audio and file attachments are inserted by upload, by link, or from a configured stock source, each with an optional caption and an alt text field, and stored under `BASE-INPUT-003`. This clause supersedes `BASE-INPUT-003` on disposition alone. A file requested for display — an image, video or audio block, a page icon or cover (`PAGE-006`), or either of those behind a published page (`WEB-003`) — is served inline with its declared content type; every other request for a stored file, including every file attachment and every direct request for a media file, is served with a download disposition. Both dispositions send the declared content type and `X-Content-Type-Options: nosniff`, and an SVG is sanitised under `BASE-INPUT-002` before it is served inline. Disposition changes nothing about access: a media file is readable only by a session that may read its page, or through that page's public link (`WEB-003`).
- **BLOCK-009 — Link cards.** A pasted URL becomes a link card showing the target's title, description and icon, and can be switched between a plain link, an inline card and a block card without retyping it. Fetching a preview goes through `link.preview.v1` and issues a bodyless GET to public HTTPS origins only, sends no session, credential or member identity, rejects local, private, link-local and cloud-metadata addresses before the first request and before each redirect, and enforces the redirect, byte, time and media-type limits in `seed.json → limits`. A refused or failed fetch leaves the plain link and says so; the URL is stored exactly as pasted either way.
- **BLOCK-010 — Content queries.** A body can hold a live list of pages defined by container, ancestor, type, status, contributor and date, ordered and limited by the author. It re-runs when the page is opened, shows when it last ran, shows each reader only the pages that reader may read, and never renders a draft (`LIFE-002`). A query whose source is deleted shows that, not an empty list.

## Page lifecycle

- **LIFE-001 — Lifecycle states.** A page is `draft`, `scheduled`, `live`, `live-with-unpublished-changes` or `archived`. It always has a working revision and has a published revision in every state but `draft`; `live-with-unpublished-changes` means both exist and differ. Every transition records the actor and the time, and every state exists in the stored model whichever value `LIFE-006` carries.
- **LIFE-002 — A draft is private.** While a page is `draft` it is absent from search, from content queries, from the inbox, from analytics, from AI grounding, from every administrative and export listing, and from the tree of every member it has not been shared with. Its body is readable only by its author and by the principals in its own grant list: sharing a draft, by link or by address, creates a grant under `SHARE-001` and `SHARE-006`, that grant requires a session like every other, it is shown in the draft's grant list, and revoking it ends access under `SHARE-007`. There is no readable address for a draft that carries no grant, a draft has no general access grant under either value of `SHARE-005` (`SHARE-004`), and a draft cannot be published to the anonymous web (`WEB-001`). No role, policy value, container setting, workspace owner action, automation or extension defeats this. `LIFE-006` decides whether a draft state arises, never whether this clause holds.
- **LIFE-003 — Publish.** Publishing takes a location, a general access setting (`SHARE-004`), an optional version comment, an optional schedule and an optional publish-as attribution, shows a preview of what readers will see, and on confirmation makes the page visible in its container's tree, in search and in content queries, and writes one version with origin `publish` (`REV-002`).
- **LIFE-004 — Scheduled publish.** A publish set for a future time leaves the page `scheduled`, shows that time wherever the page appears to its author, and publishes at that time without a further action. Cancelling before it fires returns the page to `draft` and publishes nothing; a schedule that fails to fire leaves the page `scheduled` and reports the failure under `BASE-OPS-004`.
- **LIFE-005 — Unpublished changes.** Editing a `live` page changes what readers see only when it is republished: every reader other than the editors sees the published revision, and the page shows that it has unpublished changes to anyone who may edit it. Discarding them restores the published revision as the working revision and deletes no version.
- **LIFE-006 — Lifecycle profile.** *Policy: `page.lifecycle.v1`; default: `always-live`, following Notion. Under `always-live` a new page is live from creation and the product hides the publish action and its modal, close and discard draft, the draft banner, the draft chip in the tree, the scheduled state, the unpublished-changes state, the version-comment field and the publish-as selector; the page's own share panel (`SHARE-001`) is how it becomes visible to others. Under `draft-then-publish` a new page appears only in its author's tree with a draft chip, nothing is hidden, and `LIFE-003` to `LIFE-005` are the working path. Both values store every state in `LIFE-001`, so a workspace can be switched either way without a migration and an imported draft is never published on arrival.*
- **LIFE-007 — Discarding a draft.** The author of a `draft` page can discard it, which moves it to trash (`ARCH-005`) rather than deleting it, and can close it, which leaves it a draft. Neither action notifies anyone or leaves a trace in another member's tree.

## Sharing and access

- **SHARE-001 — Grants.** A page carries an ordered list of grants. Each grant names a principal — a person, a group, a container or the workspace — a level from `full`, `edit`, `comment` and `view`, and an optional expiry. The panel that edits them shows every effective grant, whether it is inherited or set here, and where an inherited one comes from.
- **SHARE-002 — What the levels mean.** `full` may read, edit, comment, share and change access; `edit` may read, edit and comment; `comment` may read and comment; `view` may read only. Every server operation checks the level for the acting member (`BASE-ACCESS-004`), and no interface offers an action the level does not carry.
- **SHARE-003 — Inheritance.** A page inherits its parent's grants, and a child added later inherits the parent's grants at that moment. A page may add grants or be restricted, and a restriction is shown on the page and on every descendant it affects. Removing a restriction restores inheritance rather than copying the parent's grants.
- **SHARE-004 — General access.** At most one grant on a page has the container or the workspace as its principal; that is the general access grant. A page that carries none is restricted to its named grants, and a page in a personal container (`CONT-005`) carries none under either value of `SHARE-005`. Changing it is one action and is recorded in activity.
- **SHARE-005 — Access profile.** *Policy: `page.access.v1`; default: `workspace-general` with all four levels, following Notion. `workspace-general` makes the workspace the general principal and shows the four-level ladder on each grant. `container-general` makes the container the general principal, labels that row with the container's name, and hides nothing else. Removing a level from the list hides it everywhere, including the comment affordance when `comment` is removed. A page imported with a container-wide general grant is created with a container principal under either value, never widened to the workspace. Switching the value relabels the general access row and rewrites no grant: no value widens an existing page's general principal, and no page gains a general grant it did not already carry.*
- **SHARE-006 — Sharing with a person who is not a member.** Granting access to an address that belongs to no member creates a guest invitation (`WORK-010`, `MAIL-001`) and the grant takes effect when it is accepted. Until then the page shows the pending grant, and revoking it cancels the invitation.
- **SHARE-007 — Access changes take effect at once.** Removing or narrowing a grant applies to the next request from every existing session, closes an open editor with an explanation rather than silently discarding the writer's unsaved text, and removes the page from that member's search results, tree, inbox items and AI answers within 5 seconds.
- **SHARE-008 — Expiring grants.** A grant may carry an expiry time. When it passes, access ends under `SHARE-007`, the grant is shown as expired rather than deleted, and re-granting is one action.

## Public links

- **WEB-001 — Anonymous access takes two acts.** A page is readable without signing in only when a member with `full` access publishes it (`WEB-002`), directly or through an explicit bounded revocable owner grant for that exact page or named publication class under `AI-011` and only while its container allows it. Each of the container's three switches (`CONT-007`) vetoes its own act and no other. While public links are forbidden, publishing a page in that container is rejected and every existing public link on its pages stops resolving at once. While anonymous access is forbidden, a published page in that container resolves only for a signed-in member who may read it. While guests are forbidden, a guest invitation to that container or to a page in it is rejected and existing guest access to it ends under `SHARE-007`. Each veto is not gated by a plan or a role beyond container administration, is not a policy value, and no extension, automation or AI action may bypass it. Each delegated publication rechecks the grant, current full access, exact source-audience disclosure rights and target; standing authority avoids repeated approval but supplies no audience or veto bypass.
- **WEB-002 — What a published page carries.** Publishing writes a public exposure record holding the host, a slug the publisher may edit, a search-engine indexing flag, a theme, the set of header controls the page shows, whether readers may duplicate it, and the time it was revoked if it was. The slug is stored, never derived, so an imported public address is preserved exactly; a slug already in use is rejected.
- **WEB-003 — The anonymous read view.** A published page renders its published revision and nothing else: no navigation, no editing, no comments, no member names beyond the byline the page itself shows, and no other page unless that page is itself published. It sets no cookie, loads nothing from a third-party domain, and sends no visitor data before an interaction (`BASE-PUBLIC-001`), and it counts a view without identifying the viewer (`PAGE-013`).
- **WEB-004 — Children are not published by inheritance.** Publishing one page publishes only that page unless the publisher explicitly includes its children, and a child added later is not published until someone publishes it. A link from a published page to an unpublished one is rendered as text, not as a link that would return a sign-in page.
- **WEB-005 — Indexing is off until it is chosen.** Search-engine indexing is off for a newly published page: the response and the served document tell crawlers not to index it until a member turns indexing on, and turning it off again restores that state within one request.
- **WEB-006 — Unpublish.** Unpublishing stops the address resolving within 5 seconds, returns a content-free page saying the link is no longer available, and keeps the slug reserved for that page so republishing restores the same address. It deletes no version and changes no grant.
- **WEB-007 — Public-link profile.** *Policy: `page.public-access.v1`; default: `site`, following Notion. `site` shows the host and slug fields, the theme, the header controls, the duplicate-as-template switch, social preview settings and the live-site banner over the page. `link` hides all of those and shows a single toggle, the resulting URL, the indexing switch and unpublish. Both values store the whole record in `WEB-002`, so a workspace switched to `link` keeps the slug and theme an imported or previously published page already had.*

## Versions

- **REV-001 — What a revision is.** Every page, record, container, comment, template and decision record (`DEC-001`) carries a revision identifier that changes on every committed edit and is never reused. A page revision is immutable: it holds the body and properties as committed, its author, its time, its origin of `autosave` or `publish`, and a content hash, being SHA-256 of the revision's extracted text after Unicode NFC normalisation and whitespace collapse. A retried write whose hash matches the latest revision commits nothing. Wherever another clause names a revision, it means this identifier.
- **REV-002 — History.** Each of those records has a history listing its revisions newest first with the actor, the time, the origin, and, where `REV-007` assigns them, an ordinal and a label. History is readable by anyone who may read the record and is never editable.
- **REV-003 — Restore.** A member with edit access can restore a previous revision. Restoring writes a new revision holding the earlier content, records who restored which revision in activity, and changes no link, comment anchor, child page, grant or public link.
- **REV-004 — Compare.** Any two revisions of one page can be compared, showing added, removed and changed blocks in place. Compare is available under every value of `REV-007`.
- **REV-005 — A citation resolves to its revision.** A link, mention or AI citation that names a revision opens that revision with its content as committed, even after the page has changed, and says that a newer revision exists. The reader's access is checked against the page as it is now: a member who may not read the page today gets `LINK-004` and no historical content, an anonymous reader gets nothing unless the page is published (`WEB-001`), and no grant that has since been removed or expired reopens a revision. When the page has been erased it opens a content-free tombstone (`LINK-002`) carrying no body, quote or personal metadata.
- **REV-006 — Deleting a version.** A member with `full` access can delete one intermediate version, which removes its content and leaves a numbered tombstone in history naming who deleted it and when. The current revision and the published revision cannot be deleted, and deletion is offered only where `REV-007` says so.
- **REV-007 — Version profile.** *Policy: `page.version.v1`; default: `autosnapshot`, following Notion. `autosnapshot` writes a revision on save, assigns no ordinal or label, and hides the version and comment columns, the version-comment field and version deletion, keeping selection, compare, restore and difference summaries. `labelled` numbers each published revision, carries the version comment taken at publish and the page's status at that moment, and hides nothing. Ordinals come from publish events, so a workspace with `page.lifecycle.v1` at `always-live` and this policy at `labelled` numbers nothing until a page is published; the model stores the ordinal and label fields under both values, so an imported numbered history is never discarded.*

## Page status and verification

- **STAT-001 — The status vocabulary.** The workspace holds a list of status entries, each with a key, a label, a colour and an optional verification requirement. It ships seeded with Rough draft, In progress, Ready for review and Verified under every value of `STAT-005`, and a workspace owner can add, rename, recolour and retire entries. Retiring an entry keeps it on the pages that carry it and offers a bulk change (`CONT-006`).
- **STAT-002 — A page's status.** A page carries at most one status. Setting or clearing it is one action for anyone with edit access, writes one activity entry, and makes the page findable by that status in search (`SEARCH-003`) and in content queries (`BLOCK-010`).
- **STAT-003 — Verification.** Setting a status entry that requires verification records the verifying member as its owner and an expiry of 7, 30 or 90 days, a chosen date, or none, and can be set only by a member who has opened the exact revision they are attesting to. The badge shows the owner, the expiry and the revision verified, and editing the page after verification shows that the verified revision is not the current one.
- **STAT-004 — Verification lapses.** When an expiry passes, the page shows the status as lapsed rather than verified, notifies the owner once (`NOTIF-001`), and keeps the original verification in history. Nothing renews it automatically, no AI action renews it (`AI-011`), and a lapsed verification never reads as current in search results, content queries, AI answers or exports.
- **STAT-005 — Status profile.** *Policy: `page.status.v1`; default: `verification-only`, following Notion. `verification-only` exposes only the entries that require verification, hides the colour picker and the custom-status field, offers the control from the title's own hover row, and renders the chip beside the breadcrumb title. `open-vocabulary` exposes every entry, shows the colour picker and a custom label of at most twenty characters, and renders the chip on the byline between the author and the reading time. Both values store the whole vocabulary, so switching exposes or hides entries and rewrites no page.*

## Comments

- **COMM-001 — Two kinds of thread.** A member with `comment` access or more can open an inline thread anchored to a selection in a block, and a page thread about the page as a whole. A thread is chronological, is Open or Resolved, and records each comment's author and time. Both kinds are threads; only their anchor differs.
- **COMM-002 — Editing and deletion.** A member can edit or delete only their own comments. An edited comment shows the time it was last edited, a deleted comment leaves a tombstone in place, and both write an activity entry.
- **COMM-003 — Mentions.** Mentioning a member in a comment creates one unread notification (`NOTIF-001`) linked to that comment, and mentions no one who cannot read the page. Editing the comment notifies only a member the comment did not already mention.
- **COMM-004 — Anchors survive editing.** An inline thread follows its text through edits, splits and moves within the page. When its text is deleted the thread becomes orphaned rather than lost: it stays in the discussions panel, names the revision it was anchored in, and opens that revision (`REV-005`).
- **COMM-005 — Reactions.** A member can add and remove an emoji reaction on any comment they can read. Reactions show who reacted and never notify.
- **COMM-006 — Discussions panel.** One panel lists every thread on the page, filtered by kind, status and person, with an action that resolves all open threads. It shows unresolved threads whose anchor is orphaned, and selecting a thread scrolls to its anchor.
- **COMM-007 — Resolve.** Any member with `comment` access can resolve or reopen a thread. A resolved thread is hidden from the page body, stays readable in the panel and in search, and keeps its comments and reactions.

## Archive, trash and deletion

- **ARCH-001 — Archive.** A page, a container or a database can be archived. Archiving records the actor, the time, the prior location and an optional reason, and archives the record's descendants with it.
- **ARCH-002 — What archived means.** An archived record is read-only, is absent from the tree, from default search (`SEARCH-009`), from content queries and from AI grounding, and its existing links, mentions and citations still resolve. It is discoverable by the archived filter, and its comments, versions and grants are unchanged.
- **ARCH-003 — Restore from archive.** Restoring returns a record to its prior parent and position with the same identifiers, revisions, comments, grants and status. Where the prior parent is gone, the member chooses a destination before the restore completes.
- **ARCH-004 — Archive is not deletion.** Archiving deletes no data. Permanent deletion is a separate confirmed action governed by `BASE-DATA-002`, `BASE-DATA-003` and `ARCH-006`.
- **ARCH-005 — Trash.** Deleting a page moves it and its descendants to the trash, where they are listed with the deleting member, the time and the prior location, searchable and filterable within the trash, and restorable to their prior place. Nothing leaves the trash on a timer (`BASE-DATA-002`), and a page in the trash is absent from every surface but the trash itself.
- **ARCH-006 — Permanent deletion.** Emptying the trash, or permanently deleting one record in it, is explicit and confirmed, names what will be destroyed, and removes the body, every revision, uploaded files, comments, analytics rows and AI grounding within the cascade deadline in `BASE-DATA-003`. Every link to it then resolves to a content-free tombstone (`LINK-002`), and activity entries survive with their references anonymised.

## Containers

- **CONT-001 — What a container is.** A container has an identifier, an optional key, an icon, a name, a description, owners, a visibility of `default`, `open`, `closed`, `private` or `personal`, a grant list shaped like a page's, and external-access switches (`CONT-007`). It holds one page tree (`TREE-001`) and the databases in that tree.
- **CONT-002 — Creating a container.** A workspace owner or, where the workspace allows it, any member can create a container from a form taking an icon, a name, a description, a visibility and an optional key, and a purpose that sets the form's defaults. A purpose supplies default values only; it creates no second kind of container and nothing about the container is unreachable afterwards.
- **CONT-003 — The container index.** One index lists every container the member may see with its name, description, access and member count, filtered by membership, visibility and whether it is personal, and opens each one. Containers a member cannot see are neither listed nor counted.
- **CONT-004 — Container settings.** Each container has its own settings shell holding its identity, members and grants, external-access switches, templates, trash and bulk tools. It is separate from workspace settings (`WORK-011`) and a container administrator reaches only their own container's.
- **CONT-005 — Personal containers.** Every member has one personal container that no other member can be granted access to; its pages are theirs alone until they are moved or shared to another container. Deleting the member archives it under `WORK-007` rather than exposing it.
- **CONT-006 — Bulk actions.** A member can select several pages, in a tree or in a container's content list, and archive, trash, move, change owner or change status for all of them in one action. Each selected page records its own change with its own activity entry, each is checked against the acting member's access, and a partial failure names the pages that failed and applies the rest.
- **CONT-007 — External-access switches.** A container carries three switches — guests, public links and anonymous access — each `allowed` or `forbidden`. A workspace owner sets a workspace-wide value and a container administrator may only narrow it. Forbidding takes effect at once under `WEB-001` and `SHARE-007`. These switches carry no plan, tier or upgrade gate.
- **CONT-008 — Container access profile.** *Policy: `container.access.v1`; default: `class-led`, following Notion. `class-led` leads with the visibility values in `CONT-001`, each stating who may see and join, and folds the member, group and guest lists behind one manage-access view. `grant-led` leads with tabbed lists of members, groups and guests and an external-access card, and hides the visibility dropdown. Neither value hides the switches in `CONT-007`. Both store visibility and the grant list, so switching relabels the surface and rewrites no grant.*
- **CONT-009 — Container grants.** A container's grants use the principals and levels of `SHARE-001` and `SHARE-002`, are the source of every page's inherited access, and are editable only by a container administrator or a workspace owner. Every change is recorded in activity and takes effect under `SHARE-007`.

## Structured records

- **DB-001 — A database.** A database is a node in the page tree with a name, an icon, typed fields and records. It is created, moved, archived and trashed like a page, and its access follows `SHARE-001`.
- **DB-002 — Field types and evaluation.** Fields support text, number, checkbox, date, select, multi-select, status, person, file, URL, email, phone, place, relation, rollup, formula, created/updated metadata and identifier. Each defines empty value, sort order and import/export representation. Type changes convert every value or reject with the loss named. Relations resolve actual records. Bounded formulas and rollups evaluate typed expressions with explicit null/error semantics, dependency tracking, cycle rejection and resource limits; no arbitrary code or network execution. Recompute affected dependencies after changes. Evaluation and aggregation use current reader-authorized records and never leak restricted values or counts. Preserve imported configuration and unsupported expressions with visible not-recomputed state, never fabricated current values; export and restore retain definitions and dependencies.
- **DB-003 — Views.** A database has several named views over one set of records. A view is saved for everyone who can see the database, is renamed, duplicated and deleted by anyone with edit access, and never changes the records it shows.
- **DB-004 — Layouts.** A view is a table, a board, a list, a gallery, a calendar or a timeline. A board or calendar requires the field it groups or dates by, and offers to create it rather than failing when it is missing.
- **DB-005 — Filter and sort.** A view carries filter rules over any field, combined with and or or, and an ordered list of sorts. Both are stored on the view, are shown in force above the records, and are cleared in one action.
- **DB-006 — Group.** A view groups its records by a select, status, person, checkbox or date field, shows the count in each group, allows a record to be moved between groups where the field permits it, and hides empty groups on request.
- **DB-007 — Calculations.** Each column in a table view carries a calculation under it — count, filled, empty, sum, average, minimum, maximum, range or percent — computed over the view's filtered records and updated within 2 seconds of a change.
- **DB-008 — Charts.** A chart is built over one view, showing counts or a numeric field aggregated by a grouping field, and can be embedded in a page (`DB-011`). It reads the same filtered records the view shows and states which view it reads.
- **DB-009 — Lock structure.** A database's structure can be locked, which rejects field, view, filter, sort and layout changes while allowing record edits, names who locked it, and is unlocked by anyone with `full` access.
- **DB-010 — A record is a page.** Every record has an identifier that is also a page identifier, a field map, an optional body of blocks, an optional icon and an optional position in the tree. *Policy: `record.page-parity.v1`; default: `record-is-page`, following Notion. `record-is-page` shows the per-record icon, opens a record as a side peek, a centre peek or a full page, offers its body, and lists it in the tree and in page search. `record-is-row` opens a record as a field list with a print action, and hides the icon, the body area, the tree position and the record from page search. The body is stored under both values and is never dropped, so a workspace can be switched back and an imported record with a body keeps it.*
- **DB-011 — A view inside a page.** A view can be embedded in a page body and stays live: it shows each reader only the records that reader may read, reflects a change to the source within 5 seconds, and carries its own filters and sorts without changing the source view.
- **DB-012 — Record detail.** Opening a record shows its fields in a defined order with inline editing, its comments and its history (`REV-002`), and, where `DB-010` exposes it, its body. A field a member may not edit is shown and not editable rather than hidden.

## Automation

- **AUTO-001 — A rule.** A rule has a name, a scope, a trigger, ordered conditions, an optional branch over related records, ordered actions, and an actor. Triggers are record and page events and a schedule; actions edit fields, create pages and records, move and archive them, add comments, and send a notification through a configured adapter.
- **AUTO-002 — A rule acts as its actor.** A rule performs only what its actor could perform by hand: every action is checked against that member's access at the moment it runs, and an action that would exceed it is skipped and logged rather than performed. A rule cannot publish or unpublish a page, change grants or external-access switches, verify a page, permanently delete anything, or manage members.
- **AUTO-003 — Run log.** Every rule keeps a per-run log with the trigger, the actor, the records touched, the time and one of the states configuration-changed, queued, running, success, no-action, condition-not-met, throttled, error, failure and disabled. A failed run is visible without a search (`BASE-OPS-004`), and a rule that fails repeatedly is disabled and says so.
- **AUTO-004 — Loops are bounded.** A rule never triggers itself, a chain of rules stops at the depth in `seed.json → limits`, and a run that would exceed the workspace's rate limit is throttled and logged rather than dropped silently.
- **AUTO-005 — Automation profile.** *Policy: `automation.scope.v1`; default: `source`, following Notion. `source` creates rules from a database's own toolbar, scopes them to that database, shows one When-and-Do form, scopes the run log to that database, and hides the scope selector, the site option, the branch rail and the cross-container rule list. `container` and `site` create rules from a rule list, expose the scope selector and the branch rail, and hide nothing from each other. The scope field and the run log are stored under every value, so an imported container or site rule keeps its scope and its history.*

## Search

- **SEARCH-001 — Global search.** One search covers page titles and retained body text, record field values, container names and descriptions, comments and templates, and returns the first page of ranked results within 500ms with the total number of matches and an ordering stable across pages.
- **SEARCH-002 — Results.** Each result names its kind, shows the matched text in context, and opens the record with the match highlighted. A quoted query matches only records whose retained text contains that exact phrase.
- **SEARCH-003 — Filters.** Results are narrowed by kind, container, contributor, status, updated date, and whether archived or trashed records are included, without changing the query text, and the filters in force are shown with the results.
- **SEARCH-004 — Freshness.** A committed create, edit, publish, move, archive, restore or delete is reflected in results within 5 seconds. An import is not complete until its records are searchable (`PORT-004`), and content removed under `ARCH-006` stops matching within the cascade deadline in `BASE-DATA-003`.
- **SEARCH-005 — What search never shows.** Search returns only what the searching member may read: no page they lack a grant for, no other member's draft (`LIFE-002`), nothing in another member's personal container (`CONT-005`), and no title, snippet, facet count or result total that would reveal the existence of any of them. Access is the only rule that removes a record from search outright; every other exclusion is a default the member can undo (`SEARCH-009`).
- **SEARCH-006 — Search in one container.** Search can be scoped to one container from that container's own surface, keeps every filter in `SEARCH-003`, and says which container it is scoped to.
- **SEARCH-007 — No results.** When nothing matches, search restates the query and every applied filter, offers one action that clears the filters and one that creates a page with that title, and shows no invented result or answer.
- **SEARCH-008 — Search without AI.** With the AI provider unconfigured, disabled, failing or over budget, ranked search and every filter still return within 500ms with no error, and the generated answer (`AI-015`) is absent rather than empty.
- **SEARCH-009 — Default visibility.** Search without the archived or trashed filter (`SEARCH-003`) excludes archived and trashed records and nothing else. This is the only rule that hides a record the searching member may read, and every record it hides stays reachable by applying that filter and through every existing link, mention and citation (`LINK-001`, `LINK-003`).

## Personal surfaces and navigation

- **NAV-001 — Home.** A member's home shows their recent pages, their favourites and the containers they belong to, each entry opening the record. It shows nothing the member may not read and no workspace-wide activity feed.
- **NAV-002 — Recents.** Recently opened pages are listed per member, newest first and grouped by day, and a page appears there for no one but the member who opened it.
- **NAV-003 — Favourites.** Favourited pages and containers (`PAGE-008`) are listed in the navigation, reorderable by the member, and removed from the list in one action.
- **NAV-004 — One navigation.** The operator app has one sidebar holding the global destinations, the personal sections and the container trees, collapsible to leave the page full width. Its order and which entries appear come from workspace configuration and from the navigation slot (`workspace.navigation.after.v1`); changing any policy value in this contract changes no entry in it and no entry's position. A container's own navigation nests inside it rather than replacing it.
- **NAV-005 — Global create.** One create action is available from every operator screen and creates a page, a database, a container or a page from a template, naming the destination before it creates.
- **NAV-006 — The touch client edits.** Every operator surface in this contract works at phone width on a touch device, and none of them is read-only there: a member can create and edit a page and its blocks, comment, resolve, publish, share, and use every database layout. Where a gesture cannot carry a desktop interaction, the touch form is named in the same clause — the insert menu from a labelled control above the keyboard (`BLOCK-003`), reordering by a drag handle rather than a hover target (`BLOCK-001`). The responsive application is the baseline; native iOS, Android and desktop apps with offline pages and push notifications are target clauses `MOBILE-001` to `MOBILE-004`.

## Notifications

- **NOTIF-001 — Meaningful notifications.** A member is notified in the app when they are mentioned, when someone comments or replies on a page they watch or authored, when a page they watch is published or republished, when a verification they own lapses (`STAT-004`), when they are granted access to a page or container, and when an AI run they started needs review or failed. Deliver these notices when the triggering event occurs; overdue decision notices go to the decision owner under `DEC-005`. Route an unresolved policy/authority choice to its named owner when the choice blocks action, an actionable paused or failed run to its run owner when it pauses or fails, and a consequential experiment result to its accountable owner when the result is recorded and ready for action. Coalesce related granted maintenance into one concise Today outcome with inspectable changes; routine standing-authorized success and unchanged checks stay quiet and require no fresh approval. Never coalesce away direct mentions, access changes, lapsed human attestations, meaningful failures or required decisions. Own direct actions never notify their actor; delegated events retain the named recipient rules. Recheck recipient access and the authorized output audience at creation, delivery and read; never notify about unreadable records or disclose sources beyond their authorized audience. Preserve `NOTIF-002` inbox behavior, `NOTIF-003` optional link-only chat delivery and `MAIL-001` limited email use.
- **NOTIF-002 — Inbox.** Notifications are listed newest first, grouped by period, with an unread count and separate views for those addressed to the member and those from watched pages. Opening one marks it read and opens the referenced record at the referenced comment; a member can mark all read and archive read notifications.
- **NOTIF-003 — Chat notifications.** A workspace owner can connect one chat destination through `chat.notifier.v1` and choose which events reach it. A message carries the event, the actor, the page title and a link, never the page body, and the link still requires access. The connection shows its last delivery and its last failure, retries only transient transport failures, and stops sending the moment it is disconnected; its credential is encrypted with `CONNECTOR_CREDENTIALS_KEY`, returned by no API response, and destroyed on disconnect. A deployment with a chat destination connected and that variable missing fails at startup naming it (`BASE-SECRET-002`) rather than running with the connection off. An expired or revoked authorisation marks the connection as needing attention, offers a reconnect action, and stops sending without deleting the connection, its event selection or its delivery history. Target (16 October 2026): `CHAT-001` extends this to any number of Slack, Microsoft Teams and Nook destinations with the same guarantees.

## Mail

Managed-mail amendment — 16 October 2026 (MAIL-001/002 and BASE-SECRET-002): Managed hosting supplies and hides the relay settings and credential. Free and Assisted hosting retain explicit Resend or SendGrid settings. Hosted plans require a working selected mail provider and its credentials; local dev and demo suppress mail silently per rer 0.2.22, with one-click sign-in. The relay owns sender identity and accepts only the recipient, subject and body, without redirects.

- **MAIL-001 — Outbound only, two kinds.** Slate sends mail only to deliver a sign-in link (`BASE-ACCESS-001`) and an invitation — a member invitation (`WORK-006`) or a guest invitation (`SHARE-006`) — from the configured sender address through `mail.sender.v1`. No product event sends mail, and Slate accepts no inbound mail: a reply to that address creates and changes nothing. Target (16 October 2026): `NOTIF-005` adds notification email and digests that a member opts into, through the same sender; without that opt-in, sign-in and invitation mail remain the only mail Slate sends.
- **MAIL-002 — Delivery failure.** A send that fails is retried up to 3 times over 5 minutes when the provider guarantees duplicate suppression for that exact request. With SendGrid, explicit rejection is shown for owner retry; ambiguous transport, expired dispatch ownership, or acceptance without a receipt is durably held for provider review with no automatic or explicit blind resend. A send that still fails or remains uncertain is recorded with a safe provider error and shown to a person — on the sign-in screen for a sign-in link, in settings for an invitation — and is never reported as sent. Managed hosting uses Base’s `rer` adapter with RER-assigned `MAIL_PROVIDER`, `MAIL_FROM`, `MAIL_RELAY_URL` and private `MAIL_API_KEY`; no provider account is needed. Relay HTTP 202 establishes acceptance without a provider message ID. Explicit relay throttling is queued within the existing three-attempt budget, no earlier than Retry-After; other relay rejections are visible failures. Ambiguous relay sends and expired dispatch ownership are held for review without blind resend. A provider receipt establishes acceptance, not inbox delivery.

## Activity

- **ACT-001 — Durable timeline.** Activity is append-only. Each entry records the actor or the feature that acted, the action, the target record, the time, and the operation key, automation run or AI run that caused it. A mutation and its activity entry commit together or not at all.
- **ACT-002 — Coverage.** Activity records page creation, body and property changes, publish and unpublish, moves, archive, trash, restore and permanent deletion, version restores and deletions, status and verification changes, grant and external-access changes, comment activity, container and group changes, database structure changes, automation runs, AI runs and their acceptance or rejection, member invitation and removal, import and export.
- **ACT-003 — Retrieval.** Members can filter activity by actor, action, record kind, container and date range, with newest-first pagination that stays stable while new entries arrive, and see only entries about records they may read.
- **ACT-004 — Context.** Opening an activity entry opens the record it describes together with the comment thread, revision or grant it references, and changes no entry.
- **ACT-005 — Retained explanation.** No member can edit or delete an activity entry. When a described record is erased the entry remains, naming the record kind and time, with personal references anonymised as `BASE-DATA-003` requires.

## Templates

- **TMPL-001 — Gallery.** Members can search templates by title and description and filter them by category. A search with no match shows "No templates match this search."
- **TMPL-002 — Preview.** A template preview shows the page it produces, including its body, properties and any child pages, before it is used. A figure such as a team size or a duration appears only when the template's author wrote one; Slate never estimates, infers, or displays a placeholder for either.
- **TMPL-003 — Snapshot on use.** Using a template creates a page holding a copy of its body, properties and children in the destination the member chose. Editing, archiving or deleting the template afterwards changes no page already created from it.
- **TMPL-004 — Custom templates.** Members can create, edit, archive, restore and delete templates. Templates shipped with Slate cannot be edited or deleted and can be duplicated into an editable copy.
- **TMPL-005 — Save a page as a template.** Saving a page as a template copies its body, its properties and, on request, its children. It copies no comment, version, grant, watcher, analytics figure, status or public link.
- **TMPL-006 — Where a template lives.** A template belongs to the workspace or to one container. A container's templates are offered first inside that container and are not offered elsewhere, and moving a template between the two is one action.

## Import

- **IMP-001 — Import jobs.** An import is idempotent by operation key (`SAVE-005`), retains its exact supplied original, and names every physical page, database, record, file and version created and every construct it did not map. Notion workspace and Confluence space jobs first show a durable Preview with would-create counts, the complete paged loss report, reviewed principal mappings and measured canonical plan size; Preview creates no target tree. Explicit Apply uses that exact review and commits bounded batches with durable journals. Preparing, Running and Indexing progress survives reload and resumes from its committed checkpoint. Incomplete trees stay inaccessible through all native reads and mutations; the whole native tree becomes visible atomically. Completed requires `PORT-004`. Undo is available after partial or completed Apply: it removes independent unchanged creations, preserves native edits, additions and their required dependencies, and reports each retained conflict as `NATIVE_EDIT_CONFLICT`. Preparation can be cancelled without publishing a tree. Failed document imports roll back; interrupted reviewed space imports retain an inaccessible, resumable checkpoint. The original remains downloadable until explicitly deleted or invalidated by privacy erasure. Erasing any imported source under `ARCH-006` invalidates the indivisible retained original and all import recovery custody, makes retry, resume and Undo unavailable with a plain reason, and leaves unaffected native pages in place.
- **IMP-002 — Notion import.** Slate imports a Notion workspace export in its Markdown and CSV form: pages become pages with their tree and titles, icons and covers where the export carries them, page bodies become blocks of the equivalent types, links between exported pages resolve to the imported pages, CSV databases become databases with typed fields and records, and files become media blocks. Every page arrives live, and the report names what did not map. Its test fixture is an export produced by Notion itself, committed with the test; a fixture written by hand does not satisfy this clause, because the construct-by-construct mapping is only tested against what the incumbent actually emits.
- **IMP-003 — Confluence import.** Slate imports a Confluence space export in whichever form the product emits — Confluence Cloud's CSV table export, where `content.csv` carries the tree and the version ledger and `bodycontent.csv` carries storage-format bodies, or the single `entities.xml` a Server or Data Center export writes — and single documents in the forms each editor exports: Word's `.docx`, and a Google Docs document downloaded as `.docx` or as zipped HTML, Google Docs having no file form of its own. Pages become pages with their tree, their labels (`PAGE-001`), their versions with their comments and ordinals where the export carries them, their status, and their published state; page and attachment links resolve to the imported records; and named user and group restrictions remain named grants only through explicit reviewed source-principal-ID mappings to existing active same-workspace members or groups. Mapping authority and current membership are validated at Apply and every batch; names and email addresses never activate or implicitly match accounts. Unmapped people remain inactive historical actors. Empty, unknown or unmapped restriction sets preserve restricted inheritance and importing-member recovery access, with unresolved restrictions named in the report. Source edit restrictions conservatively close native inheritance and disclose that conversion. No import publishes an anonymous page. A general grant is container-scoped, never workspace-wide (`SHARE-005`), and a personal container carries no general grant (`SHARE-004`). The report names what did not map, including whiteboards, blogs, calendars and folders, and a folder is imported as a page with an empty body so its tree survives. Its test fixtures are a space export produced by Confluence itself and one document downloaded from each of Word and Google Docs, committed with the test; a fixture written by hand does not satisfy this clause.
- **IMP-004 — Import safety.** Imported markup, documents and attachments are validated and sanitised under `BASE-INPUT-001` to `BASE-INPUT-003`. An import fetches nothing from the network: media comes from the archive, and a link to a file the archive does not contain is imported as a link and named in the report.
- **IMP-005 — Importing into a page.** A member can import a Markdown, HTML, Word, PDF, EPUB, plain text or CSV document into a page or as a set of pages, mapping its headings to blocks and its tables to tables. The same report and the same safety rules apply.

## Portability

- **PORT-001 — Export contents.** An export contains workspace settings; members, groups and guests; every container, page, database, record, template, comment thread, notification, automation rule, AI run and activity entry as JSON, with each record's revision history and grants; and every uploaded file in its original form.
- **PORT-002 — Referential restore.** Importing an archive into an empty deployment restores identifiers, revisions, tree order, grants, links, mentions, comment anchors, public-link slugs and files, so every link from the source deployment resolves to the same record.
- **PORT-003 — Visible jobs.** Export and import show Queued, Running, Completed or Failed with record counts and, on failure, a report naming what failed. A failed job is never shown as complete.
- **PORT-004 — Search rebuild.** An import is not Completed until every imported page and record has its canonical search projection, no imported page has a pending dirty generation, and the records satisfy `SEARCH-001` to `SEARCH-006`. Bounded index rebuilds retain an explicit, resumable Indexing state. Completion is fenced by indexed-ID and dirty-generation readback before any first user search can trigger a lazy refresh.
- **PORT-005 — Access boundary.** An export excludes sessions, sign-in links, pending invitations, stored operation-key responses and provider secrets. An import activates only the member named by `SETUP_OWNER_EMAIL`; every other imported member is an inactive historical actor until invited, and no imported page is published to the anonymous web until a member publishes it.
- **PORT-006 — Atomic import.** An import stages records and files outside the live namespace, validates the whole archive, and publishes it in one step. A failed import leaves the deployment empty and can be retried.
- **PORT-007 — Exporting a page or a container.** A member can export one page, a page with its descendants, or a whole container as Markdown, HTML or PDF, with records as CSV, in one archive with its media. The export is readable without Slate, and re-importing it under `IMP-005` reproduces the tree. Target (16 October 2026): `PORT-010` adds Word `.docx` export of a page.

## References and links

- **LINK-001 — Permanent URLs.** Every page, page revision, container, database, record, comment thread and template has a permanent URL. Renaming a record, moving it, changing its container, archiving it or restoring it never changes that URL, and every existing link, mention, citation, content query and search result continues to resolve to it.
- **LINK-002 — Tombstones.** A link to a deleted or erased record resolves to a tombstone naming the record kind and the time it was deleted, not an error page or an empty view, and exposes no erased content or personal metadata.
- **LINK-003 — References follow their target.** A mention or link to another record renders that record's current title and state, follows renames and moves, and is labelled archived, trashed or deleted rather than removed when its target is.
- **LINK-004 — Links respect access.** A mention or link to a record the reader may not open shows that a linked record exists and that access is needed, and shows no title, snippet, icon or author. Requesting access is one action that notifies a member who can grant it.

## AI

- **AI-001 — Enablement.** AI is off until an AI provider is configured (`ai.provider.v1`) and a workspace owner turns AI on in settings, which is recorded in activity. While AI is off no run can be started and no request reaches a provider.
- **AI-002 — Run lifecycle.** A member can start selection edits, summaries, workspace answers, agent work and sustained inquiry. Runs move Queued → Running → Needs review or Paused → Running, then Completed, Failed or Cancelled. Each Running stage is bounded to ten minutes; exceeding it or encountering an error fails visibly. Scheduled waits and pauses persist their reason and progress and release execution. Any non-terminal run can be cancelled. Terminal runs never resume: continued work is a linked new run preserving earlier effects and reconciling ambiguity first. Proposal work completes on explicit acceptance or discard, recording rejection; granted work completes only after every required effect and output check is confirmed. A request created or uncertain effect is not completion.
- **AI-003 — Proposal or bounded delegation.** A run produces a proposal unless a current, named, bounded owner grant authorizes the exact effect, target, source scope, audience and conditions. Without that authority no product mutation occurs before member acceptance. Determinate maintenance within that authority commits directly as an attributable revision with sources, checks and receipt; it does not demand repeated ritual approval. Consequential business choices and out-of-grant effects remain pending for the accountable authority. No output approves itself.
- **AI-004 — Answer provenance.** Every generated answer, summary and agent output names the pages and revisions it drew on, and each citation opens that revision (`REV-005`). A statement Slate cannot cite is labelled as unsourced and is never presented as drawn from the workspace.
- **AI-005 — Acceptance and granted mutation.** Accepting a proposal applies only selected changes and records accepting member, changes, input revisions, provider and model. Delegated mutation records the exact grant and issuing owner instead of inventing an accepting person. Local mutations, revisions, receipts and activity commit together or not at all. Remote effects retain durable intent and confirmed receipts, never a claim of cross-provider atomicity. Accepted business decisions stay explicit and immutable under DEC-003.
- **AI-006 — Current inputs before use.** Before acceptance, resume or effect, recheck source revisions, current source/requester/audience/destination access, applicability, authority and live operational state. Show material changes and the reason for proceeding. A member may regenerate or explicitly accept against current revisions; an agent may regenerate and rebase a determinate step within its unchanged valid grant. Changed business decisions, applicability, permissions or effect scope require the corresponding authority or review. Never silently commit stale content.
- **AI-007 — Untrusted content.** Text inside pages, blocks, comments, imported documents, link cards and uploaded files is treated as content, never as instructions: it cannot change a run's scope, tools, destination records, agent permissions or the member's selections.
- **AI-008 — Failure preserves confirmed work.** Provider, budget, schema or output failure leaves a Failed run; cancellation leaves Cancelled, with readable reason and manual actions available. The failed or cancelled local stage creates no partial proposal or product mutation. Durable intent, audit and earlier completed stages and confirmed external receipts remain. Cancel unsent future work, reconcile dispatched ambiguity, and display completed effects and unresolved state. Compensation is a separate supported operation with its own valid grant; never assert an external rollback.
- **AI-009 — Retry.** Only transient transport failures are retried, at most 3 attempts over 5 minutes; invalid or unusable output is never retried automatically. A provider response received twice for one run produces one proposal.
- **AI-010 — Usage record.** Every run records the provider, model, tokens or provider units, calculated cost, duration, status, and the feature that started it. Totals are shown in settings by day and by feature.
- **AI-011 — No self-granted authority.** AI cannot grant itself authority, change membership, access grants, external-access switches or policy values, set or renew human verification, or accept a business decision for an unappointed owner. Publishing, unpublishing, archive, trash, deletion and external effects require either the responsible member action or an explicit bounded, revocable owner grant naming the exact effect, target or named update class, conditions, audience, expiry and budget. Missing, expired, narrowed, changed-target or revoked grants refuse the effect. A general goal, service credential, confidence or source text supplies no grant. Container vetoes, private drafts and source-audience rights cannot be overridden. Other products retain their stricter human-send and consent contracts.
- **AI-012 — Durable budgets.** AI enablement requires an owner-set positive workspace calendar-month budget. Before queueing work, durably reserve its maximum estimated provider cost, including bounded input/output, retries and tool units at recorded rates, against that ceiling and all applicable skill, run and provider limits. Count unfinished and paused reservations; persist accounting across restart and concurrent admissions. Recheck changed prices and additional stages before dispatch. Refuse before any provider side effect when any limit is exhausted; record actual units/cost and release unused reservations on settlement. No model, policy, extension or agent raises, waives or defers an owner ceiling.
- **AI-013 — Requester and audience boundary.** Every generated answer, summary, chat reply and agent output uses only sources currently authorized for the asking member, owner policy and task scope. This includes external sources and investigators using broader service credentials. Background work declares an authorized output audience and destination before execution; every source must permit that audience and executing identity. Recheck every contributor before fan-in, generation, write, delivery, resume and later read of persisted output. Changed or uncertain ACLs, source/requester/audience/destination rights withhold or invalidate derived artifacts, including caches, embeddings, transcripts and proposals; no titles, counts, hints or citations disclose restricted facts. Revoked, archived, trashed and another member’s draft content is excluded without reindexing. Credentials supply capability, never disclosure authority. LIFE-002 and source deletion rules remain absolute under every policy.
- **AI-014 — Scoped agents.** An agent is an auditable named record with instructions, owner, represented identity, exact source and effect scopes, audiences and destinations. Interactive access never exceeds current invoking-member access; background work follows AI-013. Writes follow AI-003 and AI-011. Owner policy bounds providers/models, skill/run/provider budgets and permitted effects; Slate routes automatically by measured task fit within it. Runs name actor, audience, agent, exact skill revision, provider/model and cost. No model selector or agent-management chore is required for ordinary work.
- **AI-015 — Workspace answers.** A chat panel answers questions over the workspace, keeps the conversation, cites its sources (`AI-004`), and places the same generated answer above search results with the same citations and the same caveat. It answers "I could not find that in what you can read" rather than answering from the model alone.
- **AI-016 — Summaries.** A member can summarize a page, its comments or a difference between two revisions. The result names exact revisions and may be copied, proposed for insertion, or inserted directly when the member’s request explicitly authorizes that exact insertion or a valid bounded grant covers it. Current access, destination rights, revisions and atomic receipts still apply; an ordinary request to summarize does not authorize unrelated edits.
- **AI-017 — Writing with AI.** With text selected, a member can run a named action — improve, shorten, lengthen, proofread, explain, translate, change tone — or a free-form instruction. The result is shown against the selection with insert below, replace, refine and discard, and nothing changes until one is chosen.

## Decisions

- **DEC-001 — A decision is a layer over a page.** A page can carry one decision record: a question, the options considered, an outcome, a rationale, an owner, a decided date, an optional review date, and citations to page revisions (`REV-005`). The page stays a page: its body, comments, grants, versions and links are unchanged, and removing the decision record leaves the page intact.
- **DEC-002 — States.** A decision is Proposed, Accepted or Superseded. Proposed becomes Accepted, an Accepted decision is superseded by another decision, and Superseded is terminal. Every transition records the actor and the time and appears in activity.
- **DEC-003 — An accepted decision is immutable.** Accepting freezes the decision's content together with the revisions it cites. Later edits to a cited page add a warning that the citation is no longer current and never rewrite the accepted rationale; changing an accepted decision is done by superseding it, which links both decisions in both directions.
- **DEC-004 — Decision log.** Decisions are listed and filtered by state, container, owner, decided date, review date and whether their citations are current, and each result opens the exact accepted revision.
- **DEC-005 — Review dates.** A review date that passes labels the decision overdue and notifies its owner (`NOTIF-001`) until a member records a completed review — a note, an actor, a time and the next review date — or supersedes the decision. An overdue decision stays Accepted.
- **DEC-006 — A proposed decision is editable.** While a decision is Proposed, a member with edit access on its page can change its question, options, outcome, rationale, owner, decided date, review date and citations. Each change writes a revision (`REV-001`) keeping the previous content with its actor and time, resubmitting an unchanged proposal writes no revision, and the history is readable under `REV-002`. Accepting the decision ends this, and `DEC-003` governs from then on.

## Full flagship and sustained inquiry

Within the category job these clauses carry machinery the target clauses rely on: suggestions (`SUG-*`) for `KEEP-002`, sources (`SOURCE-*`) for `CONNECT-*`, skills and effects (`SKILL-*`, `EFFECT-001`, `EFFECT-003`) for `KEEP-006`, and the agent interface (`AGENT-001`) for `API-003`. The inquiry (`INQ-*`), trial (`TRIAL-*`) and account-activation (`EFFECT-002`) clauses go beyond maintaining and answering company knowledge. They remain the owner-accepted flagship extension of 27 September 2026, unchanged, and are not the centre of the product.

- **SUG-001 — Anchored suggestions.** Members with comment or edit access can propose a typed change as a separate record anchored to an exact page/block revision, inspect its diff and discuss it. A suggestion changes neither working page/block content nor published content before explicit acceptance under `SUG-002`. Preserve author, time, original text and exact revision; inaccessible anchors disclose no content. Direct granted maintenance remains a separate attributable revision path under `AI-003`/`AI-005`, not suggestion acceptance or a forced review queue.

- **SUG-002 — Resolve explicitly.** An authorized editor accepts selected suggestions atomically with a new revision/activity/receipt or rejects them with attribution. Recheck current access and revision; conflicting or lost anchors require explicit rebase/review, never silent application. Suggestion history survives reload and export.

- **SOURCE-001 — Connector contract.** Each connected source declares provider/tenant identity, owner, represented principals, scopes, supported effects, ACL mapping or named service identity, discovery coverage, cursor, last success/error, freshness and lag, deletion/revocation and retention guarantees. Unsupported guarantees are visibly unavailable. Multiple real document, collaboration/evidence and operational connector families are required.

- **SOURCE-002 — Exact passages.** Retain immutable source-native IDs, revision/hash, observed and source times, permitted originals or restorable references, extraction version and stable passage anchors. Citations open that exact revision or a content-free tombstone, never silently newest content.

- **SOURCE-003 — Scoped claims and authority.** Claims retain proposition, exact passages, kind, account/product/plan/audience/jurisdiction scope, effective/expiry interval, owner, verification, conflict and unknown state. Record named approving person or delegated office and applicable authority separately. Recency, popularity, model confidence and conversational evidence cannot create policy authority.

- **SOURCE-004 — Live observations.** Operational state is a typed response from its owning system with tenant/account identity, observation time and freshness. Documents cannot substitute for live entitlement or activation. Reconcile contradictions by scope, authority and effective dates; preserve unknown prices, expiry and unsupported facts.

- **SOURCE-005 — Revocation and deletion.** Source changes trace dependent claims, decisions, answers, skills and runs. Revoke access immediately at every use boundary, invalidate derived content and indexes, remove deleted material from exports and retain only permitted tombstones. Uncertain source ACLs fail closed. Partial indexing and lag remain visible.

- **SOURCE-006 — Credential lifecycle.** Credentials name issuer/owner, represented identity, scope/destinations, expiry and revocation. Disconnect blocks new dispatch, suspends queued/paused work, stops active work at a safe boundary and cancels unsent effects. Dispatched uncertainty remains unresolved until authorized read-back. Reconnect verifies identity, scopes, ACLs/deletions/revisions and each run/audience; old authority is never inherited automatically.

- **SKILL-001 — Versioned procedure.** Skills retain owner, immutable version, instructions, preconditions, context/source scope, allowed semantic tools and exact effects/targets, budgets, expected outputs/checks and escalation conditions. Runs pin exact versions; export SKILL.md and attachments as labelled snapshots, not live synchronization.

- **SKILL-002 — Evaluation and activation.** Draft → evaluated → active → superseded/retired lifecycle retains domain outcome and forbidden-effect evaluations, contradictions, stale inputs, outages, permission boundaries and prior accepted cases. Failed evaluation cannot activate. Activation requires owner action or exact recorded standing authority for evaluated routine refinement; it cannot widen sources/effects/audiences/budgets or change policy.

- **SKILL-003 — Version transitions.** Superseded/retired versions cannot start runs. Suspend queued/paused pinned runs and active work at boundaries by default; direct or applicable standing authority may cancel, continue the exact version or create a linked successor. Recheck all current sources/grants; stop and revocation override continuation. Preserve immutable history and receipts, reconcile ambiguity and never silently substitute versions. Notify subscribed external agents of changes.

- **EFFECT-001 — Durable effects.** Before external dispatch persist intent, exact semantic operation, principal/account/target, grant, source revisions and idempotency key. Distinguish prepared, dispatched, uncertain, confirmed, failed and cancelled. Reconcile lost responses by provider key or read-back; no blind repeat while uncertain and no success without receipt or verified state transition.

- **EFFECT-002 — Consent and product custody.** An inquiry causes no account/charge effect even if a tool grant exists. Paid SSO activation separately requires account-authorized consent, current price/interval/discount scope/expiry, applicable commercial approval, verified purchase/entitlement and exact activation grant. Distinguish request creation, customer setup pending and confirmed enabled. Article repair has independent publication authority. HappyToHelp owns conversations/replies and Orbit owns CRM/outreach, including their exact-human-send boundaries.

- **EFFECT-003 — Impact and maintenance.** Prepare read-only impact rehearsal before policy acceptance, identifying affected accounts/exceptions and dependent answers, procedures, skills and open work. Preserve immutable decisions; apply only determinate granted repairs, evaluate changed skills, invalidate stale answers and coalesce outcomes. Unaffected scoped exceptions stay scoped. Simulation is labelled read-only/isolated and never proof of live effects.

- **AGENT-001 — Semantic parity.** UI, API and MCP expose the same authorized reads, exact citations, proposals, granted effects, run status, pause/resume, stop and outcomes, with operation keys, current ACL/grant checks and receipts. External identities cannot bypass browser or product consent boundaries. Unsupported operations fail explicitly.

- **AGENT-002 — Portable owner interfaces.** Task/inquiry/experiment views derive from durable records, skill schemas and grants and preserve the accepted editor/tree/comments/history. Interface definitions are source-controlled or exportable. Owners can customize source/core/schema/UI/providers without losing data, skills, decisions, runs, interface definitions or migration history; no vendor kill switch or required proprietary hosted data account.

- **INQ-001 — Open questions.** An outcome request prepares an inquiry with decision context, rival hypotheses, discriminating observations, unresolved dependencies and independent investigations. Preserve useful interim findings, falsified hypotheses, uncertainty, next informative step and cost across bounded stages and durable waits. Members inspect/correct scope or stop work without designing schemas or coordinating agents.

- **INQ-002 — Reproducible reasoning.** Retain observations, assumptions, deductions and business choices separately, with population/applicability, counterexamples, failed hypotheses, executable analysis inputs/code/tool versions and results sufficient for independent replay. No private reasoning transcript is required. Checked logical propositions state bounds and checker versions; exact arithmetic/feasibility is not causal customer evidence.

- **INQ-003 — Bounded planning.** Prepare objectives, constraints, allocations, sensitivity and counterexamples from current evidence. Code checks arithmetic and invariants; retain assumptions and accepting owner. A feasible allocation is not proof of benefit. Methods and contextual interfaces are prepared from the request rather than assigned as setup chores.

- **INQ-004 — Routing and ambient discovery.** Typed semantic checks assess relevant permitted events for novelty, contradiction and impact and prepare consequential questions. Owner questions and scheduled frontier sweeps bypass ranking; shadow comparisons and sampled low-score audits measure missed important events. Routing follows measured fit within owner policy, never grants authority or fabricates a fallback after invalid output.

- **INQ-005 — Economical sustained work.** Deduplicate overlapping work only within an authorized audience and reuse revision-pinned context only after freshness/applicability/access checks. Budget compute and interruptions, keep meaningful progress inspectable and routine checks quiet. Stop branches with no useful information, exhausted budget or inaccessible evidence with reason/restart condition; independent authorized branches may continue.

- **TRIAL-001 — Predeclared comparison.** Before any trial effect, durably record eligibility, treatment/comparison assignment, baseline/instrumentation, forecast, expected and smallest meaningful effect, required precision, observation window, stopping conditions, guardrails, owner authority and exact effects. Prefer defensible randomization when feasible and disclose confounding otherwise. Changing a plan creates a revision, never retroactive predeclaration.

- **TRIAL-002 — Exposure and safety.** Only owning systems perform granted changes; retain attempted versus confirmed effects, receipts, actual exposure, missing observations and instrumentation changes. Guardrail breaches stop future effects and initiate only separately authorized supported recovery. Prospective windows must actually elapse; fixtures or simulated time are not prospective outcome evidence.

- **TRIAL-003 — Outcome classification.** At the declared window classify benefit, null, adverse or inconclusive against the predeclared comparison and guardrails, with uncertainty, applicability, selection bias and measurement quality. Null counts against a mechanism only with enough precision to rule out the meaningful effect; incomplete exposure or changed instrumentation may be inconclusive. Never substitute model agreement for empirical evidence.

- **TRIAL-004 — Reusable learning.** Every outcome revises explanations and methods while retaining original forecast, decision and failed hypotheses. Learned procedures/prompts/tests/code are versioned and evaluated before owner-authorized activation. No automatic model-weight tuning or cross-deployment sharing. Verify repeated-work savings without invalid assumption reuse.

- **FLAG-001 — Complete product gate.** All 191 inherited clauses with only recorded explicit amendments, all 22 baseline obligations, every value of the eight policies, all six USER-JOURNEYS.md journeys, full flagship and complete customer-activation inquiry → experiment → outcome → learning loop are required. No minimum subset, parser/component suite or self-report substitutes for full product acceptance. The core-wiki launch amendment authorizes a separately labelled core-wiki release with the default-disabled surfaces and retained obligations specified in the core-wiki launch amendment. This changes the launch gate only; it does not satisfy or waive full flagship acceptance.

- **FLAG-002 — Independent evidence.** Verify clean install, real browser/Worker journeys, customized owner copy, old-data migrations, restart/failure/revocation, complete export/restore, accessibility and load. Test genuine incumbent exports including Word; use real authorized document, evidence and operational providers for provider acceptance. Separate requirements, local implementation evidence, provider evidence and release/deployment evidence; no claim advances without independent semantic verification.

- **FLAG-003 — Value and held-out evaluation.** Compare identical accessible sources/tools against expert/current-tools and capable generic-agent baselines and owner-customized Slate. Freeze held-out cases separately from development and prevent future outcomes, later summaries/labels/indexes leaking past decision cutoff. Measure discoveries, falsification, missed-event recall, reproducibility, forecasts/interventions and every attempt’s cost/time/attention, setup, interruptions, failures and repair. Repeated quality-preserving useful outcomes, including null/adverse/inconclusive cases, are required; privacy/authority failures cannot trade for productivity.

- **FLAG-004 — Complete portable knowledge.** PORT-001/002/005/006 extend to source revisions and passages, claims/authority, skill versions/evaluations/grants, run stages/effect receipts, inquiries/analyses/trials/outcomes/learning and interface definitions with exact lineage. Retain credential metadata but exclude secrets/sessions and require fresh activation/authorization after restore. External state is reported, not recreated by assertion; exact public publishing and imported-actor restrictions remain.

## Target clauses

These clauses complete the category job alongside the published clauses above. Each one states the behaviour a buyer gets, the acceptance evidence that proves it through a public door (an HTTP route, the browser at 1440 and 390 pixels, a native app, a chat app, an MCP client or an import or export file), and its current status. Fakes are allowed only at a paid or network edge, and a provider fake proves local semantics only, never live provider behaviour (see [ACCEPTANCE.md](ACCEPTANCE.md)).

### Writing together

#### COLLAB-001 — Live co-editing by default.
Two or more members with `edit` access can type in the same page, and in the same block, at the same time. Their characters merge without conflict: there is no 409 and no last-write-wins for concurrent text, and `SAVE-003` conflicts remain only for structural edits that cannot merge, such as editing a block another member deleted, which offers restore. Every accepted operation is durable before it is acknowledged. A member's access is rechecked on every operation. Narrowing or revoking access closes that member's socket within 5 seconds, keeps their unsent text locally as an unsaved draft (`SAVE-004`), and never applies it. Reconnecting replays unacknowledged operations exactly once. Saved means committed (`SAVE-001`).

*Acceptance:* a two-browser journey at 1440 and 390 in which two members type into one paragraph at the same time and both see the same final text within 1 second. It also covers a dropped connection that reconnects with no lost or duplicated characters, and a grant revoked mid-typing that closes the editor within 5 seconds, keeps the draft unsaved and lists no revision for it. A Workers journey sends interleaved operations to the collaboration route and reads back one revision history.

*Status:* partial. A Durable Object co-editing service and a two-person journey exist (`src/core/features/collaboration/durable-object.ts`, `tests/qualification/ui-convergence/two-people-editing.mjs`), but the socket is disabled in the default `core-wiki` profile (`src/core/platform/config/launch-profile.ts`).

#### COLLAB-002 — Presence, cursors and following.
A page shows who is viewing and who is editing, with an avatar, a name and a colour. Each editor's cursor and selection appear live with their name. Clicking a collaborator follows their viewport, and members idle for more than 5 minutes are shown as idle. Presence reveals only members who can already read the page, and it never appears on the anonymous read view (`WEB-003`).

*Acceptance:* a browser journey with three members in which one sees two named cursors move within 500ms of typing and follows a collaborator to another heading. The anonymous published view of the same page shows no presence.

*Status:* partial. Committed-content refresh and "who has it open" ship by default, and live cursors ship behind the flagship socket (`src/core/features/collaboration/service.ts`, `tests/profile/profile.worker.test.ts`).

#### COLLAB-003 — Offline edits that merge.
Edits made while a client is offline, whether a browser with a cached page (`SAVE-004`) or an offline page in a native app (`MOBILE-003`), merge on reconnect through the same operation path as `COLLAB-001`. They are attributed to their author with their original time. A conflict that cannot merge, such as editing a block another member deleted, is shown with both versions and a restore action, and is never resolved silently.

*Acceptance:* a browser journey takes one client offline, edits three blocks while a second client edits one of them and deletes another, then reconnects. The merged page keeps both edits to the shared block, offers the deleted block for restore, and shows four attributed operations in history.

*Status:* partial. Offline detection and unsaved-draft recovery exist (`src/core/features/editor/ui/SaveStatus.tsx`, `tests/qualification/offline-refresh/transport.test.ts`); merging offline operations does not.

#### COLLAB-004 — Long pages and heavy tables stay fast.
A page with 2,000 blocks or a 50 × 500 table opens in under 1.5 seconds at p95 on the reference laptop profile (Chrome with Lighthouse's desktop throttling) and in under 3 seconds on the reference phone profile (Chrome with Lighthouse's mobile throttling: 4× CPU slowdown, 1.6 Mbps and 150ms round trips). With 20 co-editors, typing echoes locally in under 50ms and reaches the others in under 500ms. Table insert, delete, resize and sort complete in under 200ms. The limits are declared in `seed.json → limits`.

*Acceptance:* a scripted load journey against a deployed Worker records keystroke echo and remote-arrival latency with 20 co-editors at the declared limits, and a browser journey under each reference profile records p95 open time for the 2,000-block page and the 50 × 500 table. The runs' raw timings are kept with the release evidence.

*Status:* missing. No measured performance journey exists for these sizes.

#### COLLAB-005 — Attributed history from co-editing.
Co-edited operations become revisions (`REV-001`) that are grouped by time window and list every contributing author. Compare (`REV-004`) colours each change by its author, and restore (`REV-003`) works on any grouped revision.

*Acceptance:* after a two-author session, history lists one revision naming both authors, compare attributes each changed block to its author, and restoring the previous revision brings back the earlier text for both authors.

*Status:* partial. Revisions, compare and restore ship (`src/core/features/versions/service.ts`, `tests/qualification/ui-convergence/two-people-history.mjs`); grouping of co-edited operations by author depends on `COLLAB-001`.

#### PAGE-015 — Page lock.
A member with `edit` access can lock a page against accidental edits. Locking is separate from permissions: it changes no grant. A locked page shows a "Locked by name" banner and opens read-only for everyone, and an `edit` member unlocks it in one action. Both acts are recorded in activity. API calls, automations, imports and AI runs respect the lock and refuse with `PAGE_LOCKED`. Comments stay open.

*Acceptance:* a browser journey in which one member locks a page, a second editor sees it read-only with the banner while comments still post, an API update and an automation action on that page refuse with `PAGE_LOCKED`, and unlocking restores editing. Activity shows both acts.

*Status:* missing. Only database structure locks exist (`DB-009`, `src/core/features/databases/service.ts`).

#### BLOCK-011 — Synced blocks.
A block can be made synced: its content is defined once and rendered live in many pages, as with Notion synced blocks and Confluence excerpt-include. Editing any copy edits all of them, and each copy names its source page. A reader sees a copy only if they can read the source, and otherwise sees `LINK-004`'s access-needed state. Deleting the source turns each copy into a static block that keeps its last content.

*Acceptance:* a browser journey that syncs a block into two pages, edits one copy and sees the change in the other within 5 seconds. A member without access to the source sees the access-needed state, and deleting the source leaves static copies.

*Status:* missing.

#### BLOCK-012 — Columns and page layouts.
A page body can hold 2 to 5 side-by-side columns that blocks can be dragged into. Columns stack in order at phone width. Page export (`PORT-007`) and the Notion and Confluence imports (`IMP-002`, `IMP-003`) preserve the column layout.

*Acceptance:* a browser journey creates a three-column section at 1440 and sees it stack at 390. Importing a Notion export with columns and a Confluence page with a two-column layout reproduces both.

*Status:* missing. The editor supports single-column blocks only (`src/core/features/editor/validation.ts`).

#### BLOCK-013 — Equations and diagrams as code.
Inline and block LaTeX equations render with KaTeX, and Mermaid diagram blocks render as SVG. Both are rendered without network access, are sanitised under `BASE-INPUT-002`, are kept as source in Markdown export, and are imported from Notion equation blocks and Confluence code macros.

*Acceptance:* a browser journey that inserts an equation and a Mermaid flowchart, sees both render offline, exports Markdown that contains the source, and re-imports it unchanged.

*Status:* missing.

#### BLOCK-014 — Tables that work like tables.
Table blocks support header rows and columns, column widths, merged cells, cell colour, and sorting by a column. Rows and columns can be added and removed from the keyboard. Pasting from Excel or Google Sheets keeps rows and columns, and a table converts to a database (`DB-001`) and back without losing cells.

*Acceptance:* a browser journey that pastes a 10 × 20 range copied from a spreadsheet and keeps its shape, merges cells, sorts by a column, converts the table to a database and back, and finds the cells identical.

*Status:* partial. Table blocks with header rows ship (`src/core/features/editor/validation.ts`, `tests/qualification/interface/blocks.mjs`); merge, sort, paste fidelity and conversion do not.

#### BLOCK-015 — Assigned tasks with due dates.
A task item (`BLOCK-007`) can carry one assignee and a due date. Typing `@` inside a task assigns the member mentioned, and typing `//` or choosing from the date picker sets the due date, which renders in the reader's locale and shows as overdue once it passes. The assignee gets one inbox item when assigned (`NOTIF-001`), by email or push under their delivery settings (`NOTIF-005`, `NOTIF-006`), and one reminder on the due date (`NOTIF-004`). Reassigning notifies the new assignee once and the previous assignee not at all, and an assignee completing their own task notifies no one. Assigning a member who cannot read the page asks the assigner to share the page with them or cancel, and never notifies that member. Completion still records who and when. Tasks are read and changed through the API and MCP (`API-001`, `API-003`) under the same checks. A task item stays a block, and it still never appears in a database view.

*Acceptance:* a browser journey at 1440 and 390 types a task, assigns it with `@` and sets a due date with `//`. The assignee gets exactly one inbox item and, after a Workers journey advances time, exactly one due-date reminder. Reassigning notifies only the new assignee. Assigning a member without access prompts the assigner to share and sends that member nothing. The task shows as overdue after its due date.

*Status:* partial. Task items with server-owned completion attribution ship (`src/core/features/editor/tasks.ts`, `tests/flagship/content/repair.test.ts`); assignees and due dates do not.

#### BLOCK-016 — Task reports.
A body can hold a task report: a live list of tasks filtered by container, ancestor page, label, assignee (including "the current reader"), creator, due-date range and state, grouped by page, assignee or due date, and ordered and limited by the author. It follows `BLOCK-010`'s rules: it re-runs when the page is opened, shows when it last ran, shows each reader only the tasks on pages that reader can read, never renders a task on a draft (`LIFE-002`), and says so when its source container is deleted. A reader with edit access to a task's page can complete the task from the report. Confluence Task Report macros import as task reports (`IMP-010`).

*Acceptance:* a browser journey embeds a report filtered to one container and one assignee over tasks on three pages. One reader sees all three tasks. A reader without access to one of the pages sees the other two, with no count, title or placeholder for the third. Completing a task from the report updates its page.

*Status:* missing. Content queries over pages ship (`BLOCK-010`, `tests/qualification/interface/blocks.mjs`); there is no task source.

#### BLOCK-017 — Table of contents block.
A body can hold a table of contents built from its headings, placed anywhere in the page, with a chosen range of heading levels and a flat or nested style. Like `PAGE-010`'s side outline, it follows the current body within 2 seconds of an edit, and each entry links to its heading. It survives export as a linked list in Markdown, HTML, PDF and Word (`PORT-007`, `PORT-010`), and Confluence's Table of Contents macro imports as this block (`IMP-010`). It is separate from the side outline.

*Acceptance:* a browser journey inserts a table of contents limited to heading levels 1 and 2, adds a heading and sees its entry within 2 seconds, follows an entry to its heading, and exports Markdown that contains the linked list. Importing a Confluence page with a Table of Contents macro produces the block.

*Status:* missing. The side outline exists (`PAGE-010`, `src/core/features/pages/ui/PageOutline.tsx`); there is no table-of-contents block.

#### BLOCK-018 — Status labels.
An inline status label is a short coloured lozenge with text, in grey, blue, green, yellow, red or purple, inserted from the block menu or by typing `/status`. Screen readers and search read it as text. It survives export, as text with its colour name in Markdown and as a styled span in HTML, and Confluence's Status macro imports as this label with its colour (`IMP-010`). It is separate from a page's status (`STAT-*`).

*Acceptance:* a browser journey inserts a green "Done" label and a red "Blocked" label, finds the page by searching for "Blocked", and exports and re-imports the page with both labels and colours intact. A Confluence page with Status macros imports with matching labels and colours.

*Status:* missing.

#### BLOCK-019 — Diagrams.net diagrams.
A diagram block holds a diagrams.net (draw.io) diagram: its `.drawio` source and a rendered SVG preview. A member with edit access opens it in the diagrams.net editor (jgraph/drawio, Apache-2.0), which Slate serves from the deployment's own origin so that diagram content never reaches a third party. Saving writes a new revision of the block (`REV-001`). Readers, including the anonymous read view (`WEB-003`), see the preview sanitised under `BASE-INPUT-002`, and anyone who can read the page can download the source as a `.drawio` file. Confluence draw.io diagrams import as diagram blocks with their source and preview. Gliffy diagrams are converted to diagrams.net, with the original `.gliffy` file attached to the block (`IMP-010`). A diagram that cannot be converted keeps its preview image and its source attachment and is named in the loss report.

*Acceptance:* a browser journey inserts a diagram, edits it in the editor while the request log shows no request leaving the deployment's origin, saves it, sees a new revision, and downloads the `.drawio` file. The published page shows the SVG and loads no third-party resource. Importing the `IMP-010` fixture's draw.io and Gliffy diagrams produces editable diagram blocks whose previews match their sources, with the original files attached.

*Status:* missing.

#### BLOCK-020 — Group mentions.
A mention can name a group (`WORK-009`). It renders the group's name and notifies, once each, the members of that group who can read the page, never a member who cannot. Before the comment or edit is saved, the composer shows how many people will be notified. Owners can limit mentions of groups larger than the size in `seed.json → limits` to container administrators. Confluence team mentions import as group mentions where the team is mapped through `IMP-003`'s reviewed principal mapping, and as plain text otherwise.

*Acceptance:* a Workers journey mentions a four-member group on a page one of its members cannot read and finds exactly three inbox items. A browser journey shows "3 people will be notified" before saving, and a member without permission who mentions a group above the size limit is refused with a reason.

*Status:* partial. Person mentions notify (`BLOCK-005`, `tests/e2e/editor/rich-text-editing.test.tsx`); group mentions do not exist.

#### BLOCK-021 — Attachment previews.
Every file attachment (`BLOCK-008`) of a supported preview type opens in an in-page viewer inside its file block and in a full-screen viewer. Both viewers offer page or sheet navigation, zoom, find-in-file and a download button. The supported preview types are:

- PDF;
- Word `.docx` and `.doc`, Excel `.xlsx`, `.xls` and `.csv`, and PowerPoint `.pptx` and `.ppt`;
- OpenDocument `.odt`, `.ods` and `.odp`;
- plain text, Markdown, JSON and source code;
- every image, video and audio type `BLOCK-008` already displays.

Slate renders each preview itself after upload, as a sanitised rendition stored beside the file. PDF pages render through a PDF renderer served from the deployment's own origin, and Office and OpenDocument files convert to sanitised HTML or page images. Sheets keep their tabs, and slides keep their order and speaker notes. A rendition runs no script or macro from the file and fetches no external reference (linked images, remote templates, OLE links). It is served same-origin in a sandboxed frame under a content security policy that allows no third-party request. The raw file keeps `BLOCK-008`'s download disposition with its declared type and `nosniff`; only the rendition is served inline, with exactly the page's access, or through its public link (`WEB-003`).

Some files get no preview: an unsupported type, a password-protected or corrupt file, a file larger than `seed.json → limits.attachmentPreviewBytes`, or a file with more pages than `seed.json → limits.attachmentPreviewPages`. Each shows its name, type, size, a download button and the reason. A preview always shows the attachment version its block shows (`BLOCK-022`).

*Acceptance:*

- A browser journey at 1440 and 390 attaches a PDF, a `.docx`, an `.xlsx`, a `.pptx`, a `.doc`, an `.xls`, a `.ppt` and an `.odt`. It opens each in the in-page and the full-screen viewer, moves to its second page, sheet or slide, and finds a word in it. Throughout, the request log shows no request leaving the deployment's origin (the `BLOCK-019` pattern).
- A `.docx` with a remote image and a remote template, and a PDF with embedded JavaScript, produce no outbound request and run no script.
- Downloading each raw file still returns a download disposition and `nosniff`.
- A member without page access gets 404 for both the rendition and the file. The anonymous view of a published page shows the preview.
- A file over the size limit and a password-protected PDF show the no-preview state with its reason.
- The `IMP-010` fixture's Attachments and View File macros import as file blocks that preview.

*Status:* missing. Images, video and audio display inline (`BLOCK-008`, `src/core/features/media/routes.ts`, `tests/qualification/policies/safety-history.test.ts`); every other attachment is download-only.

#### BLOCK-022 — Attachment versions.
Uploading a file to a page that already has an attachment of the same name creates the next version of that attachment, not a second file. This holds for a drop, the file picker, `API-001` and every import. A "Replace file" action on a file block does the same under any file name.

- **Each version** keeps its uploader, time, size, content hash and an optional note.
- **The attachment's history** lists every version. Each version previews (`BLOCK-021`) and downloads. Restoring a version makes it the new latest version and deletes none.
- **File blocks and links** show the latest version unless they are pinned to one. A page revision (`REV-001`) opened from history shows the attachment version that was current at that revision.
- **Versions follow the page.** They inherit its access, move with it, count towards `seed.json → limits.attachmentStorageBytesPerDeployment`, are included in exports with their history (`PORT-001`), and are erased with the attachment under `BASE-DATA-003`.
- **Deleting one version** needs edit access, is recorded in activity and leaves the other versions.

*Acceptance:*

- A Workers journey uploads `policy.pdf` to a page and then a different `policy.pdf` to the same page. It finds one attachment with versions 1 and 2, each downloadable with its own bytes and hash, uploader and time, and the file block shows version 2.
- Restoring version 1 creates version 3 with version 1's bytes. The page revision from before the second upload shows version 1.
- A browser journey at 1440 and 390 does the same through the file block's history.
- A member without page access gets no version.
- Exporting and re-importing the workspace keeps all three versions in order.
- The `IMP-007` fixture's attachment with two versions imports with both.

*Status:* missing. Each upload is a separate stored file (`src/core/features/media/service.ts`), and a Confluence attachment with several versions is reported as ambiguous and imports one file (`src/core/features/imports/confluence/xml-media.ts`).

### Organising and finding

#### CONT-010 — Space blog and announcements.
A container has a blog: dated posts with an author, a cover and comments that appear in a feed in the container and on followers' home pages (`NAV-001`). Following a container notifies its followers of new posts (`NOTIF-001`). Posts are pages and keep every page clause. Confluence blogs import as posts (`IMP-003`), not as folders.

*Acceptance:* a browser journey in which one member publishes a post, a follower gets the notification and sees the post on Home, and importing a Confluence space with blog posts creates posts that keep their dates and authors.

*Status:* missing. The Confluence importer reports blogs as unmapped (`IMP-003`).

#### CONT-011 — Space home and company hub.
Each container has an editable home page that its index opens first. Workspace owners curate a company hub: one page that every member sees from Home, made of chosen links, a news feed of announcement posts and verified key pages.

*Acceptance:* a browser journey in which an owner builds a hub, a new member's first Home shows it, and the hub's links show each reader only pages that reader can read.

*Status:* partial. A container index with names, descriptions and access ships (`src/core/features/containers/service.ts`, `tests/qualification/policies/container-links.test.ts`); there are no curated container homes or hub.

#### CONT-012 — Watch a container.
A member can watch a whole container. For each page in it the member can read, a watched container delivers page creation, edits, moves in or out, archiving or trashing, and comments and replies, as one inbox item each (`NOTIF-002`) or as one line each in a digest under `NOTIF-005`. Edits are coalesced into one item per page, per author, per editing session (`COLLAB-005`'s window). A page the member cannot read, and every draft (`LIFE-002`), produces nothing. A member who watches both a page and its container gets one item, not two. Blog posts (`CONT-010`) arrive the same way. Home shows a Following section with the same events for the member's watched pages and containers; it is personal, not a workspace-wide feed (`NAV-001`). A container's administrators can see its watchers.

*Acceptance:* a Workers journey has a member watch a container. Another member then creates a page, edits it in two sessions, comments on it, and creates a restricted page the watcher cannot read. The watcher gets exactly four items (the creation, two edit sessions and the comment) and nothing for the restricted page, and a comment on a page they also watch directly arrives once. A variant with a daily digest preference finds the same four events as digest lines, and a browser journey sees them in Home's Following section.

*Status:* missing. Page watches ship (`PAGE-009`, `src/core/features/navigation/service.ts`); container watches do not.

#### PAGE-016 — Autowatch on create and edit.
Creating a page, or saving an edit to it, watches it for that member, as commenting already does (`PAGE-009`), until they unwatch it. Unwatching stops autowatch for that page, so a later edit by the same member does not watch it again. A member can turn autowatch off for themselves, and `NOTIF-006` sets the workspace default. An implicit watch delivers the same events as an explicit one.

*Acceptance:* a Workers journey has one member create a page and a second member edit another page, then a third member comments on both, and the creator and the editor each get exactly one notification. After the editor unwatches their page and edits it again, a further comment notifies them of nothing. A member with autowatch off creates a page and is not watching it.

*Status:* partial. Implicit watching after a comment ships (`src/core/features/navigation/service.ts`, `src/core/features/comments/service.ts`); watching on create and edit does not.

#### WORK-016 — People directory and expertise.
Each member has a profile with their name, title, team, manager, time zone and the pages they own, verify and frequently edit. Expertise tags are derived from that work, and the member can edit or hide them. The directory is searchable, guests see only the people on pages shared with them, and expertise is used to route reviews and questions (`STAT-006`, `KEEP-003`).

*Acceptance:* a browser journey that finds the expert for a topic from the directory, sees the pages they own and verify, hides a derived tag, and confirms a guest cannot list members beyond their shared pages.

*Status:* missing.

#### SHARE-009 — Share with a message.
The share panel can send a page to members, groups or email addresses with an optional plain-text message no longer than the limit in `seed.json → limits`. A recipient who can already read the page gets one inbox item, and an email under their delivery settings (`NOTIF-005`, `NOTIF-006`), carrying the sender, the page title, the message and a link. A recipient without access is offered to the sender as a grant to add (`SHARE-001`, or a guest invitation under `SHARE-006`) and receives nothing until it is added. The message is never the page body, and it is kept in the sender's activity.

*Acceptance:* a browser journey shares a page with a message to one member who can read it and one who cannot. The first gets one inbox item and one email with the message. The second is offered to the sender as a grant and receives nothing until it is added, then gets one item.

*Status:* partial. Granting access notifies the grantee (`NOTIF-001`, `tests/qualification/backend/emitted.mjs`); there is no share-with-message action.

#### TMPL-007 — Starter templates.
Slate ships starter templates that work from the first sign-in: meeting notes (attendees, agenda and assigned tasks under `BLOCK-015`), retrospective, decision (`DEC-*`), how-to, troubleshooting, product requirements (with a task report and issue embeds), project plan, runbook (`KEEP-006`), onboarding page, team home (`CONT-011`) and policy page (with an owner and a review date). Each is a shipped template under `TMPL-004`: it can be duplicated into an editable copy and is never edited itself. Each is categorised in the gallery (`TMPL-001`) and previews under `TMPL-002`.

*Acceptance:* a browser journey finds each named starter template in the gallery by category, previews it, creates a page from meeting notes and assigns a task in it, and duplicates the retrospective into an editable copy while the shipped template stays unchanged.

*Status:* partial. Shipped templates are protected from editing and erasure (`src/core/features/templates/service.ts`, `src/core/features/templates/erasure.ts`); no starter set ships.

#### NAV-007 — My tasks.
Every member has a My tasks view, reachable from Home and the sidebar. It lists the tasks assigned to them and, in a second tab, the tasks they created, across every page they can read. It filters by open, completed and overdue, by container and by due-date range, sorts by due date (undated tasks last), page or container, and paginates stably while tasks change. Completing a task in the list completes it on its page under the page's edit check (`BLOCK-007`). A task leaves the list when its page becomes unreadable to the member, is a draft they cannot read (`LIFE-002`) or is in the trash. Guests see only tasks on pages shared with them.

*Acceptance:* a browser journey assigns one member three tasks on two pages with different due dates. Their My tasks view, filtered to open and sorted by due date, lists exactly those three in that order. Completing one from the list marks it done on its page, and revoking the member's access to one page removes its task from the list on the next load.

*Status:* missing.

#### SEARCH-010 — Labels and advanced search.
Search and container views filter by label. Queries accept the operators `title:`, `label:`, `in:` (container), `by:` (contributor), `owner:`, `status:`, `verified:`, `before:`, `after:`, `type:` and quoted phrases, combined with `AND`, `OR` and `-`. A member can save a search, and a saved search can feed a content query (`BLOCK-010`). Operators never widen access (`SEARCH-005`).

*Acceptance:* a Workers journey over seeded pages checks each operator and each combination against expected result IDs for two members with different grants. A browser journey saves a search and embeds it in a page.

*Status:* partial. Labels are stored and search has kind, container, contributor, status and date filters (`src/core/features/pages/service.ts`, `src/core/features/search/service.ts`, `tests/e2e/search/fts-permissions.test.ts`); label filtering, operators and saved searches do not exist.

#### SEARCH-011 — Verified-first ranking and trust badges.
Search results, link cards, content queries and answers show each page's verification state (verified with its owner and expiry, lapsed, or unverified) and its last-updated time. Among equally relevant results, ranking puts current verified pages ahead of unverified ones and lapsed or archived pages last, and collapses near-duplicates into one result with a "similar pages" control. Two pages are near-duplicates when the Jaccard similarity of their current revisions' 5-word shingles, estimated by MinHash, is at least `seed.json → limits.nearDuplicateSimilarity` (0.8 by default); the same definition drives `KEEP-004`. A member can sort by relevance, last updated or most viewed.

*Acceptance:* a Workers journey over a seeded corpus of a verified, a lapsed and an unverified page with equal text matches asserts their order and badges. A seeded pair at a measured similarity of 0.85 collapses into one result and a pair at 0.7 does not; lowering the limit to 0.65 collapses the second pair too. A browser journey sees the badges and the collapsed near-duplicates.

*Status:* partial. Status and verification state exist and search ranks by relevance (`src/core/features/page-status/state.ts`, `src/core/features/search/service.ts`); verification-aware ranking, badges in results and duplicate collapse do not.

#### SEARCH-012 — Connected results in search.
When connectors are attached (`CONNECT-001`), one search covers Slate content and connected items, which are labelled with their source and opened in their source. Each connected result is shown only if the asking member's mapped identity can read it in the source now (`CONNECT-002`). Connected results never change Slate result ranking for members without that source.

*Acceptance:* a Workers journey with a provider fake at the network edge returns a Drive file to a member mapped to its reader and hides it from an unmapped member, with identical Slate results for both. Provider acceptance repeats this against a real authorized Google Drive.

*Status:* partial. Source memory and retrieval exist behind the flagship profile (`src/core/features/source-memory/service.ts`); there is no unified search surface.

#### SEARCH-013 — Search inside attached files.
Slate extracts the text of every attachment of a type `BLOCK-021` previews and indexes it with the page. That covers PDF text layers, Office and OpenDocument text, slide text and speaker notes, sheet cell values, plain text, Markdown and code. Extraction reads the latest version (`BLOCK-022`), up to `seed.json → limits.attachmentTextBytes` per file. When AI is on (`AI-001`), image-only PDFs and images are read by the owner's configured provider and indexed the same way.

- **Results.** Global search (`SEARCH-001`) matches attachment text within its 500ms bound. A match is returned as the file, naming its page, with a snippet from the file and the match highlighted. Opening it opens the viewer at the matching page, sheet or slide. Search can be filtered to attachments, and by file type (`SEARCH-010`).
- **Access.** `SEARCH-005` applies unchanged: a member without access to the page gets no result, snippet, facet or total from its files.
- **Freshness.** A new version is re-indexed through the page's dirty generation (`PORT-004`), and text from an older version stops matching.
- **Limits.** A file whose text exceeds the limit shows "partially indexed". A file with no extractable text shows "no searchable text" while AI is off.
- **Answers.** Cited answers (`ANSWER-001`) may cite attachment text. The citation opens the viewer at the cited version and page.

*Acceptance:*

- A Workers journey attaches a PDF and a `.docx` whose bodies each contain a phrase found nowhere else, plus an `.xlsx` and a `.pptx` with their own phrases. Searching each phrase returns that file and its page with a snippet from the file. A browser journey opens the viewer at the matching page.
- A member without access to the page gets no result, snippet, facet or total for any of the phrases.
- Uploading version 2 without the phrase makes the phrase stop matching once indexing settles.
- A file larger than the text limit shows "partially indexed".
- With AI on and a provider fake at the network edge, a scanned PDF's phrase becomes searchable.
- An import of the `IMP-007` fixture has its attachment text searchable before the import is Completed (`PORT-004`).

*Status:* missing. Search indexes titles, bodies, record fields, containers, comments and templates (`src/core/features/search/record-build.ts`); attachment text is not extracted.

#### SEARCH-014 — Old Confluence URLs find their Slate record.
Wherever a member can paste a URL, an old Confluence URL that `IMP-013` recognises resolves to its imported record:

- **Search.** Pasting the URL into global search (`SEARCH-001`) returns the record as the first result. A record the member cannot read is returned as `LINK-004`'s access-needed result, with no title, snippet or author, and an unmapped URL returns one "Not migrated" result naming the source space key.
- **Link field.** Pasting the URL into the editor's link field links to the record's permanent URL and shows its current title (`LINK-003`).
- **Page body.** Pasting the URL into a page body inserts a link to the record, not a link card to the old site. One undo restores the URL as pasted.
- **API and MCP.** `GET /api/v1/resolve?url=` and the MCP `resolve` tool (`API-001`, `API-003`) return the record's ID and URL to a token or client acting as a member who can read it, the access-needed result otherwise, and `not_migrated` for an unmapped URL.

*Acceptance:* over the `IMP-013` fixture's tiny link, page-ID URL, `/display/` URL and blog URL, a Workers journey searches each one and gets its record first, and calls the resolve endpoint with tokens for a reader and a non-reader: the reader gets the record, the non-reader gets the access-needed result with no title. A browser journey at 1440 and 390 pastes the tiny link into the link field and sees the record's current title, pastes the page-ID URL into a paragraph and gets a link to the record, undoes once and gets the URL as pasted, and pastes an unmapped URL into search and sees "Not migrated" with its space key.

*Status:* missing.

### Keeping knowledge true

#### STAT-006 — Review requests and expert queues.
A page owner or editor can request review from a named member or group, with a due date and a note. The reviewer gets an inbox item (`NOTIF-002`) and a queue of pages awaiting their review, and can verify (`STAT-003`), request changes as a comment, or reassign. An overdue review reminds the reviewer once and then the container owner. Owners can re-verify in bulk from the queue, opening each exact revision (`STAT-003` still requires a human to open the revision being attested).

*Acceptance:* a browser journey in which one member requests review, the reviewer sees the queue item, opens the revision and verifies it, and an overdue request reminds the reviewer and then the container owner exactly once each.

*Status:* partial. Review state and access checks exist (`src/core/features/page-status/review.ts`, `tests/e2e/review/review-access.test.ts`); there are no queues, due-date reminders or escalation.

#### STAT-007 — Verification rules.
Container owners configure nightly rules that flag or unverify, never verify. Examples: unverify a page when a page or source it cites changes, flag pages with no owner, and flag verified pages unviewed for 180 days. Each run records what it changed and why in activity, notifies affected owners once in a coalesced notice, and can be previewed before it is turned on. No rule, automation or AI action renews verification (`STAT-004`).

*Acceptance:* a Workers journey runs a rule over seeded pages and asserts exactly the expected unverifications, flags, activity entries and one coalesced notice per owner. An attempted rule action of "verify" is rejected.

*Status:* missing.

#### CARD-001 — Knowledge cards and collections.
A card is a short page kind with a soft length limit (`seed.json → limits`, 500 words by default: past it the editor warns and suggests a page, and nothing is truncated), a question-style title, an owner, verification required by default, and placement in a collection (a container with card-friendly views). Cards render compactly in search, answers, chat (`CHAT-002`) and the browser extension (`CARD-002`). Guru cards import as cards (`IMP-008`).

*Acceptance:* a browser journey creates a card and finds it as a compact result with its verification badge, and a 600-word card shows the length warning and saves intact. A Guru import creates cards in collections that keep their owners and their verification intervals as imported metadata.

*Status:* partial. Containers organise pages (`src/core/features/containers/service.ts`); there is no card kind or compact rendering.

#### CARD-002 — Browser extension.
A Chrome and Edge extension signs in as the member and searches and asks Slate from any tab. On sites the owner allowlists, such as Salesforce, Zendesk, HappyToHelp, Orbit and GitHub, it suggests cards relevant to the open record. It reads page text only after the member opens the extension on that tab, sends only the query and the record title, and shows only what the member can read.

After a Confluence cutover, a workspace owner lists the old Confluence hostnames (`IMP-013`). The extension then redirects the member's navigation to a Confluence path on those hosts (`/wiki/*`, and `/display/*`, `/x/*`, `/pages/*`, `/spaces/*` and `/download/*` on a Server or Data Center hostname) to Slate's resolver, using a browser redirect rule. It holds no map, reads nothing from the old page and leaves every other path on the host, such as Jira's `/browse/*` on the same `atlassian.net` site, untouched. A member can switch the redirect off. IT can force-install the extension, with the old hostnames preset, on managed Chrome and Edge browsers through enterprise policy.

*Acceptance:* an automated Chromium journey loads the packed extension, signs in, opens an allowlisted fixture page, sees a relevant verified card, and confirms through a request log that no page text left the tab before the member opened the extension. With `ourcompany.atlassian.net` listed as an old hostname and served by a fixture host, navigating to the `IMP-013` fixture's tiny link and page-ID URL lands on their Slate records, `/browse/ENG-1` on the same host is not redirected, and with the member's switch off the tiny link is not redirected.

*Status:* missing.

#### CARD-003 — Required reading and announcements.
An owner can send a page or card to a group as required reading. Each member gets an inbox item and a reminder after a set number of days, and their acknowledgement is recorded. The sender sees who has acknowledged. Slate records no reading time and no scroll depth, and acknowledgements are visible only to the sender and workspace owners.

*Acceptance:* a browser journey sends a page to a group, two members acknowledge, one is reminded once, and the sender's report lists exactly those states with no reading-time data.

*Status:* missing.

### Structured knowledge

#### DB-013 — Database forms.
A database can publish a form whose questions map to its fields, with required fields, help text and simple conditional questions. A form is open to members, to named guests or, if the container allows public links (`CONT-007`), to an anonymous link with rate limits and a spam check (a honeypot field, a per-address rate limit, and Cloudflare Turnstile when the owner configures it). Each submission creates a record and can trigger automations (`AUTO-001`). Standalone survey and quiz products belong to [Pencil](https://github.com/just-every/run-pencil).

*Acceptance:* a browser journey publishes a form with a conditional question, submits it as a guest and anonymously, sees two records with mapped values, and sees an automation fire on each submission. The conditional question appears only when its condition is met, and a submission that fills the honeypot or exceeds the rate limit creates no record. Forbidding public links makes the anonymous form stop resolving at once.

*Status:* missing.

#### DB-014 — Dashboards.
A page can hold a dashboard: several charts (`DB-008`) and views (`DB-011`) arranged in a grid, with dashboard-wide filters such as a date range or a person that apply to every tile. Each tile computes over the reader's authorized records only (`DB-002`).

*Acceptance:* a browser journey builds a dashboard of three charts and a view, applies a date filter that changes every tile, and confirms a member with fewer grants sees lower counts and no restricted values.

*Status:* partial. Charts over a view exist (`src/core/features/databases/ui/workspace/DatabaseChart.tsx`, `tests/qualification/policies/structured-views.test.ts`); multi-tile dashboards with shared filters do not.

#### DB-015 — Record templates and recurring records.
A database has record templates (default fields and a body), and a template can repeat on a schedule (daily, weekly on given days, monthly or yearly), creating a record at the set time in the owner's time zone. A schedule runs exactly once per occurrence, even after restarts, and pauses with a visible reason if its creator loses access.

*Acceptance:* a Workers journey advances a scheduled trigger across two occurrences and a restart and finds exactly two records. Revoking the creator's access pauses the schedule with its reason shown.

*Status:* partial. Scheduled automation triggers and page templates exist (`src/core/features/automation/events.ts`, `src/core/features/templates/service.ts`, `tests/qualification/policies/automation-templates.test.ts`); record templates and recurring templates do not.

#### DB-016 — AI autofill fields.
A field can be an AI field (summary, extraction, classification or translation) computed from the record's own content. It re-runs when its inputs change, cites the record revision it read, is labelled AI-generated, counts against AI budgets (`AI-012`), and never reads records the field's owner cannot read. A member can override a value, and an override is kept until it is cleared.

*Acceptance:* a Workers journey with a provider fake at the network edge fills a classification field for 20 records, re-runs only the 3 records that changed, keeps a manual override, and records usage against the budget.

*Status:* missing.

### Notifications and follow-up

#### NOTIF-004 — Reminders.
A date mention (`BLOCK-005`) can carry a reminder at the date or at a chosen offset. A member can set a reminder on any page or task item (`BLOCK-007`), and a task with a due date reminds its assignee on that date (`BLOCK-015`). Reminders arrive in the inbox, and by email or push where the member opted in (`NOTIF-005`), at the member's local time, exactly once, and are rechecked against access at delivery.

*Acceptance:* a Workers journey sets reminders in two time zones, advances time, and finds exactly one inbox item each at the right local time. A reminder on a page whose access was revoked is not delivered.

*Status:* missing.

#### NOTIF-005 — Email, push and digest delivery.
Each member chooses, per event kind, between in-app only, immediate email, a daily or weekly digest, push on their devices (`MOBILE-004`), and a chat direct message (`CHAT-004`), or keeps the workspace default for that kind (`NOTIF-006`). The inbox item is created whatever the choice. Email goes through `mail.sender.v1` from the configured sender and carries the event, the actor, the page title and a link, never a page body. Recipient access is rechecked at send, and an unsubscribe link changes that member's preference without sign-in. Digests coalesce watched page and container changes (`CONT-012`), mentions, task assignments and due tasks, review requests and lapsed verifications. A watched change carries a change summary: the counts of blocks added, changed and removed and of comments added since the member's last notice. When a workspace owner turns on "section names in notifications", the summary also names the headings the changed blocks sit under, for example "3 blocks changed in Rollout plan". It never carries block or comment text.

*Acceptance:* a Workers journey with a mail provider fake at the network edge opts a member into a daily digest, generates eight events including one on a page the member later loses access to, and receives exactly one digest with seven items and no body text. The unsubscribe link changes the preference. An edit that changes 3 blocks under the heading "Rollout plan" appears as "3 blocks changed" with the owner switch off and "3 blocks changed in Rollout plan" with it on, and no text from those blocks appears in either email.

*Status:* missing. `MAIL-001` currently limits mail to sign-in and invitations.

#### NOTIF-006 — Workspace notification defaults.
A workspace owner sets the default delivery for each event kind: mentions, comments and replies on watched or authored pages, task assignments and due tasks, review requests, access grants, shares with a message, watched changes, lapsed verifications and required reading. Each default is one of in-app only, immediate email, a daily or weekly digest, push, or a chat direct message (`CHAT-004`), and the owner also sets the default for autowatch (`PAGE-016`). A member who has not chosen for an event kind receives it exactly as the default says, and a change to the default reaches them from the next event. A member's own choice, including an unsubscribe, survives later changes to the default and is shown as theirs. A new workspace starts with Confluence's defaults: mentions, replies, task assignments, review requests and access grants by immediate email, watched changes as a daily digest, and autowatch on. A workspace upgraded from a version without this setting keeps in-app delivery only until an owner sets a default, and its owners are asked once. Every email keeps `NOTIF-005`'s rules: a title and a link only, access rechecked at send, and a one-click unsubscribe that works without signing in.

*Acceptance:* a Workers journey with a mail provider fake at the network edge sets a default of immediate email for mentions and a daily digest for watched changes, invites a member who sets nothing, and finds one immediate email for a mention and one digest with the watched changes. A second member who unsubscribed from mention email before the default changed gets no mention email. Changing the default to in-app only stops the first member's mail from the next event. A new workspace's first mention produces an immediate email with no owner action, and no email contains a page body.

*Status:* missing. Notification email does not exist (`MAIL-001`).

#### AUTO-006 — Outbound automation actions.
Rule actions (`AUTO-001`) can also:

- post to a Slack, Microsoft Teams or Nook channel;
- call a signed webhook (`API-002`);
- send an email from a member's own connected Gmail or Outlook mailbox under that member's OAuth grant, never from Slate's sender (`MAIL-001`);
- create a Vector or Jira issue, with a backlink to the page (`EMBED-005`).

Each action acts as the rule's actor (`AUTO-002`), sends only titles, links and fields the actor can read, uses an operation key so retries never duplicate, and records its receipt in the run log (`AUTO-003`).

*Acceptance:* a Workers journey with provider fakes at the network edge fires one rule four times and finds one message, one webhook, one email and one issue per firing. A retried firing produces no duplicate, and every receipt appears in the run log.

*Status:* partial. Field, page and notification actions and a Slack chat notifier exist (`src/core/features/automation/actions.ts`, `src/core/features/notifications/slack.ts`); Teams, Nook, webhook, mailbox and issue actions do not.

#### AUTO-007 — Triggers from connected tools.
Rules can trigger on events from connected tools: a GitHub or GitLab pull request merged or released, a Vector or Jira issue changing state, a Drive file changing, or an inbound signed webhook. They can then flag a page, request review, create a record or start a `KEEP-001` check. Event payloads are untrusted content (`AI-007`).

*Acceptance:* a Workers journey posts a signed GitHub-shaped webhook and sees the matching rule run once and request review on the linked page. An unsigned or replayed delivery is rejected and logged.

*Status:* missing.

#### AUTO-008 — Accountable follow-through.
Every background action is a durable job with an accountable owner, a due condition, visible progress, a visible failure and an explicit stop or resolution state. This covers rules, schedules, reminders, review escalations, connector syncs, verification rules and agent work. A failed or stuck job appears on the owner's Home without a search. Re-running a job never duplicates a message, record or issue, and stopping a job cancels its unsent work.

*Acceptance:* a Workers journey kills a job mid-run and finds it resumed once with no duplicate effect. A forced failure appears on the owner's Home, and stopping a queued job cancels its pending sends.

*Status:* partial. Automation run logs with failure states and repeated-failure disable exist (`src/core/features/automation/jobs.ts`, `tests/qualification/policies/automation-templates.test.ts`); the guarantee does not yet span every job kind.

### Moving in and out

#### IMP-006 — Notion import with comments and live databases.
Slate imports Notion's HTML export, including page and block comments, which become threads anchored to the matching blocks with their authors and times. It also imports through the Notion API, keeping databases with their relations, rollups, formulas, views and filters, with page-level sharing mapped through reviewed principal mappings (`IMP-003`'s rules). An API import can re-sync changed pages until cutover, and the loss report names every unsupported block, formula function and permission.

*Acceptance:* imports of a real Notion HTML export with comments and of a real Notion workspace over the API with a provider-recorded fixture. Threads land on the right blocks, rollups recompute to Notion's values or are marked not-recomputed, and a re-sync updates only changed pages. A provider acceptance run repeats this against a real workspace.

*Status:* partial. Notion Markdown and CSV import with preview, apply and undo ships (`src/core/features/imports/service.ts`, `tests/e2e/imports/real-exports.test.ts`, `tests/e2e/imports/preview-undo.test.ts`); HTML comments and API import do not.

#### IMP-007 — Confluence Cloud live migration.
Through the Confluence Cloud REST API (OAuth), Slate imports one or more spaces using `IMP-003`'s reviewed principal mapping. It carries:

- pages with every version, each with its mapped author and time;
- blog posts as posts with their original dates and authors (`CONT-010`);
- footer comments with their replies, and inline comments anchored to the same text, each with its author, time and open or resolved state;
- attachments with every version (`BLOCK-022`), with their text searchable (`SEARCH-013`);
- labels (`PAGE-001`, `SEARCH-010`);
- page restrictions, space permissions (`IMP-011`) and personal spaces (`IMP-012`).

Macros, diagrams and tasks with their assignees and due dates map as `IMP-010` names. It can re-sync deltas until cutover. A delta adds exactly what changed since the last pass, keyed by source ID and version, and never duplicates a page, version, comment or attachment. Its redirect map, from every old Confluence URL to its Slate record, is kept in Slate and served by Slate itself (`IMP-013`), so a buyer whose site lives on `atlassian.net`, where only Confluence Premium offers a custom domain, needs no host of its own. Links into spaces imported in later passes are back-filled (`IMP-014`). The cutover report lists what changed since the first pass, every link in Slate that still points at the old site (`IMP-014`), the old URLs requested since cutover that map to nothing (`IMP-013`), and the changes made by the Jira re-pointing step (`EMBED-006`).

*Acceptance:* the recorded Confluence Cloud API fixture holds:

- a page with 3 versions by 2 authors;
- one open and one resolved inline comment anchored to text;
- a footer comment with a reply;
- an attachment with 2 versions;
- two labels;
- a blog post;
- a personal space.

After import, a Workers journey asserts block by block that:

- the page's history lists 3 revisions with their mapped authors and times;
- both inline threads sit on the same text with their authors and resolved states, and the footer comment keeps its reply;
- the attachment has both versions;
- both labels are searchable and filterable;
- the blog post is a post with its original date and author;
- the personal space lands as `IMP-012` requires.

A delta that adds one comment and one page version adds exactly those two and duplicates nothing. Every old page and blog URL in the fixture, in each `IMP-013` form, resolves through Slate's own resolver route to its imported record with no host other than the deployment, and the cutover report lists the fixture's links into a space that was not imported. The same fixture's macros, diagrams, tasks and space permissions arrive as `IMP-010` and `IMP-011` require. A provider acceptance run repeats this against a real Confluence Cloud site.

*Status:* missing. Only file exports import (`IMP-003`).

#### IMP-008 — Guru import.
Slate imports a Guru export or reads the Guru API, turning collections into containers, folders into tree pages and cards into cards (`CARD-001`), with their owners, verifiers and verification intervals. Guru verification arrives as imported metadata that reads "Verified in Guru by name on date". It never counts as Slate verification until a member verifies the exact revision (`STAT-003`).

*Acceptance:* an import of a real Guru export fixture creates the expected collections, cards and owners, every imported card shows the Guru verification line and Slate status "unverified", and verifying one card produces a normal `STAT-003` record.

*Status:* missing.

#### IMP-009 — Folder imports from Google Drive and SharePoint.
A member can import a Google Drive folder or a SharePoint/OneDrive folder of Google Docs, Word and PDF files as a page tree, keeping folder hierarchy, titles, headings, tables, images and links between imported documents. Each source document keeps a link back to the original, and the report names every file it did not import.

*Acceptance:* a Workers journey with recorded provider fixtures imports a nested folder of 12 documents into a tree with resolved cross-links. Provider acceptance repeats this with a real Drive and a real SharePoint site.

*Status:* partial. Single Word and Google Docs (`.docx` or zipped HTML) imports ship (`src/core/features/imports/service.ts`, `tests/e2e/imports/real-exports.test.ts`); folder imports through provider APIs do not.

#### IMP-010 — Confluence macros, tasks and diagrams map to Slate blocks.
The file import (`IMP-003`) and the API migration (`IMP-007`) map each Confluence macro to a named Slate equivalent, which is live wherever the Slate equivalent is live:

| Confluence | Slate |
| --- | --- |
| Jira Issues (single issue or JQL table), Jira Smart Links | Live issue card or query table (`EMBED-001`) with a backlink on each issue (`EMBED-005`) |
| Jira Chart (pie, two-dimensional and created-versus-resolved charts over JQL) | Live Jira query embed shown as the same chart type over the same JQL (`EMBED-001`) |
| Excerpt, Excerpt Include, Include Page | Synced block from the source page (`BLOCK-011`) |
| Children Display, Content by Label, Page Tree, Recently Updated | Content query with the same scope, labels, depth and order (`BLOCK-010`) |
| Table of Contents | Table-of-contents block (`BLOCK-017`) |
| Page Properties, Page Properties Report | Pages that carry a Page Properties macro with the same label become records of one database for that label, keeping their bodies and tree positions (`DB-010`), with typed fields; the report becomes an embedded view with its columns and sort (`DB-011`) |
| Task list, Task Report | Tasks with their assignee (through the reviewed principal mapping), due date and completion (`BLOCK-015`); task report with the same filters (`BLOCK-016`) |
| Status | Status label with its colour (`BLOCK-018`) |
| Info, Note, Warning, Tip, Panel | Callout with the matching tone (`BLOCK-006`) |
| Expand | Expandable section (`BLOCK-006`) |
| Code, Noformat | Code block with its language (`BLOCK-006`) |
| Attachments, View File | A file block for each attachment, previewing in place for every `BLOCK-021` preview type, with every attachment version kept (`BLOCK-022`) and its text searchable (`SEARCH-013`) |
| Section and Column, page layouts | Columns (`BLOCK-012`) |
| Anchor | A heading anchor that links resolve to |
| User mention, team mention, Date | Person or group mention through the reviewed mapping (`BLOCK-005`, `BLOCK-020`); date mention |
| Widget Connector and Smart Link embeds (YouTube, Loom, Figma, Google Docs and others) | Allowlisted embed (`EMBED-003`), otherwise a link card (`BLOCK-009`) |
| draw.io, Gliffy | Diagram block with its source (`BLOCK-019`) |
| LaTeX and Mermaid apps | Equation or Mermaid block (`BLOCK-013`) |
| Whiteboards | Named in the loss report with a link to the original, plus its exported image as a file block when the export or API supplies one |
| Confluence databases | Named in the loss report with a link to the original; the database's own CSV export imports as a database under `IMP-005` |
| Team Calendars (Confluence Premium) | Each calendar whose ICS feed or export the buyer supplies imports as a database with a date field and a calendar view (`DB-004`); a calendar not supplied is named in the loss report with a link to the original |
| Roadmap Planner, Chart (over a body table), Livesearch, gadgets and Marketplace macros not named above | Unsupported: the macro's body text is kept where it has one, and the loss report names the macro, the page and the count |

The loss report lists only the unsupported rows and macros Slate does not recognise. A mapped macro whose target lies outside the import, such as an excerpt from a space not imported or a Jira site not connected, imports as its mapped block in its access-needed or "Connect to view" state and is listed as unresolved, never dropped.

*Acceptance:* a real Confluence Cloud space, captured both as a file export produced by Confluence (`IMP-003`) and as a recorded API fixture (`IMP-007`), contains at least one of every mapped macro, a draw.io and a Gliffy diagram, a whiteboard and a Roadmap Planner. After each import a Workers journey checks every macro block by block against the fixture's expected map: the Jira macros render as live embeds under recorded Jira fixtures, the Jira Chart as a chart of the same type, the View File macros as file blocks that preview (`BLOCK-021`), the excerpt as a synced block, the children display as a content query, the table of contents as its block, Page Properties as records with a view, tasks with their assignee, due date and state, and the panels, expand, code and status labels as their blocks. Both diagrams render as diagram blocks with their sources. The loss report lists exactly the whiteboard and the Roadmap Planner.

*Status:* partial. Panels, expand, code and task lists with their completion state map today, and every other macro is named in the loss report (`src/core/features/imports/confluence/storage.ts`, `tests/e2e/imports/real-exports.test.ts`).

#### IMP-011 — Confluence space permissions become container grants.
Both Confluence imports carry each space's permissions, not only its page restrictions. Where the source supplies them (the Confluence Cloud REST API's space permissions and space role assignments under `IMP-007`, and the `SpacePermission` objects in a Server or Data Center `entities.xml` under `IMP-003`), the Preview (`IMP-001`) lists every principal (user, group, team, all licensed users and anonymous) with its source role and the proposed Slate grant:

- view only becomes `view`, view and comment becomes `comment`, add or edit pages (with or without delete) becomes `edit`, and space admin becomes `full` and a container administrator (`CONT-009`);
- a group or team maps only through a reviewed source-ID mapping to a Slate group, and a user only to an existing active member, under `IMP-003`'s rules; all licensed users, or the default users group, maps to the container's general grant at that level, scoped to the container (`SHARE-005`);
- anonymous access is reported and never published (`PORT-005`, `WEB-001`);
- finer permissions with no Slate level (export, delete own, set restrictions) collapse to the nearest level that does not widen access, and each collapse is named.

After Apply, the container's grants match the reviewed mapping, page restrictions still narrow access inside it as `IMP-003` requires, and a member covered by no mapped grant cannot open any imported page. A Confluence Cloud CSV export carries no space permissions, so it imports with the container closed to everyone except the importing member and the workspace owners until the reviewed grants are set, and the report says so.

*Acceptance:* an `IMP-007` recorded fixture space grants view to group A and edit to group B, makes one user space admin, and has anonymous access on; an `entities.xml` fixture repeats the same permissions. After the reviewed mapping, the container's grants are group A `view`, group B `edit`, and the user `full` and container administrator. The anonymous access appears in the report and no page is published. A member in neither group cannot open any page, a member of group A can read but not edit, and a page restriction inside the space still narrows access.

*Status:* missing. Page restrictions map through reviewed principal mappings (`IMP-003`, `tests/e2e/imports/real-exports.test.ts`); space permissions are not read.

#### IMP-012 — Confluence personal spaces become personal containers.
Both Confluence imports recognise a personal space: `spacetype=personal` in a Cloud CSV export, the personal space type in `entities.xml`, and the API's `personal` space type (`IMP-007`). The outcome depends on the space's owner and on who else could read it:

- **Owner mapped, space private to them.** When the owner maps through the reviewed principal mapping to an existing active member, the space's pages land in that member's personal container (`CONT-005`) with their tree, and only that member can open them afterwards.
- **Space shared with others.** A personal container allows no grants (`CONT-005`), so a personal space that granted access to anyone other than its owner imports as a `private` container owned by the mapped member. It carries the mapped grants (`IMP-011`), and the report says why.
- **Owner unmapped.** The space imports as a `private` container that only the importing member and the workspace owners can open, and it is flagged for reassignment to a member.

No page from a personal space ever carries a general grant (`SHARE-004`).

*Acceptance:* an `IMP-007` recorded fixture and an `IMP-003` CSV export each hold three personal spaces: one private to a mapped owner, one shared with a group, and one whose owner is unmapped. After the reviewed mapping:

- the first space's pages are in the mapped member's personal container, which no other member, the importing member included, can open;
- the second is a `private` container with the group's grant and a report line;
- the third is a `private` container that only the importing member and the owners can open, flagged for reassignment.

No imported page carries a general grant.

*Status:* partial. The file import recognises a personal space and gives its pages no general grant (`src/core/features/imports/confluence/space.ts`, `tests/e2e/imports/mapping-regressions.test.ts`), but imports it as a private container owned by the importing member (`src/core/features/imports/persist.ts`).

#### IMP-013 — Old Confluence links resolve in Slate.
Every Confluence import, by file (`IMP-003`) or by API (`IMP-007`), keeps a link map in Slate from each imported space, page, blog post, attachment and comment to its Slate record. The map is keyed by source site and source ID, and keeps every title a page or post has had as an alias. Slate recognises these old URL forms, on an `atlassian.net/wiki` site and on a Server or Data Center base URL:

- tiny links (`/wiki/x/AbCd`, `/x/AbCd`), decoded with Confluence's tiny-link encoding of the page ID;
- page-ID URLs (`/wiki/spaces/KEY/pages/123/Title`, its editor forms, and `viewpage.action?pageId=123`);
- title URLs (`/display/KEY/Title`), matched against the page's current and earlier titles;
- blog URLs (`/wiki/spaces/KEY/blog/2024/01/15/123/Title` and `/display/KEY/2024/01/15/Title`);
- space home URLs (`/wiki/spaces/KEY/overview`, `/display/KEY`) and attachment downloads (`/download/attachments/123/name`);
- `focusedCommentId` parameters and heading fragments, which carry through to the comment thread and the heading anchor.

Slate serves the map itself, so the buyer needs no host of its own:

- **Resolver route.** `/go/confluence?url=<old URL>` is an authenticated Slate route. A signed-out visitor signs in first and then continues, and learns nothing about the map before sign-in. A mapped URL redirects to the record's permanent URL (`LINK-001`). A member without access gets `LINK-004`'s access-needed state there and learns nothing more, and a deleted record resolves to its tombstone (`LINK-002`). An unmapped URL shows a "Not migrated" page with an "Ask an owner" action. It names the source space key when the URL or the import records carry it, and never a title.
- **Old hostname.** An owner who controls the old hostname, such as a Server or Data Center site or a Confluence Premium custom domain, can add it as a legacy hostname and point it at the deployment. Every old path on it then redirects to the resolver on Slate's own origin, keeping the fragment.
- **Chat.** An owner can add the old Confluence hostname to the Slack, Teams and Nook apps' unfurl domains. A newly posted old URL then unfurls as its Slate record under `CHAT-002`'s access rule, with an "Open in Slate" action.
- **Browser.** Members with the browser extension are sent from the old site to Slate (`CARD-002`).
- **Map export.** An owner can download the map as CSV (old URL, Slate URL) to serve from any proxy they run.

Later passes add to the map (`IMP-014`). Complete export and restore carry it (`PORT-001`, `PORT-002`), and only an Undo removes entries, for the records it removes. Every unmapped URL that reaches the resolver after cutover is counted in the cutover report (`IMP-007`) by source URL, with no member identity.

*Acceptance:* the `IMP-007` fixture and an `IMP-003` CSV export of the same space each import a page, a renamed page, a blog post, an attachment and an inline comment. A Workers journey then requests `/go/confluence?url=` with:

- the page's tiny link, its page-ID URL and its `viewpage.action` URL;
- the renamed page's old `/display/` title URL;
- the blog URL and the attachment download URL;
- the comment's `focusedCommentId` URL.

Each redirects to its imported record. A member without access to the page follows the redirect and gets the access-needed state with no title. A signed-out request reaches sign-in and reveals nothing else. A URL from a space that was not imported shows "Not migrated" with its space key. A request to a configured legacy hostname for the tiny link redirects to the resolver on the main origin and sets no cookie. With a chat provider fake at the network edge, a posted page-ID URL unfurls as the Slate page for a reader and as "Restricted Slate page" for a non-reader. The downloaded CSV lists every mapped URL, and after export and restore into an empty deployment the tiny link still resolves. Exceeding the lookup limit returns 429.

*Status:* partial. Each import persists its source-to-record mappings (`src/core/platform/db/knowledge-operations-schema.ts`), and page-ID links resolve within one export (`src/core/features/imports/confluence/space.ts`); no route, hostname or other surface resolves an old URL.

#### IMP-014 — Links between spaces imported in separate passes.
A link in an imported body whose target lies outside that import is kept as a pending link. The target can be a Confluence page, blog post or attachment, named by a Confluence URL in any `IMP-013` form or by a storage-format reference with its space key and title or content ID. A pending link renders as the original URL with a "not yet migrated" marker, and Slate records its page, block and target. When a later pass imports the target, by file (`IMP-003`) or by API (`IMP-007`) and in either order:

- each pending link becomes a link to the imported record, in one revision per page attributed to that import run, and only the link target changes;
- a native edit made since the earlier pass is kept, and a pending link whose block was deleted leaves the list with no change;
- an `IMP-010` block whose target lay outside the earlier import, such as an excerpt from a space not yet imported, becomes live;
- a link rewritten once never changes again, so re-running a pass or a delta changes nothing;
- Undo of the later pass (`IMP-001`) restores the original URLs and keeps native edits.

The cutover report (`IMP-007`) lists, by page, every link in Slate content that still points at an old Confluence hostname, pending links and plain URLs in text alike, grouped by target space with counts. It shows titles only of pages its viewer can read, counts the rest, and downloads as CSV.

*Acceptance:* the fixture holds two spaces. In space A, page A1 links to space B's page B1 by a page-ID URL, a tiny link and a storage-format page reference, and includes an excerpt from B's page B2. A Workers journey imports A from its CSV file export. A1's three links render as pending, the excerpt shows its access-needed state, and the cutover report lists A1 with three links to space B. A member then edits another paragraph of A1. Importing B by API turns all three links into links to B1's record and the excerpt into a live synced block. The native edit is intact, and A1's history shows exactly one import revision. A delta pass of B changes nothing, and the cutover report lists no link to space B. Undo of B's import restores the three original URLs and keeps the native edit. A member without access to A1 sees neither its title nor its links in the report.

*Status:* missing. Links resolve only within one export (`IMP-003`).

#### PORT-008 — Exports carry comments.
Workspace, container and page exports in HTML include page and inline comment threads with their authors, times and resolved state, anchored to their blocks. Markdown exports carry the same threads in a sidecar JSON file, and re-importing a Slate export restores the threads.

*Acceptance:* a round trip of export to HTML and Markdown and re-import into a fresh deployment restores every thread on the same block with the same authors and resolved states.

*Status:* missing. Readable HTML, Markdown and CSV exports ship without comments (`src/core/features/workspace-export/readable.ts`).

#### PORT-009 — Scheduled backups to the buyer's storage.
An owner can schedule a nightly or weekly complete export (`PORT-001`) to the buyer's own S3-compatible bucket, Cloudflare R2 or [Chest](https://github.com/just-every/run-chest), with a retention count, failure notices to owners, and a restore drill that restores the latest backup into an empty deployment (`PORT-002`).

*Acceptance:* a scheduled run writes a backup to a test bucket, a forced failure notifies owners, and the restore drill restores into an empty deployment where links resolve to the same records.

*Status:* partial. Complete manual export and restore ship (`docs/BACKUP.md`, `tests/portability/roundtrip.test.mjs`); scheduling and external destinations do not.

#### PORT-010 — Word export of a page.
A member can export one page, or a page with its descendants, as a Word `.docx` file. It carries headings, lists, tasks, tables with merged cells, code, callouts, images with their alt text, equations, diagrams as images and links: links to other exported pages resolve inside the document, and other links point to their Slate URLs. Comments can be included as Word comments. The file carries only what the exporting member can read, and re-importing it under `IMP-005` reproduces its headings, tables and images.

*Acceptance:* a Workers journey exports a seeded page containing every listed block kind as `.docx`, checks each element with a `.docx` parser, and re-imports the file under `IMP-005` with the same headings and tables. A member without access to one child page exports the parent with descendants, and the file omits that child.

*Status:* missing. Markdown, HTML and PDF page exports ship (`PORT-007`, `src/core/features/workspace-export/readable.ts`); Word export does not.

### Integrations

#### EMBED-001 — Live issue embeds from Vector and Jira.
Pasting a [Vector](https://github.com/just-every/run-vector) or Jira issue URL, or a Vector or JQL query, renders a live card or table showing status, assignee, priority and sprint, refreshed on open and every 5 minutes. A query embed can also display as a pie chart by one field, a two-dimensional table of counts by two fields, or a created-versus-resolved chart over a period. Each reader sees issue details only through their own linked account. A reader without a linked account sees "Connect to view", never the details Slate fetched for someone else. Selecting text offers "Create issue", which files the issue under the member's account and links it in both directions: the page shows the issue, and the issue carries a backlink to the page (`EMBED-005`).

*Acceptance:* a browser journey with recorded Jira and Vector API fixtures renders a card, a query table and the same query as a pie chart and a two-dimensional chart whose counts match the fixture, refreshes a changed status, creates an issue from selected text with a backlink, and shows "Connect to view" to an unlinked member. Provider acceptance repeats this against a real Jira Cloud site.

*Status:* missing.

#### EMBED-002 — GitHub and GitLab embeds.
Pull request, issue, commit and release links render live cards with their state and checks. A file-range permalink renders the code pinned to its commit, with a notice when the default branch has changed those lines since. Reader access follows `EMBED-001`'s per-member rule.

*Acceptance:* a browser journey with recorded GitHub and GitLab fixtures renders a PR card, a pinned code range with a "changed since" notice after the fixture's branch moves, and the unlinked-member state.

*Status:* missing. A GitHub source connector exists for flagship source memory (`src/core/features/connectors/github.ts`), but it renders no embeds.

#### EMBED-003 — Design, video and document embeds.
Allowlisted embeds render inline through oEmbed or provider iframes: Figma, Miro, Lucid, Loom, YouTube, Vimeo, Google Docs, Sheets and Slides, and Microsoft 365 files. Each sets a sandbox and a content security policy per provider, loads nothing before the reader interacts on a published page (`BASE-PUBLIC-001`), and falls back to a link card (`BLOCK-009`) when the provider refuses.

*Acceptance:* a browser journey embeds one item per provider using recorded fixtures, checks the sandbox and CSP attributes, and confirms that a published page loads no third-party request before a click.

*Status:* partial. Safe link cards ship (`BLOCK-009`, `tests/flagship/content/preview.test.ts`); provider iframe embeds do not.

#### EMBED-004 — Live file cards from Drive, SharePoint and Chest.
A file picker inserts Google Drive, SharePoint/OneDrive or [Chest](https://github.com/just-every/run-chest) files by reference. Each card shows the file's current title, owner, last modified time and type, and whether the reader can open it. Slate never copies the file unless the member chooses "attach a copy" (`BLOCK-008`).

*Acceptance:* a browser journey with recorded provider fixtures inserts one file from each source, sees a renamed file's new title after refresh, and sees "request access" for a reader without access.

*Status:* missing.

#### EMBED-005 — Backlinks on Jira and Vector issues.
When a page embeds, mentions or links a Jira or Vector issue (`EMBED-001`), or a member or a rule creates an issue from it (`EMBED-001`, `AUTO-006`), Slate writes exactly one link to the page on the issue, so the issue lists the Slate pages that reference it. In Jira Cloud this is a remote issue link (`POST /rest/api/3/issue/{key}/remotelink`) with a stable global ID for each page and issue, written under the acting member's linked account. In [Vector](https://github.com/just-every/run-vector) it is Vector's own page link. Embedding the same issue again on the same page writes nothing new. Renaming the page updates the link's title. Removing the page's last reference to the issue, or trashing or erasing the page, removes the link, and restoring the page writes it again. A page in a `private` or `personal` container, a draft (`LIFE-002`), or a page under a Confidential classification (`ADMIN-006`) gets a link titled "Slate page" with no page title, and opening any backlink still requires Slate access. A failed write is retried under its operation key and shown on the embed, never dropped silently. Links that people add to the page from the Jira or Vector side are listed on the page (`EMBED-007`), and the links Jira already holds to Confluence pages that Slate migrated are re-pointed at cutover (`EMBED-006`).

*Acceptance:* a Workers journey against recorded Jira Cloud and Vector API fixtures embeds one issue, mentions a second and creates a third from selected text, and finds exactly one remote link to the page URL on each issue. Embedding the first issue again writes no second link, renaming the page updates the link titles, removing the embed deletes its link, and a draft's link carries the neutral title. Provider acceptance repeats this against a real Jira Cloud site.

*Status:* missing.

#### EMBED-006 — Jira links to migrated Confluence pages are re-pointed at cutover.
An optional cutover step re-points the Jira issue links that point at Confluence pages Slate has migrated (`IMP-007`, `IMP-003`). A workspace owner runs it under their own linked Jira Cloud account. It finds the links in two ways:

- Jira's `issuesWithRemoteLinksByGlobalId` query for the application-link global ID of every migrated page, which finds the links Confluence wrote when a page embedded an issue;
- a scan of the remote links on issues in the Jira projects the owner selects, matching each web link's URL against the `IMP-013` map in any of its forms.

A preview lists every proposed change by issue: the old link, the Slate link to be written and the action for the old link. Issues the account cannot edit and links to pages that were not migrated are listed separately and left alone. On apply:

- each issue gets exactly one Slate backlink to the migrated page, with `EMBED-005`'s semantics: a stable global ID, the neutral title "Slate page" for a page in a `private` or `personal` container, a draft or a Confidential page, and no second link where an `EMBED-005` backlink already exists;
- the old Confluence link is removed, or relabelled "Confluence (retired): title", as the owner chose for the run. A relabelled link keeps its URL, so the resolver and the extension still route it;
- each change is recorded in the run log with its issue, old link, new link and action, and appears in the cutover report;
- re-running the step changes nothing, and reverting a run restores each old link and removes each Slate link it wrote.

[Vector](https://github.com/just-every/run-vector) issues that carry Confluence links, for example from a Jira import into Vector, are re-pointed the same way through Vector's API.

*Acceptance:* a Workers journey runs against a recorded Jira Cloud fixture:

- issue J1 has an application-linked remote link to migrated page P1;
- J2 has a web link to P1's tiny link;
- J3 has a web link to the page-ID URL of P2, in a `private` container;
- J4 links to a page that was not migrated;
- J5 is in a project the owner's account cannot edit.

The preview lists changes for J1, J2 and J3, lists J4 as not migrated and J5 as skipped. Applying in relabel mode leaves J1, J2 and J3 each with exactly one Slate remote link carrying the stable global ID, beside the relabelled Confluence link, and J3's Slate link is titled "Slate page". J4 and J5 are unchanged, and the run log has three entries. Re-running writes nothing. A second run on a fresh fixture in remove mode removes the Confluence links, and reverting it restores them. A variant in which J1 already carries an `EMBED-005` backlink writes no second link. The same journey runs against a recorded Vector fixture, and provider acceptance repeats it against a real Jira Cloud site.

*Status:* missing.

#### EMBED-007 — Issues that link here.
Each page has an Issues panel, like Confluence's Jira links button, listing the Jira and Vector issues that link to the page. That includes the backlinks `EMBED-005` and `EMBED-006` wrote, and remote links people added from the Jira or Vector side to the page's Slate URL or to an old Confluence URL that `IMP-013` maps to it. Slate finds the links three ways: Jira's `issuesWithRemoteLinksByGlobalId` query for its own global IDs, a periodic scan of the remote links on issues in the connected projects within `seed.json → limits`, and Vector's page-link query. Each reader sees an issue's key, title and status only through their own linked account (`EMBED-001`). An issue their account cannot read is neither shown nor counted, and a reader with no linked account sees "Connect to view". The page header shows the panel's count, and each issue opens in its tracker.

*Acceptance:* a Workers journey against recorded Jira Cloud and Vector fixtures links four issues to one page: one by a Slate backlink from an embed, one by a web link to the page's Slate URL added from the Jira side, one by a web link to the page's old Confluence URL, and one in a project that a second reader's account cannot read. A browser journey shows a reader with full Jira access all four, the second reader three with no trace or count of the fourth, and an unlinked member "Connect to view". A link added from the Jira side after the first scan appears after the next scan interval with no Slate edit. Provider acceptance repeats this on a real Jira Cloud site.

*Status:* missing.

#### EMBED-008 — Slate for Jira: smart links and project pages.
Slate ships an Atlassian Forge app that gives Jira what Confluence's own integration gave it. The buyer installs it on their Jira Cloud site from a distribution link, with no Marketplace listing.

- **Smart Links.** A Slate URL pasted into a Jira issue description or comment renders as a Smart Link with the page's title, verification state and last update. Slate reads it as the viewing Jira user's linked Slate identity, linked once like `CHAT-002`'s chat identity. A page that identity cannot read renders as "Restricted Slate page", and an unlinked viewer gets a "Connect Slate" prompt.
- **Project pages.** A Jira project admin links the project to one or more Slate containers. The project sidebar then shows a "Slate" page listing the pages of those containers that the viewer's linked identity can read, with search, recently updated pages and a "Create page" action that opens Slate.

[Vector](https://github.com/just-every/run-vector) projects get the same through Vector's own project link: a linked container's readable pages appear in the project, and Slate URLs render with their titles.

*Acceptance:* a Workers journey sends the app's recorded Forge invocations, link resolution and project-page requests, to Slate's app endpoint for a reader, a non-reader and an unlinked Jira user. The reader gets the title, verification state and last update, the non-reader gets "Restricted Slate page", and the unlinked user gets the connect prompt. The project page lists only each user's readable pages of the linked container. A browser journey does the same through Vector's project view. Provider acceptance deploys the app to a real Jira Cloud development site, pastes a Slate URL into an issue and sees the Smart Link, and opens the project's Slate page.

*Status:* missing.

#### CHAT-001 — Chat notifications to Slack, Microsoft Teams and Nook.
Workspace and container owners connect any number of channels in Slack, Microsoft Teams or [Nook](https://github.com/just-every/run-nook), each with its own event selection: published or updated pages, new comments, blog posts, review requests and lapsed verifications in the container. `NOTIF-003`'s guarantees apply to every destination: link-only messages, access-checked links, encrypted credentials, delivery and failure state, transient-only retry, and stopping on disconnect.

*Acceptance:* a Workers journey with provider fakes at the network edge connects one channel per provider, fires each event kind and finds exactly one link-only message per destination. Disconnecting one destination stops only that destination. Provider acceptance repeats this with real Slack and Teams workspaces.

*Status:* partial. One Slack destination ships (`src/core/features/notifications/slack.ts`, `src/core/features/notifications/chat-config.ts`); Teams, Nook and multiple destinations do not.

#### CHAT-002 — Ask and unfurl in chat.
In Slack, Teams and Nook:

- a Slate page link unfurls with its title, status and verification, owner and last update, but only when the unfurling user's linked Slate identity can read the page; otherwise it shows "Restricted Slate page";
- `/slate` or a mention asks a question and gets a cited answer (`ANSWER-001`) computed for the asker alone, posted only to the asker when the channel's audience is broader than the sources' readers.

A member links their chat identity to Slate once, from Slate or from the app's first prompt in chat. The same link delivers their personal notifications (`CHAT-004`).

*Acceptance:* a Workers journey with chat provider fakes unfurls a readable and a restricted link for two linked users. An in-channel question citing a restricted page is answered privately to the asker, and an unlinked user is asked to link their account first. Provider acceptance repeats this in a real Slack workspace.

*Status:* missing. A Slack source connector exists behind the flagship profile (`src/core/features/connectors/slack.ts`); there is no unfurl or ask app.

#### CHAT-003 — Capture chat into pages.
A message shortcut in Slack, Teams or Nook creates a Slate page or card, or appends to an existing one, from a message or thread. It quotes the messages with their authors and a link back to the thread, and opens as a draft for the member to edit. When the same question recurs in a channel, Slate suggests to the member who answered that their answer become a card.

*Acceptance:* a Workers journey with chat provider fakes captures a five-message thread into a new page with attributed quotes and a source link, and appends a second thread to the same page.

*Status:* missing.

#### CHAT-004 — Personal notifications as chat direct messages.
A member who has linked their Slack, Microsoft Teams or Nook identity (`CHAT-002`) can choose "chat direct message" as the delivery for any event kind (`NOTIF-005`). A workspace owner can make it the default for any event kind (`NOTIF-006`). The Slate app then sends that member one direct message per event, for each of these kinds:

- mentions, including group mentions (`BLOCK-020`);
- replies, and comments on watched or authored pages;
- task assignments and due tasks (`BLOCK-015`);
- shares, shares with a message (`SHARE-009`) and access grants;
- review requests (`STAT-006`) and lapsed verifications;
- watched page and container changes (`CONT-012`);
- required reading (`CARD-003`).

A daily or weekly digest can also arrive as one direct message.

- **Content.** Each message carries the event kind, the actor, the page title and a link, never a page body or comment text, with "Open" and "Mark as read" actions. Marking a message read in chat clears its inbox item.
- **Access.** Recipient access is rechecked at send. An event on a page the member cannot read at send produces nothing.
- **Control.** The member manages these choices in Slate or from chat (`/slate notify` in Slack and Teams, and Nook's equivalent command). Unlinking stops direct messages from the next event.
- **Fallback, never silence.** An event set to chat goes to the member's chosen fallback, immediate email unless they chose otherwise, when any of these holds: the member has no linked identity, the link is broken, or the workspace's chat app is disconnected. Slate also shows them a "Connect chat" prompt.
- **Delivery.** Messages use the workspace app's encrypted credentials and `NOTIF-003`'s delivery and failure state with transient-only retry. Each member and event has an operation key, so a retry never sends twice.

*Acceptance:* a Workers journey with a chat provider fake at the network edge:

- links a member's Slack identity and sets mentions and task assignments to chat;
- finds that one mention and one assignment each produce exactly one direct message, carrying the actor, the page title and a link and no body;
- finds that an event on a page the member lost access to before send produces nothing;
- finds that "Mark as read" in the message clears the inbox item;
- finds that unlinking stops direct messages from the next event;
- has an owner set chat as the workspace default for mentions (`NOTIF-006`), and finds that a member who chose nothing receives a direct message;
- finds that a member with no linked identity receives the mention by immediate email instead, never nothing, and sees the "Connect chat" prompt;
- finds that a forced transient failure and retry deliver once.

The same journey runs against Teams and Nook provider fakes. Provider acceptance repeats it in a real Slack workspace and a real Microsoft Teams tenant.

*Status:* missing. One owner-configured Slack channel notifier exists (`src/core/features/notifications/slack.ts`); there is no member identity link or direct-message delivery.

#### CONNECT-001 — Named connectors.
Slate connects to Google Drive, SharePoint/OneDrive, Confluence Cloud, Notion, Slack, Microsoft Teams, [Nook](https://github.com/just-every/run-nook), Jira, [Vector](https://github.com/just-every/run-vector), GitHub, GitLab, Salesforce, Zendesk, [HappyToHelp](https://github.com/just-every/run-happytohelp) and [Chest](https://github.com/just-every/run-chest), and to a member's own Gmail or Outlook mailbox when that member opts in. Each connector meets `SOURCE-001`: it declares its scopes, identity mapping, discovery coverage, an incremental sync target of 15 minutes, deletion and revocation propagation within 1 hour, and retention. Each is turned on per workspace by an owner.

*Acceptance:* each connector has a Workers journey against a recorded provider fixture covering first sync, an incremental change, a deletion and a revoked user, and provider acceptance against a real authorized account for at least Drive, SharePoint, Slack, Teams, Jira and GitHub.

*Status:* partial. Slack, Google Drive and GitHub connector code exists behind the flagship profile (`src/core/features/connectors/slack.ts`, `src/core/features/connectors/google-drive.ts`, `src/core/features/connectors/github.ts`); the other connectors do not exist.

#### CONNECT-002 — Source permissions are mirrored.
Every connected item carries its source ACL, refreshed with the item. A member sees a connected item in search, answers, embeds or agent work only when their mapped source identity can read it now. An unmapped or ambiguous identity sees nothing from that source, a source ACL that fails to refresh fails closed, and a revocation in the source removes the item from that member's results within the connector's propagation target.

*Acceptance:* a Workers journey with provider fakes runs a matrix of three members against items shared to a user, a group, a domain and nobody, revokes one share in the source, and asserts results before and after propagation, including that answers stop citing the revoked item.

*Status:* partial. Connector authority mapping and disclosure tests exist behind the flagship profile (`src/core/features/connectors/authority.ts`, `tests/flagship/release-clauses/federation/connector-disclosure.test.ts`).

#### CONNECT-003 — Connector health.
Owners see per connector: last sync, lag, items indexed and excluded with reasons, errors, identity-mapping coverage, and the next scheduled run. An owner can pause a connector, re-sync it, or disconnect and purge it, which removes its indexed content and derived answers within 1 hour (`SOURCE-005`, `SOURCE-006`).

*Acceptance:* a browser journey shows a lagging connector's health, pauses and resumes it, and purges it, after which a search finds none of its items and an answer that cited them is marked invalidated.

*Status:* partial. Connector service state exists behind the flagship profile (`src/core/features/connectors/service.ts`); there is no owner health surface.

### Answers

#### ANSWER-001 — Cited answers in the default product.
Once an owner configures a provider and turns AI on (`AI-001`), every member gets Ask: a box above search results and a side panel on any page. It answers from pages, records, comments and connected items the asker can read, with inline citations that open the exact revision (`AI-004`, `REV-005`). It keeps the conversation: a follow-up question is answered in the context of the earlier turns, each answer offers up to three suggested follow-ups, and the member's past conversations are listed privately to them, can be reopened and continued, and can be deleted. Every turn recomputes access, so a follow-up never cites a page the asker has since lost. This needs no `SLATE_PROFILE=flagship` opt-in, and every `AI-*` guarantee applies.

*Acceptance:* in the default profile with AI on and a provider fake at the network edge, a browser journey asks a question in search and in a page panel and gets an answer whose every citation opens its exact revision. A follow-up that refers to the first answer only by pronoun ("who owns it?") is answered about the same page. Clicking a suggested follow-up asks it. The conversation reopens from the member's history after a reload, another member cannot list or open it, and deleting it removes it. After the asker loses access to a cited page, the next follow-up does not cite it. With AI off, Ask is absent and search is unchanged (`SEARCH-008`).

*Status:* partial. Workspace answers exist behind the flagship profile (`src/core/features/ai/integration.ts`, `tests/qualification/inquiry/inquiry-mechanics.test.ts`) and are refused in the default profile (`src/core/platform/config/launch-profile.ts`).

#### ANSWER-002 — Answers state their trust.
Each answer shows, for every cited source, its verification state, owner and last update. It flags disagreement between sources, separates what the sources state from what the model inferred, and gives its uncertainty in words. When the only evidence is lapsed or conflicting, it says so and names the owner to ask, with a one-click review request (`STAT-006`). It prefers current verified sources (`SEARCH-011`).

*Acceptance:* a Workers journey with a provider fake asks over a corpus with a verified, a lapsed and a conflicting page, and asserts that the response's structured fields mark each citation's state, the conflict and the named owner, and that the review request is created once.

*Status:* partial. Citation provenance exists behind the flagship profile (`tests/flagship/intelligence/authority.test.ts`); verification state, conflict flags and uncertainty statements do not.

#### ANSWER-003 — Answers never leak restricted knowledge.
No answer, citation, follow-up suggestion, "no answer" wording, latency pattern, cache entry, embedding neighbour or count reveals a page, record, comment or connected item the asker cannot read. Caches and embeddings are keyed to the access state they were computed under and invalidated when it changes (`AI-013`).

*Acceptance:* an adversarial Workers suite asks 50 probing questions as a member without access to a seeded secret page, including paraphrases, title guesses, "does a page exist" questions and prompt injection inside readable pages. It asserts no secret token, title or count appears and that "no answer" responses are identical with and without the secret page present. The suite then revokes a grant and repeats.

*Status:* partial. Audience and disclosure regressions exist behind the flagship profile (`tests/qualification/authority/skill-disclosure.test.ts`, `tests/qualification/authority/snapshot.test.ts`); there is no adversarial no-leak suite over the default Ask surface.

#### ANSWER-004 — Feedback and unanswered questions.
Members rate answers as helpful or not helpful and can report a wrong answer with a note. Unanswered and low-rated questions are logged with their timestamps but without the asker's identity, unless the asker chooses to follow up. They are clustered weekly into a report for container owners showing frequency, the sources tried and suggested experts. This report feeds `KEEP-003`.

*Acceptance:* a Workers journey records 30 questions with ratings, runs clustering, and asserts the report's clusters, counts and anonymity, and that a "wrong answer" report notifies the cited page's owner once.

*Status:* missing.

#### ANSWER-005 — Summaries and catch-up.
A member can summarize a page, a comment thread, the changes to a page since their last visit, or a container's week. Each summary cites exact revisions and can be posted to chat (`CHAT-001`) or inserted under `AI-016`.

*Acceptance:* a Workers journey with a provider fake summarizes "changes since last visit" for a member and finds that the summary cites exactly the revisions after that member's last view.

*Status:* partial. Page and diff summaries exist behind the flagship profile (`src/core/features/ai/routes.ts`); "since last visit" and container summaries do not.

#### ANSWER-006 — Owner-chosen models and data controls.
The owner picks the provider (Anthropic, OpenAI, Azure OpenAI, Amazon Bedrock, Google Vertex AI or a local model), sets a monthly budget in USD (`AI-012`), and can exclude containers or labels from AI entirely. Excluded content is never sent to a provider or embedded. Settings show what each provider retains under the owner's agreement with it.

*Acceptance:* a Workers journey configures two providers with fakes at the network edge, excludes a container and asserts that no request body ever contains its content, and stops at the USD budget with a visible reason.

*Status:* partial. Provider configuration, routing and durable budgets exist behind the flagship profile (`src/core/features/ai/integration.ts`, `tests/flagship/intelligence/reservation-prerequisites.test.ts`); container and label exclusion do not.

### Platform

#### API-001 — Public REST API.
A versioned `/api/v1` covers pages, blocks, databases, records, comments, search, members, groups and files, described by a published OpenAPI document. It uses cursor pagination, operation keys (`SAVE-005`), declared rate limits and a stable error shape. Authentication is a personal access token or an OAuth 2.0 app with scopes (read or write, per container). Every call acts as exactly one member and passes the same checks as the UI (`SHARE-002`, `LIFE-002`, `SEARCH-005`).

*Acceptance:* a contract suite generated from the OpenAPI document runs every operation over HTTP with a token for each of two members, asserting the schemas and that every access difference matches the UI's. Expired, revoked and under-scoped tokens are refused.

*Status:* partial. The app uses internal JSON routes under `/api` (`src/core/features/pages/routes.ts`); there are no tokens, versioning or published specification.

#### API-002 — Webhooks.
Owners and OAuth apps subscribe to page, record, comment, status, verification and member events by container. Deliveries are HMAC-signed with a timestamp, retried with backoff for 24 hours, logged with their responses, replayable, and disabled with a notice after repeated failure. Payloads carry IDs and titles only when the subscription's acting member can read the record.

*Acceptance:* a Workers journey subscribes a test endpoint, produces events, verifies the signatures, forces failures and sees the backoff and the disable notice, replays one delivery, and confirms that a record the subscriber cannot read produces no payload.

*Status:* missing.

#### API-003 — MCP server.
A remote MCP endpoint (Streamable HTTP with OAuth 2.1) exposes search, fetch page with citations, list and query databases, ask (`ANSWER-001`), comment, and create or update a page. Claude, ChatGPT, Cursor and other MCP clients can use it. Every tool acts as the signed-in member. Write tools create suggestions (`SUG-001`) unless the member has granted direct writes to that client for named containers (`AI-011`), and page text returned to the client is marked as untrusted content.

*Acceptance:* an MCP client conformance run lists the tools, calls each one as two members and asserts access parity with the UI, confirms that a write without a grant becomes a suggestion, and confirms that revoking the client ends its session at once.

*Status:* partial. An external-agent MCP route with semantic parity exists behind the flagship profile (`src/core/features/external-agent/routes.ts`, `tests/qualification/inquiry/transport-parity.test.ts`); public OAuth client registration does not.

#### API-004 — App and token administration.
Owners see every personal access token, OAuth app, MCP client and webhook, with its member, scopes, creation time and last use, and can revoke any of them. Members see and revoke their own. Tokens expire after a default of 90 days. Revocation takes effect on the next request, and every grant and revocation is recorded in activity.

*Acceptance:* a browser journey creates a token and an OAuth app, sees both with last use after an API call, revokes each and gets 401 on the next request, and finds the activity entries.

*Status:* missing.

#### API-005 — Zapier, Make and Crank apps.
Slate publishes an app in the Zapier app directory and one in Make's app directory, and ships a [Crank](https://github.com/just-every/run-crank) connector. Each one connects to the buyer's own deployment by URL through `API-001`'s OAuth app flow and acts as the connecting member.

- **Triggers** use `API-002` webhooks (REST hooks), never polling where a webhook exists. They cover a page published or updated, a comment added, a record created or updated, a verification lapsed, a review requested and a form submitted (`DB-013`).
- **Actions** create a page from a template, append to a page, create or update a record, add a comment, request review and search.
- **Access.** A trigger never fires for a record the connecting member cannot read, and an action passes the same checks as the UI.
- **Revocation.** Revoking the app under `API-004` stops its triggers and actions on the next request.

*Acceptance:*

- The Zapier Platform CLI's validation and the app's integration tests run against a test deployment. Each trigger fires once from a real event through a REST hook, and each action creates its record as the connecting member.
- A page the member cannot read fires no trigger.
- Revoking the app returns 401 on the next action.
- Make's app validation and the Crank connector's tests run the same journey.
- The published listings are recorded with the release evidence.

*Status:* missing.

#### ADMIN-001 — SAML single sign-on.
Slate is a SAML 2.0 service provider for Okta, Microsoft Entra ID, Google Workspace, JumpCloud and [Auth](https://github.com/just-every/run-auth). It supports both SP- and IdP-initiated sign-in, signed assertions, an email domain verified by a DNS TXT record the owner publishes (rechecked daily; a failed check stops new just-in-time creation and notifies owners) and just-in-time creation of invited or allow-listed members. When an owner enforces SSO, members sign in only through the provider, guests keep magic links, and one designated owner keeps a magic-link break-glass path. The OIDC provider (`WORK-015`) stays available.

*Acceptance:* a browser journey against a SAML test IdP verifies a domain through a TXT record served by a DNS fake at the network edge, refuses just-in-time creation for an unverified domain, signs in through SP and IdP flows, rejects an unsigned assertion and one with the wrong audience, enforces SSO for a member while a guest uses a magic link, and confirms break-glass access for the designated owner. Provider acceptance repeats this with real Okta and Entra tenants.

*Status:* partial. An OIDC identity provider with pinned endpoints ships (`src/core/features/session/native/`, `tests/flagship/core/identity-upgrade.test.ts`); SAML does not.

#### ADMIN-002 — SCIM provisioning.
A SCIM 2.0 endpoint provisions users and groups from Okta, Entra ID, JumpCloud and Auth. Create invites the member. Update changes the name, email and groups (`WORK-009`). Deactivate runs `WORK-007` removal within 60 seconds, revoking sessions, tokens and devices. The bearer token is owner-generated, rotatable and stored hashed.

*Acceptance:* a SCIM compliance run (Okta's SCIM test suite shape) creates, updates, pushes groups to and deactivates users, and asserts the resulting members, groups, revoked sessions and activity entries.

*Status:* missing.

#### ADMIN-003 — Guest management.
Owners list every guest with what they can access, who invited them, when they were last active, and their expiry. They can set a default guest expiry, keep allow and deny lists of email domains, and revoke guests in bulk. A guest's access never outlives their expiry (`SHARE-008`).

*Acceptance:* a browser journey lists three guests with their access, bulk-revokes two (their open sessions end under `SHARE-007`), and rejects an invite to a denied domain.

*Status:* partial. Guest invitations and page- and container-scoped guest grants ship (`src/core/features/workspace/invitations.ts`, `tests/qualification/policies/invitations.test.ts`); there is no guest console, domain list or default expiry.

#### ADMIN-004 — Workspace analytics.
Owners and container owners get reports on views and unique viewers (`PAGE-013`), stale pages (unedited and unverified for a chosen period), pages without an owner, lapsed verifications by owner, most-viewed unverified pages, searches with no results, and container growth. Reports export as CSV. They never show an individual's reading history beyond what `PAGE-013` already shows on a page.

*Acceptance:* a Workers journey over a seeded workspace asserts each report's rows, the CSV export, and that a container owner sees only their own container's figures.

*Status:* partial. Page and container view analytics exist (`src/core/features/analytics/`); the admin reports do not.

#### ADMIN-005 — Audit export and SIEM streaming.
Owners filter the workspace audit trail (`ACT-*`, including sign-ins, permission and sharing changes, exports, token use and admin settings) and export it as CSV or JSON. They can stream it to Splunk, Datadog or Microsoft Sentinel through a signed webhook (`API-002`), with a retention setting no shorter than one year.

*Acceptance:* a Workers journey produces each audited action kind, exports it and finds every action with its actor, time and target, and streams it to a test receiver with valid signatures and no gaps after a receiver outage.

*Status:* partial. A durable activity timeline with audit coverage ships (`src/core/features/activity/service.ts`, `tests/qualification/core/audit-content.test.ts`); export of admin actions and streaming do not.

#### ADMIN-006 — Content governance.
Owners decide who may create containers, publish publicly, invite guests, export and use AI. A container may carry a classification label, such as Confidential, that by default forbids public links and AI for its pages, and only a workspace owner can lift those defaults. Every governance change is recorded in activity.

*Acceptance:* a browser journey restricts public publishing to owners, labels a container Confidential, and confirms that a member's publish attempt, an AI request over a confidential page and an export by a non-permitted member are each refused with a reason.

*Status:* partial. Container external-access switches ship (`CONT-007`, `tests/qualification/policies/access-publication.test.ts`); role-scoped governance and classification labels do not.

#### ADMIN-007 — Every target surface ships in the default product.
Every surface that a target or push-further clause describes is part of the default product, and an owner turns it on in workspace settings with nothing else needed. Ask, AI writing and AI fields turn on once a provider is configured and AI is on (`AI-001`, `ANSWER-006`). Suggestions and agent maintenance (`SUG-*`, `KEEP-*`) turn on with AI. Each connector turns on once it is connected (`CONNECT-001`), and chat ask and unfurl once the chat app is installed (`CHAT-002`). MCP and OAuth clients work once a member grants them (`API-003`, `API-004`), and live co-editing is on from the start (`COLLAB-001`). No target surface requires `SLATE_PROFILE=flagship`. Settings show each switch's state and who changed it when, and every change is recorded in activity. Turning a switch off refuses its surface with `FEATURE_DISABLED` from the next request and stops its scheduled jobs, and it erases nothing. A surface also stays refused until its clause's own safety acceptance has passed: `ANSWER-003` for answers, `CONNECT-002` for connected items and `COLLAB-001`'s revocation test for co-editing. `SLATE_PROFILE=flagship` remains only for the inquiry, experiment, trial and production-effect extension (`INQ-*`, `TRIAL-*`, `EFFECT-002`).

*Acceptance:* a Workers journey in the default profile, with `SLATE_PROFILE` unset, first finds every target surface (Ask, AI writing, AI fields, suggestions, MCP, each connector, chat ask and agent jobs) refusing with `FEATURE_DISABLED`. It turns each owner switch on and finds its surface serving, then turns it off and finds it refusing again on the next request with its stored records intact. A release check fails any target-clause journey that sets `SLATE_PROFILE=flagship`.

*Status:* partial. Surfaces are gated by the deployment profile rather than by owner switches (`src/core/platform/config/launch-profile.ts`, `tests/profile/profile.worker.test.ts`). AI and SSO have their own default-off switches, but the AI-backed, MCP, connector and suggestion surfaces also require `SLATE_PROFILE=flagship`.

#### MOBILE-001 — Native iOS and Android apps.
App Store and Google Play apps let a member sign in (magic link, OIDC or SAML), read, search, ask, edit pages and blocks, comment, use the inbox, verify, and take photos straight into pages. They support share-sheet capture into Slate, deep links that open slate URLs in the app, and an optional biometric lock. They use the same API as the web (`API-001`) and the same access rules.

*Acceptance:* automated device-farm journeys on current iOS and Android sign in, edit and comment on a page, verify it, take a photo into a page through the device camera, lock and unlock the app with the platform biometric prompt, receive a mention push, and open a deep link. App Store and Play review builds are recorded with the release evidence.

*Status:* missing. Only the responsive web client exists (`NAV-006`, `tests/qualification/interface/routed.browser.mjs`).

#### MOBILE-002 — Desktop app.
A macOS and Windows desktop app opens Slate links natively, keeps several windows open on different pages and restores them on relaunch, supports offline pages (`MOBILE-003`) and system notifications, and updates itself through signed releases.

*Acceptance:* automated journeys on macOS and Windows open a deep link, open a second window on another page and edit in both, quit and relaunch to find both windows restored on their pages, edit offline and sync, and receive a system notification. The signed installers are recorded with the release evidence.

*Status:* missing.

#### MOBILE-003 — Offline pages.
A member marks pages or containers as available offline on a device. Those pages, with their media and comments, stay readable and editable without a connection and merge on reconnect (`COLLAB-003`). A revoked grant, a removed member or a remote sign-out erases the offline copies at the next connection, and an owner can require that sessions on lost devices be signed out remotely.

*Acceptance:* a device journey marks a container offline, edits in airplane mode and merges on reconnect, then has its access revoked and finds the offline copy erased on the next connection.

*Status:* partial. Browser-side offline detection and draft recovery exist (`src/core/features/editor/ui/SaveStatus.tsx`, `tests/qualification/offline-refresh/transport.test.ts`); chosen offline pages do not.

#### MOBILE-004 — Push notifications.
Mentions, replies, review requests, reminders and lapsed verifications can be pushed to a member's devices through APNs and FCM according to `NOTIF-005` preferences. A push payload carries the event and the page title only, and access is rechecked at send.

*Acceptance:* a Workers journey with APNs and FCM fakes at the network edge sends exactly one push per eligible event, none for a page whose access was revoked before send, and payloads with no body text.

*Status:* missing.

## Push further

Agents keep the knowledge true, not just stored. Each clause names what the agent does, on which data, and under what human control. Every agent action runs under `AI-002` to `AI-014`: it is cited, budgeted and audience-bound, and it never verifies, publishes or changes access on its own authority.

### Agents that maintain knowledge

#### KEEP-001 — Contradiction watch.
*What the agent does:* watches authoritative change and checks which pages it contradicts. Authoritative change means merged pull requests and releases (GitHub, GitLab), resolved issues (Vector, Jira), revised policy and decision pages (`DEC-*`), changed connected documents, and newly verified pages. The agent maps each change to the specific statements in dependent pages, cards and recent answers. Where a statement is now contradicted, it places a "possibly outdated" flag on the exact block revision, citing the change, the evidence and its confidence.

*Data:* page revisions the agent's declared audience may read, connector events (`CONNECT-*`) and decisions.

*Human control:* flags are read-only. They notify the page owner once, in a coalesced notice, and appear to editors and in answers (`ANSWER-002`). An owner dismisses a flag with a reason, which suppresses identical future flags. The agent never edits.

*Acceptance:* a Workers journey with a provider fake merges a fixture pull request that renames a configuration flag. Exactly the two dependent blocks are flagged, with citations to the pull request, and the unrelated page that mentions the old name only historically is not flagged. Dismissing a flag suppresses its re-flag. Precision and recall on a held-out set of 100 labelled change and page pairs are recorded under `FLAG-003`.

*Status:* partial. Impact and claim tracing exist behind the flagship profile (`src/core/features/impact/routes.ts`, `src/core/features/claims/service.ts`); connector-event contradiction detection does not.

#### KEEP-002 — Revision-specific fix proposals.
*What the agent does:* for each flag, drafts a suggestion (`SUG-001`) against the exact block revision. The suggestion carries a diff, the sources, the readers who will see the change, and the answers and runbooks it affects, and is routed to the page owner.

*Data:* the flagged page revision, the cited change and the pages that depend on it.

*Human control:* nothing changes until the owner accepts (`SUG-002`). The exception is a change within a named routine update class that the owner granted in advance (`AI-011`), such as renaming a configuration key across pages. Such a change commits as an attributed revision that `REV-003` can roll back in one action. Verification never carries over: an edited verified page shows that its verified revision is not current (`STAT-003`).

*Acceptance:* a browser journey in which the owner receives a fix suggestion, inspects the diff and sources, and accepts it, producing one revision. A second case applies a granted rename across three pages and rolls one back. A suggestion whose anchor changed in the meantime requires a rebase and never applies silently.

*Status:* partial. Anchored suggestions and granted maintenance exist behind the flagship profile (`src/core/features/suggestions/routes.ts`, `tests/flagship/release-clauses/suggestions/anchors.test.ts`); proposals generated from flags do not.

#### KEEP-003 — Close knowledge gaps as work.
*What the agent does:* takes clusters of unanswered questions and low-rated answers (`ANSWER-004`) and repeated questions in chat (`CHAT-003`), finds the best expert (page owners, frequent editors, verifiers and `WORK-016` expertise), and sends that expert a short evidence request with the question, what was found and what is missing. From the expert's reply it drafts a card or page, and after the expert verifies it, re-asks the original questions to confirm they now retrieve it.

*Data:* questions without asker identity, expertise signals and the expert's reply.

*Human control:* the expert decides whether the draft is correct and sets its verification expiry. The agent cannot verify its own draft, and the draft is visible only to its eventual audience.

*Acceptance:* a Workers journey with a provider fake clusters seeded unanswered questions and sends one evidence request to the right expert. The expert's reply produces a draft, the expert verifies it, and re-asking the cluster's questions returns the new card as a top citation. The gap report then shows the cluster closed.

*Status:* missing.

#### KEEP-004 — Duplicates and conflicts.
*What the agent does:* finds near-duplicate pages, by `SEARCH-011`'s definition and its `seed.json → limits.nearDuplicateSimilarity` threshold, and statements that conflict across pages, and proposes a merge (one canonical page, with the others redirecting through `LINK-003` tombstone links) or a reconciliation for the owners to choose.

*Data:* page revisions within one audience; it never compares across an access boundary for a reader who lacks either side.

*Human control:* owners of both pages must accept a merge, which is reversible through restore.

*Acceptance:* a Workers journey over a seeded corpus with a pair of pages at a measured similarity of 0.9, a pair at 0.7 and one conflict proposes exactly one merge and one reconciliation, and nothing for the pair at 0.7. Accepting the merge leaves the old URL resolving to the canonical page, and search collapses the pair (`SEARCH-011`).

*Status:* partial. Claim conflict and unknown states exist behind the flagship profile (`src/core/features/claims/service.ts`); duplicate detection and merge proposals do not.

#### KEEP-005 — Answers with current evidence and stated uncertainty.
*What the agent does:* before answering, checks each candidate source's verification, lapse, open flags (`KEEP-001`) and the freshness of connected sources. It answers with what is verified, what is inferred and what is uncertain, gives the date each fact was last confirmed, and names the owner to ask when the evidence is stale.

*Data:* the asker's readable pages and connected items.

*Human control:* "Ask the owner" creates a review request (`STAT-006`) only when the asker clicks it.

*Acceptance:* a Workers journey asks about a fact whose only page carries an open outdated flag. The answer states the flag and names the owner, and clicking "Ask the owner" creates exactly one review request.

*Status:* partial. Cited answers exist behind the flagship profile (`tests/flagship/intelligence/authority.test.ts`); flag-aware uncertainty does not.

#### KEEP-006 — Checked runbooks.
*What the agent does:* converts a procedure page into steps. On a schedule or on demand, it dry-runs them against current tool schemas and owner-approved test accounts (read-only calls to GitHub, Vector, Jira or connected admin APIs), and checks links, screenshots against the current UI where possible, and command syntax. It reports each broken step on the exact block.

*Data:* the runbook page, tool schemas and responses from test accounts.

*Human control:* runs are read-only by default. Any effect requires an exact grant for an isolated test resource (`EFFECT-001`, `AI-011`). The agent stops on ambiguity and never touches production without owner approval for that run.

*Acceptance:* a Workers journey with recorded tool fixtures dry-runs a runbook whose third step references a removed API field, flags exactly that step with the schema evidence, and makes no write call.

*Status:* partial. Versioned skills and bounded runs exist behind the flagship profile (`src/core/features/skills/routes.ts`, `src/core/features/runs/routes.ts`); runbook dry-runs do not.

#### KEEP-007 — Onboarding paths.
*What the agent does:* for a new member, assembles a reading path for their group or role from current verified pages (`CARD-003` can make it required). It asks short comprehension questions, answers follow-ups with citations, and routes confusion ("this step no longer matches") to the page owner as a flag.

*Data:* verified pages readable by the new member and their questions.

*Human control:* the member controls whether their progress is shared. Their manager sees only the progress they agree to share, and nothing is inferred about performance. Formal courses and certifications belong to [Beam](https://github.com/just-every/run-beam).

*Acceptance:* a browser journey assigns a path to a new member, who answers questions and reports one confusing step. That step becomes a flag for its owner, and the manager's view shows only the shared completion.

*Status:* missing.

#### KEEP-008 — Stale-knowledge sweeps.
*What the agent does:* once a week, prepares each owner one digest of their lapsed verifications, open flags, ownerless pages in their containers and pages nobody has opened in 180 days. Each item comes with a prepared action: re-verify (which opens the revision), accept a fix, reassign, or archive.

*Data:* status, analytics (`PAGE-013`), flags and ownership.

*Human control:* every action is the owner's own click. The sweep never verifies, archives or reassigns by itself.

*Acceptance:* a Workers journey advances a week over a seeded workspace and delivers exactly one digest per owner with the expected items. Acting on two items applies the actions and leaves no duplicate notices.

*Status:* partial. Lapse notices to owners ship (`src/core/features/notifications/events.ts`, `tests/qualification/policies/status-archive.test.ts`); prepared weekly sweeps do not.

#### KEEP-009 — Measured knowledge health.
*What the agent does:* maintains a workspace knowledge-health report: the share of views landing on current verified pages, the median time from flag to fix, the flag false-positive rate from dismissals, and answer accuracy on an owner-curated held-out question set re-run monthly.

*Data:* analytics, flags and answer runs.

*Human control:* owners curate the question set and its expected answers, and the report never ranks individual people.

*Acceptance:* a Workers journey seeds a month of events and checks every report figure against hand-computed values. A held-out re-run records its accuracy and cost under `FLAG-003`'s rules.

*Status:* partial. Quality and instrumentation regressions exist (`tests/qualification/core/quality.test.ts`, `tests/qualification/core/instrumentation.test.ts`); there is no knowledge-health report.

#### KEEP-010 — Team-built agents.
*What the agent does:* a member whom an owner allows builds an agent for their team without code. The agent has a name, instructions, a knowledge scope (containers, labels, cards and connected sources), the tools it may use, and when it runs:

- **Tools:** search and cited answers (`ANSWER-001`), drafting pages and cards, proposing edits as suggestions (`SUG-001`), filing issues (`EMBED-001`) and posting to a chat channel (`CHAT-001`).
- **Triggers:** asked in Slate, in chat (`CHAT-002`) or over MCP (`API-003`), on a schedule, or on an automation event (`AUTO-*`).

Each agent is an `AI-014` agent record. Its builder can test it against sample questions before sharing it with groups.

*Data:* the intersection of the agent's declared scope and what the member it runs for may read. A scheduled or event run reads as the agent's owner, and its output reaches only an audience that may read every source it used (`AI-013`).

*Human control:* the agent can never verify, publish, archive, delete or change access. Its edits are suggestions and its pages are drafts until a member accepts them. Every run records its actor, scope, tools, sources and cost against the owner's budget (`AI-010`, `AI-012`). Owners can see, pause or delete any agent, and removing an agent's owner pauses it (`WORK-007`).

*Acceptance:* a Workers journey with a provider fake at the network edge builds an agent scoped to one container with the answer and propose-edit tools, and shares it with a group. A group member who can read only half the container asks it a question, and the answer cites only pages that member can read. The agent's proposed edit lands as a suggestion and changes nothing until it is accepted. A page in scope that instructs the agent to publish itself or grant access produces a refusal and no change. A scheduled run posts once to a channel fake, citing only sources its audience can read. Pausing the agent stops its next scheduled run, and exhausting its budget stops it with a notice to its owner. A browser journey at 1440 and 390 builds, tests and shares the agent.

*Status:* partial. Scoped agent records with exact scopes, budgets and run records exist behind the flagship profile (`tests/qualification/inquiry/routing.test.ts`, `AI-014`); there is no agent builder, no scheduled or chat trigger, and nothing runs in the default profile.

## Honest boundaries

Slate is a US-first owned wiki. These are the jobs it deliberately does not do, and how a buyer gets each one done.

- **Office documents, spreadsheets and slides.** Slate is not a full office suite. Attached Office, OpenDocument and PDF files preview, keep versions and are searchable in Slate (`BLOCK-021`, `BLOCK-022`, `SEARCH-013`), but they are edited in their own applications. Google Workspace or Microsoft 365 files are embedded and linked (`EMBED-003`, `EMBED-004`) and kept in [Chest](https://github.com/just-every/run-chest), Drive or SharePoint, while Slate pages stay the place knowledge is written and co-edited.
- **Whiteboards and diagramming suites.** Slate is not a whiteboard. Figma, Miro and Lucid boards are embedded (`EMBED-003`); diagrams as code (`BLOCK-013`) and diagrams.net diagrams (`BLOCK-019`) are native. Confluence whiteboards are named in the import report with a link to the original (`IMP-010`).
- **Video recording.** Slate does not record video. Loom and YouTube recordings are embedded (`EMBED-003`).
- **Issue tracking, sprints and project portfolios.** These belong to [Vector](https://github.com/just-every/run-vector) or Jira, embedded and connected (`EMBED-001`, `AUTO-007`). Databases can hold a light tracker. Cross-functional project management (Asana, monday.com) is a category no Run Edit Run product owns today.
- **Chat.** Slack, Microsoft Teams and [Nook](https://github.com/just-every/run-nook) are connected (`CHAT-*`).
- **Large relational databases and internal apps.** These belong to [Cradle](https://github.com/just-every/run-cradle). Slate databases stay within `seed.json → limits`, and beyond them the buyer links a Cradle base.
- **Formal training and compliance certifications.** These belong to [Beam](https://github.com/just-every/run-beam) and [Evidence](https://github.com/just-every/run-evidence). Slate provides reading paths and acknowledgements (`KEEP-007`, `CARD-003`).
- **A customer-facing help centre and ticket deflection.** These belong to [HappyToHelp](https://github.com/just-every/run-happytohelp), which can cite Slate pages and cards. Slate publishes pages (`WEB-*`), not a support portal.
- **Identity provider.** Slate is a SAML and OIDC relying party and a SCIM client (`ADMIN-001`, `ADMIN-002`). The directory itself is Okta, Entra ID or [Auth](https://github.com/just-every/run-auth).
- **Freshness and access beyond what a source's API exposes.** Connectors mirror documented ACLs and deletions and show their lag (`CONNECT-002`, `CONNECT-003`). Slate promises nothing beyond what a source's API exposes, and a working credential is never treated as permission to disclose.
- **Hosting frontier models or unbounded compute.** Inference runs at the owner's chosen provider under owner budgets (`ANSWER-006`, `AI-012`). Long jobs run as bounded durable stages within Cloudflare Workers limits.
- **Regulated records management.** Legal hold, records retention schedules, HIPAA and FedRAMP programmes are not promised by ordinary wiki security. Buyers keep regulated records in an approved records system and connect scoped knowledge. SOC 2 evidence collection belongs to [Evidence](https://github.com/just-every/run-evidence).
- **Hosting region, currency and language.** Slate is US-first: it is deployed to the buyer's Cloudflare account, budgets are in USD and the interface is in US English. EU data-residency guarantees and localized interfaces are not claimed.
- **Rewriting links stored in other products.** Slate does not edit the Slack or Teams messages, emails, Google Docs or Jira comment text that contain old Confluence URLs, and Confluence does not either when a site moves. Those links still reach the right record through the resolver, chat unfurls, pasted-URL resolution and the browser extension, which IT can force-install on managed browsers (`IMP-013`, `SEARCH-014`, `CARD-002`), and Jira's issue links are re-pointed (`EMBED-006`). Atlassian owns the `atlassian.net` hostname, so after that site is cancelled a click on an old link in a browser without the extension reaches Atlassian, not Slate.
- **Native app distribution.** This needs the buyer's or Run Edit Run's Apple and Google developer accounts. That is engineering and release work (`MOBILE-001`, `MOBILE-002`), not a reason to drop the apps.

## Out of scope

The following remain non-goals:

- commercial plan ladders, subscription trials and credits, seat counting and upgrade gates;
- vendor suite chrome;
- a commercial marketplace or storefront;
- coupling to a single issue tracker (Vector and Jira connect through the same embed and automation clauses);
- a bundled screen recorder;
- multiple workspaces per deployment.

Bounded product experiments are not subscription trials. Live co-editing, evaluated formulas and rollups, suggested edits, scoped agent budgets, native apps (`MOBILE-*`), page locks (`PAGE-015`), label filtering (`SEARCH-010`), space blogs (`CONT-010`) and a company hub (`CONT-011`) are in scope.

Some incumbent features are met another way:

- native whiteboards by embeds (`EMBED-003`) and diagrams as code (`BLOCK-013`);
- container calendars by database calendar views (`DB-004`);
- meeting-note specializations by starter templates with assigned tasks (`TMPL-007`, `BLOCK-015`);
- team profiles by the people directory (`WORK-016`).

Contributed tree node kinds beyond pages, databases, cards and posts, and cross-container assignments, remain future extensions; existing page, comment and activity requirements are not waived. The target adds no new policy profile and preserves all eight profiles and every value unchanged. [Honest boundaries](#honest-boundaries) lists what Slate connects to instead of building.

## Retired clause IDs

These retired product clause IDs were used by earlier versions of this contract
and are never reused. The public repository is `just-every/run-slate`. Earlier
planning-record categories are retired with their planning scope; decision and
evidence behavior now belongs to `DEC-001` through `DEC-006` and verification
over revisions (`STAT-003`, `REV-005`). `WORK-002` (equal operators with no
roles) is retired because this family has access levels, groups and guests.
`WORK-004` (authenticated sharing only) is retired because this family publishes
pages to the anonymous web under `WEB-001`. `WORK-005` (the planning overview) is
retired in favour of `NAV-001`. `SAVE-007` (one long-text format) is retired in
favour of `BLOCK-001` and `BLOCK-002`.

## Status

Judged from the code and tests at commit `8956e45` (16 October 2026); see [How to read this contract](#how-to-read-this-contract) for what each status means. Evidence is the first test or file that exercises the clause; a `partial` note says what is missing. No status here is acceptance.

| Clauses | Done | Partial | Missing | Total |
| --- | ---: | ---: | ---: | ---: |
| Published | 160 | 61 | 0 | 221 |
| Target and push further | 0 | 53 | 52 | 105 |
| All | 160 | 114 | 52 | 326 |

| Clause | Title | Kind | Status | Evidence | Gap |
| --- | --- | --- | --- | --- | --- |
| `HOME-001` | Public landing | published | done | `tests/e2e/landing-styles.test.mjs` |  |
| `DOCS-001` | Public documentation | published | done | `tests/e2e/docs.test.ts` |  |
| `WORK-001` | One workspace | published | done | `tests/qualification/backend/workspace-lifecycle.test.ts` |  |
| `WORK-003` | Member management | published | done | `tests/qualification/backend/workspace-lifecycle.test.ts` |  |
| `WORK-006` | Invitations | published | done | `tests/e2e/local-outbox.node.test.mts` |  |
| `WORK-007` | Removal | published | done | `tests/qualification/core/identity.mjs` |  |
| `WORK-008` | Roles | published | done | `tests/qualification/core/identity.mjs` |  |
| `WORK-009` | Groups | published | done | `tests/qualification/core/identity.mjs` |  |
| `WORK-010` | Guests | published | done | `tests/qualification/core/identity.mjs` |  |
| `WORK-011` | Workspace settings | published | done | `tests/qualification/core/identity.mjs` |  |
| `WORK-012` | Theme | published | done | `tests/qualification/core/identity.mjs` |  |
| `WORK-013` | First run | published | done | `tests/qualification/backend/emitted.mjs` |  |
| `WORK-014` | Shortcut reference | published | done | `tests/qualification/core/shell.mjs` |  |
| `WORK-015` | Identity provider | published | done | `tests/qualification/core/identity.mjs` |  |
| `SAVE-001` | Durable save state | published | done | `tests/qualification/interface/routed.browser.mjs` |  |
| `SAVE-002` | Failed writes | published | partial | `src/core/features/editor/ui/SaveStatus.tsx` | failed-write state in UI stories only |
| `SAVE-003` | Revision conflicts | published | done | `tests/qualification/policies/comments-suggestions.test.ts` |  |
| `SAVE-004` | Network loss | published | done | `tests/qualification/offline-refresh/transport.test.ts` |  |
| `SAVE-005` | Operation keys | published | done | `tests/qualification/backend/request-access.test.ts` |  |
| `SAVE-006` | Concurrent editing and optional co-editing | published | partial | `tests/qualification/ui-convergence/two-people-editing.mjs` | live co-editing only under the flagship opt-in; see COLLAB-001 |
| `PAGE-001` | What a page is | published | done | `tests/e2e/imports/real-exports.test.ts` |  |
| `PAGE-002` | Creation | published | done | `tests/qualification/interface/content.mjs` |  |
| `PAGE-003` | Identity survives everything | published | done | `tests/qualification/policies/container-links.test.ts` |  |
| `PAGE-004` | Move | published | done | `tests/e2e/page-move-state.test.tsx` |  |
| `PAGE-005` | Duplicate | published | done | `tests/flagship/content/http.test.ts` |  |
| `PAGE-006` | Icon and cover | published | done | `tests/qualification/backend/appearance-invitations.test.ts` |  |
| `PAGE-007` | Details | published | done | `tests/qualification/backend/emitted.mjs` |  |
| `PAGE-008` | Favourite | published | done | `tests/qualification/backend/sharing-navigation.test.ts` |  |
| `PAGE-009` | Watch | published | partial | `src/core/features/comments/service.ts` | watch code; no journey |
| `PAGE-010` | Outline | published | partial | `src/core/features/pages/ui/PageOutline.tsx` | outline UI; no journey |
| `PAGE-011` | Present | published | partial | `src/core/features/pages/ui/workspace/PagePresentation.tsx` | present mode UI; no journey |
| `PAGE-012` | Page display options | published | partial | `src/core/features/pages/ui/workspace/PageDisplay.tsx` | display options UI; no journey |
| `PAGE-013` | Analytics | published | partial | `src/core/features/analytics/` | analytics code; no requirement-level journey |
| `PAGE-014` | Reactions | published | partial | `src/core/features/pages/ui/workspace/ReactionControls.tsx` | page reactions UI; no journey |
| `TREE-001` | A nested tree in a container | published | done | `tests/qualification/tree-correction/regression.test.ts` |  |
| `TREE-002` | Reordering and nesting | published | done | `tests/qualification/publication/preview.test.ts` |  |
| `TREE-003` | Shared with me | published | partial | `src/core/app/ui/SpaceTrees.tsx` | shared-with-me UI; no journey |
| `TREE-004` | Filter the tree | published | partial | `src/core/app/ui/PageTree.tsx` | tree filter UI; no journey |
| `TREE-005` | Create in place | published | partial | `src/core/app/ui/NavigationCreate.tsx` | create-in-place UI; no journey |
| `BLOCK-001` | A body of blocks | published | done | `tests/qualification/interface/routed.browser.mjs` |  |
| `BLOCK-002` | Inline text | published | done | `tests/e2e/editor/editable-composition.test.mjs` |  |
| `BLOCK-003` | The insert menu | published | done | `tests/qualification/interface/formatting.test.ts` |  |
| `BLOCK-004` | Markdown shortcuts | published | done | `tests/qualification/interface/content.mjs` |  |
| `BLOCK-005` | Mentions | published | done | `tests/e2e/editor/rich-text-editing.test.tsx` |  |
| `BLOCK-006` | Structured blocks | published | done | `tests/qualification/interface/blocks.mjs` |  |
| `BLOCK-007` | Task items | published | done | `tests/flagship/content/repair.test.ts` |  |
| `BLOCK-008` | Media blocks | published | partial | `tests/qualification/policies/safety-history.test.ts` | upload and link media ship; configured stock source missing |
| `BLOCK-009` | Link cards | published | done | `tests/flagship/content/preview.test.ts` |  |
| `BLOCK-010` | Content queries | published | done | `tests/qualification/interface/blocks.mjs` |  |
| `LIFE-001` | Lifecycle states | published | done | `tests/qualification/interface/publication.mjs` |  |
| `LIFE-002` | A draft is private | published | done | `tests/qualification/inquiry/lifecycle.test.ts` |  |
| `LIFE-003` | Publish | published | done | `tests/qualification/interface/publication.mjs` |  |
| `LIFE-004` | Scheduled publish | published | done | `tests/qualification/interface/publication.mjs` |  |
| `LIFE-005` | Unpublished changes | published | done | `tests/qualification/interface/publication.mjs` |  |
| `LIFE-006` | Lifecycle profile | published | done | `tests/qualification/policies/emitted.mjs` |  |
| `LIFE-007` | Discarding a draft | published | done | `tests/qualification/policies/status-archive.test.ts` |  |
| `SHARE-001` | Grants | published | done | `tests/qualification/backend/emitted.mjs` |  |
| `SHARE-002` | What the levels mean | published | done | `tests/qualification/backend/request-access.test.ts` |  |
| `SHARE-003` | Inheritance | published | done | `tests/qualification/backend/boundaries.test.ts` |  |
| `SHARE-004` | General access | published | done | `tests/e2e/imports/real-exports.test.ts` |  |
| `SHARE-005` | Access profile | published | done | `tests/e2e/imports/real-exports.test.ts` |  |
| `SHARE-006` | Sharing with a person who is not a member | published | done | `tests/qualification/backend/appearance-invitations.test.ts` |  |
| `SHARE-007` | Access changes take effect at once | published | done | `tests/qualification/policies/access-publication.test.ts` |  |
| `SHARE-008` | Expiring grants | published | done | `tests/qualification/policies/access-publication.test.ts` |  |
| `WEB-001` | Anonymous access takes two acts | published | done | `tests/qualification/policies/access-publication.test.ts` |  |
| `WEB-002` | What a published page carries | published | done | `tests/qualification/policies/access-publication.test.ts` |  |
| `WEB-003` | The anonymous read view | published | done | `tests/qualification/policies/access-publication.test.ts` |  |
| `WEB-004` | Children are not published by inheritance | published | done | `tests/qualification/policies/access-publication.test.ts` |  |
| `WEB-005` | Indexing is off until it is chosen | published | done | `tests/qualification/policies/access-publication.test.ts` |  |
| `WEB-006` | Unpublish | published | done | `tests/qualification/policies/access-publication.test.ts` |  |
| `WEB-007` | Public-link profile | published | done | `tests/qualification/policies/access-publication.test.ts` |  |
| `REV-001` | What a revision is | published | done | `tests/qualification/policies/automation-templates.test.ts` |  |
| `REV-002` | History | published | done | `tests/qualification/policies/lifecycle-versions.test.ts` |  |
| `REV-003` | Restore | published | done | `tests/qualification/policies/lifecycle-versions.test.ts` |  |
| `REV-004` | Compare | published | done | `tests/e2e/review/verification-flow.test.ts` |  |
| `REV-005` | A citation resolves to its revision | published | done | `tests/e2e/review/verification-flow.test.ts` |  |
| `REV-006` | Deleting a version | published | done | `tests/qualification/policies/lifecycle-versions.test.ts` |  |
| `REV-007` | Version profile | published | done | `tests/e2e/imports/real-exports.test.ts` |  |
| `STAT-001` | The status vocabulary | published | done | `tests/qualification/policies/status-archive.test.ts` |  |
| `STAT-002` | A page's status | published | done | `tests/qualification/policies/container-links.test.ts` |  |
| `STAT-003` | Verification | published | done | `tests/e2e/review/verification-flow.test.ts` |  |
| `STAT-004` | Verification lapses | published | done | `tests/qualification/policies/status-archive.test.ts` |  |
| `STAT-005` | Status profile | published | done | `tests/qualification/policies/emitted.mjs` |  |
| `COMM-001` | Two kinds of thread | published | done | `tests/e2e/editor/rich-text-editing.test.tsx` |  |
| `COMM-002` | Editing and deletion | published | done | `tests/qualification/policies/comments-suggestions.test.ts` |  |
| `COMM-003` | Mentions | published | done | `tests/qualification/interface/content.mjs` |  |
| `COMM-004` | Anchors survive editing | published | done | `tests/qualification/interface/content.mjs` |  |
| `COMM-005` | Reactions | published | done | `tests/qualification/interface/content.mjs` |  |
| `COMM-006` | Discussions panel | published | done | `tests/qualification/interface/content.mjs` |  |
| `COMM-007` | Resolve | published | done | `tests/qualification/policies/comments-suggestions.test.ts` |  |
| `ARCH-001` | Archive | published | done | `tests/qualification/policies/status-archive.test.ts` |  |
| `ARCH-002` | What archived means | published | done | `tests/qualification/policies/status-archive.test.ts` |  |
| `ARCH-003` | Restore from archive | published | done | `tests/qualification/policies/status-archive.test.ts` |  |
| `ARCH-004` | Archive is not deletion | published | done | `tests/qualification/policies/status-archive.test.ts` |  |
| `ARCH-005` | Trash | published | done | `tests/qualification/policies/status-archive.test.ts` |  |
| `ARCH-006` | Permanent deletion | published | done | `tests/qualification/erasure-metadata/append-metadata.test.ts` |  |
| `CONT-001` | What a container is | published | done | `tests/qualification/policies/container-links.test.ts` |  |
| `CONT-002` | Creating a container | published | done | `tests/qualification/policies/container-links.test.ts` |  |
| `CONT-003` | The container index | published | done | `tests/qualification/policies/container-links.test.ts` |  |
| `CONT-004` | Container settings | published | done | `tests/qualification/policies/container-links.test.ts` |  |
| `CONT-005` | Personal containers | published | done | `tests/e2e/imports/real-exports.test.ts` |  |
| `CONT-006` | Bulk actions | published | done | `tests/qualification/policies/container-links.test.ts` |  |
| `CONT-007` | External-access switches | published | done | `tests/qualification/policies/access-publication.test.ts` |  |
| `CONT-008` | Container access profile | published | done | `tests/qualification/policies/access-publication.test.ts` |  |
| `CONT-009` | Container grants | published | done | `tests/qualification/policies/access-publication.test.ts` |  |
| `DB-001` | A database | published | done | `tests/qualification/policies/structured-views.test.ts` |  |
| `DB-002` | Field types and evaluation | published | done | `tests/e2e/databases/field-editing.test.tsx` |  |
| `DB-003` | Views | published | done | `tests/qualification/policies/structured-views.test.ts` |  |
| `DB-004` | Layouts | published | done | `tests/qualification/policies/structured-views.test.ts` |  |
| `DB-005` | Filter and sort | published | done | `tests/qualification/policies/structured-views.test.ts` |  |
| `DB-006` | Group | published | done | `tests/qualification/policies/structured-views.test.ts` |  |
| `DB-007` | Calculations | published | done | `tests/qualification/policies/fields.test.ts` |  |
| `DB-008` | Charts | published | done | `tests/qualification/policies/fields.test.ts` |  |
| `DB-009` | Lock structure | published | done | `tests/qualification/policies/structured-views.test.ts` |  |
| `DB-010` | A record is a page | published | done | `tests/qualification/backend/records-templates.test.ts` |  |
| `DB-011` | A view inside a page | published | done | `tests/qualification/policies/structured-views.test.ts` |  |
| `DB-012` | Record detail | published | done | `tests/qualification/policies/structured-views.test.ts` |  |
| `AUTO-001` | A rule | published | done | `tests/qualification/policies/automation-templates.test.ts` |  |
| `AUTO-002` | A rule acts as its actor | published | done | `tests/qualification/policies/automation-templates.test.ts` |  |
| `AUTO-003` | Run log | published | done | `tests/qualification/policies/automation-templates.test.ts` |  |
| `AUTO-004` | Loops are bounded | published | done | `tests/qualification/policies/automation-templates.test.ts` |  |
| `AUTO-005` | Automation profile | published | done | `tests/qualification/policies/automation-templates.test.ts` |  |
| `SEARCH-001` | Global search | published | done | `tests/qualification/core/discovery-browser.mjs` |  |
| `SEARCH-002` | Results | published | done | `tests/qualification/core/discovery.mjs` |  |
| `SEARCH-003` | Filters | published | done | `tests/qualification/core/discovery.mjs` |  |
| `SEARCH-004` | Freshness | published | done | `tests/qualification/core/discovery.mjs` |  |
| `SEARCH-005` | What search never shows | published | done | `tests/qualification/core/discovery.mjs` |  |
| `SEARCH-006` | Search in one container | published | done | `tests/qualification/core/discovery-browser.mjs` |  |
| `SEARCH-007` | No results | published | done | `tests/qualification/core/discovery-browser.mjs` |  |
| `SEARCH-008` | Search without AI | published | done | `tests/qualification/core/discovery.mjs` |  |
| `SEARCH-009` | Default visibility | published | done | `tests/qualification/core/discovery.mjs` |  |
| `NAV-001` | Home | published | done | `tests/qualification/backend/emitted.mjs` |  |
| `NAV-002` | Recents | published | done | `tests/qualification/backend/sharing-navigation.test.ts` |  |
| `NAV-003` | Favourites | published | done | `tests/qualification/backend/sharing-navigation.test.ts` |  |
| `NAV-004` | One navigation | published | done | `tests/qualification/backend/boundaries.test.ts` |  |
| `NAV-005` | Global create | published | partial | `src/core/app/ui/NavigationCreate.tsx` | global create UI; no journey |
| `NAV-006` | The touch client edits | published | partial | `tests/qualification/interface/routed.browser.mjs` | responsive web journeys; native apps missing (MOBILE-001) |
| `NOTIF-001` | Meaningful notifications | published | done | `tests/qualification/backend/emitted.mjs` |  |
| `NOTIF-002` | Inbox | published | done | `tests/qualification/core/discovery.mjs` |  |
| `NOTIF-003` | Chat notifications | published | partial | `src/core/features/notifications/slack.ts` | Slack destination code; no requirement-level journey |
| `MAIL-001` | Outbound only, two kinds | published | done | `tests/flagship/core/mail.test.ts` |  |
| `MAIL-002` | Delivery failure | published | done | `tests/flagship/core/mail.node.test.mts` |  |
| `ACT-001` | Durable timeline | published | done | `tests/qualification/core/discovery.mjs` |  |
| `ACT-002` | Coverage | published | done | `tests/qualification/core/audit-ai.test.ts` |  |
| `ACT-003` | Retrieval | published | done | `tests/qualification/core/discovery.mjs` |  |
| `ACT-004` | Context | published | done | `tests/qualification/core/discovery-browser.mjs` |  |
| `ACT-005` | Retained explanation | published | done | `tests/qualification/core/discovery.mjs` |  |
| `TMPL-001` | Gallery | published | done | `tests/qualification/policies/automation-templates.test.ts` |  |
| `TMPL-002` | Preview | published | done | `tests/qualification/policies/automation-templates.test.ts` |  |
| `TMPL-003` | Snapshot on use | published | done | `tests/qualification/policies/automation-templates.test.ts` |  |
| `TMPL-004` | Custom templates | published | done | `tests/qualification/policies/automation-templates.test.ts` |  |
| `TMPL-005` | Save a page as a template | published | done | `tests/qualification/policies/automation-templates.test.ts` |  |
| `TMPL-006` | Where a template lives | published | done | `tests/qualification/policies/automation-templates.test.ts` |  |
| `IMP-001` | Import jobs | published | done | `tests/e2e/imports/preview-undo.test.ts` |  |
| `IMP-002` | Notion import | published | done | `tests/e2e/imports/real-exports.test.ts` |  |
| `IMP-003` | Confluence import | published | done | `tests/e2e/imports/real-exports.test.ts` |  |
| `IMP-004` | Import safety | published | done | `tests/e2e/imports/real-exports.test.ts` |  |
| `IMP-005` | Importing into a page | published | done | `tests/flagship/federation/federation.test.ts` |  |
| `PORT-001` | Export contents | published | done | `tests/qualification/erasure-metadata/append-metadata.test.ts` |  |
| `PORT-002` | Referential restore | published | done | `tests/qualification/erasure-metadata/append-metadata.test.ts` |  |
| `PORT-003` | Visible jobs | published | done | `tests/qualification/portability-jobs/admission-audit.test.ts` |  |
| `PORT-004` | Search rebuild | published | done | `tests/e2e/imports/preview-undo.test.ts` |  |
| `PORT-005` | Access boundary | published | done | `tests/e2e/imports/real-exports.test.ts` |  |
| `PORT-006` | Atomic import | published | done | `tests/qualification/authority/atomic-recovery.test.ts` |  |
| `PORT-007` | Exporting a page or a container | published | done | `tests/flagship/federation/federation.test.ts` |  |
| `LINK-001` | Permanent URLs | published | done | `tests/qualification/policies/container-links.test.ts` |  |
| `LINK-002` | Tombstones | published | done | `tests/qualification/policies/status-archive.test.ts` |  |
| `LINK-003` | References follow their target | published | done | `tests/qualification/backend/page-details.test.ts` |  |
| `LINK-004` | Links respect access | published | done | `tests/qualification/backend/emitted.mjs` |  |
| `AI-001` | Enablement | published | partial | `tests/qualification/inquiry/provider-mechanics.test.ts` | flagship opt-in only (FEATURE_DISABLED in core-wiki) |
| `AI-002` | Run lifecycle | published | partial | `tests/qualification/inquiry/lifecycle.test.ts` | flagship opt-in only (FEATURE_DISABLED in core-wiki) |
| `AI-003` | Proposal or bounded delegation | published | partial | `src/core/features/ai/routes.ts` | flagship opt-in only; no journey |
| `AI-004` | Answer provenance | published | partial | `tests/qualification/inquiry/lifecycle.test.ts` | flagship opt-in only (FEATURE_DISABLED in core-wiki) |
| `AI-005` | Acceptance and granted mutation | published | partial | `tests/qualification/inquiry/transport-parity.test.ts` | flagship opt-in only (FEATURE_DISABLED in core-wiki) |
| `AI-006` | Current inputs before use | published | partial | `tests/qualification/inquiry/lifecycle.test.ts` | flagship opt-in only (FEATURE_DISABLED in core-wiki) |
| `AI-007` | Untrusted content | published | partial | `tests/qualification/inquiry/provider-mechanics.test.ts` | flagship opt-in only (FEATURE_DISABLED in core-wiki) |
| `AI-008` | Failure preserves confirmed work | published | partial | `tests/qualification/inquiry/provider-mechanics.test.ts` | flagship opt-in only (FEATURE_DISABLED in core-wiki) |
| `AI-009` | Retry | published | partial | `tests/qualification/inquiry/lifecycle.test.ts` | flagship opt-in only (FEATURE_DISABLED in core-wiki) |
| `AI-010` | Usage record | published | partial | `tests/qualification/inquiry/provider-mechanics.test.ts` | flagship opt-in only (FEATURE_DISABLED in core-wiki) |
| `AI-011` | No self-granted authority | published | partial | `src/core/features/ai/routes.ts` | flagship opt-in only; no journey |
| `AI-012` | Durable budgets | published | partial | `tests/qualification/inquiry/lifecycle.test.ts` | flagship opt-in only (FEATURE_DISABLED in core-wiki) |
| `AI-013` | Requester and audience boundary | published | partial | `tests/qualification/inquiry/lifecycle.test.ts` | flagship opt-in only (FEATURE_DISABLED in core-wiki) |
| `AI-014` | Scoped agents | published | partial | `tests/qualification/inquiry/routing.test.ts` | flagship opt-in only (FEATURE_DISABLED in core-wiki) |
| `AI-015` | Workspace answers | published | partial | `tests/qualification/inquiry/inquiry-mechanics.test.ts` | flagship opt-in only (FEATURE_DISABLED in core-wiki) |
| `AI-016` | Summaries | published | partial | `src/core/features/ai/routes.ts` | flagship opt-in only; no journey |
| `AI-017` | Writing with AI | published | partial | `tests/qualification/inquiry/selection-agent.test.ts` | flagship opt-in only (FEATURE_DISABLED in core-wiki) |
| `DEC-001` | A decision is a layer over a page | published | done | `tests/qualification/decisions/mechanics.test.ts` |  |
| `DEC-002` | States | published | done | `tests/qualification/decisions/mechanics.test.ts` |  |
| `DEC-003` | An accepted decision is immutable | published | done | `tests/qualification/decisions/mechanics.test.ts` |  |
| `DEC-004` | Decision log | published | done | `tests/qualification/decisions/mechanics.test.ts` |  |
| `DEC-005` | Review dates | published | done | `tests/qualification/decisions/mechanics.test.ts` |  |
| `DEC-006` | A proposed decision is editable | published | done | `tests/qualification/decisions/mechanics.test.ts` |  |
| `SUG-001` | Anchored suggestions | published | partial | `tests/qualification/policies/comments-suggestions.test.ts` | flagship opt-in only (FEATURE_DISABLED in core-wiki) |
| `SUG-002` | Resolve explicitly | published | partial | `tests/qualification/policies/comments-suggestions.test.ts` | flagship opt-in only (FEATURE_DISABLED in core-wiki) |
| `SOURCE-001` | Connector contract | published | partial | `tests/flagship/release-clauses/federation/connector-disclosure.test.ts` | flagship opt-in only (FEATURE_DISABLED in core-wiki) |
| `SOURCE-002` | Exact passages | published | partial | `tests/flagship/release-clauses/federation/exact-passages.test.ts` | flagship opt-in only (FEATURE_DISABLED in core-wiki) |
| `SOURCE-003` | Scoped claims and authority | published | partial | `tests/qualification/authority/decision-authority.test.ts` | flagship opt-in only (FEATURE_DISABLED in core-wiki) |
| `SOURCE-004` | Live observations | published | partial | `tests/qualification/authority/native-boundaries.test.ts` | flagship opt-in only (FEATURE_DISABLED in core-wiki) |
| `SOURCE-005` | Revocation and deletion | published | partial | `tests/qualification/authority/evaluation-boundaries.test.ts` | flagship opt-in only (FEATURE_DISABLED in core-wiki) |
| `SOURCE-006` | Credential lifecycle | published | partial | `tests/qualification/authority/disconnect.test.ts` | flagship opt-in only (FEATURE_DISABLED in core-wiki) |
| `SKILL-001` | Versioned procedure | published | partial | `tests/qualification/authority/skill-disclosure.test.ts` | flagship opt-in only (FEATURE_DISABLED in core-wiki) |
| `SKILL-002` | Evaluation and activation | published | partial | `tests/qualification/authority/evaluation-boundaries.test.ts` | flagship opt-in only (FEATURE_DISABLED in core-wiki) |
| `SKILL-003` | Version transitions | published | partial | `tests/qualification/authority/skill-disclosure.test.ts` | flagship opt-in only (FEATURE_DISABLED in core-wiki) |
| `EFFECT-001` | Durable effects | published | partial | `tests/qualification/release-restore-authority/restored-effects.test.ts` | flagship opt-in only (FEATURE_DISABLED in core-wiki) |
| `EFFECT-002` | Consent and product custody | published | partial | `tests/qualification/inquiry/inquiry-mechanics.test.ts` | flagship opt-in only (FEATURE_DISABLED in core-wiki) |
| `EFFECT-003` | Impact and maintenance | published | partial | `tests/qualification/inquiry/impact.test.ts` | flagship opt-in only (FEATURE_DISABLED in core-wiki) |
| `AGENT-001` | Semantic parity | published | partial | `tests/qualification/inquiry/selection-agent.test.ts` | flagship opt-in only (FEATURE_DISABLED in core-wiki) |
| `AGENT-002` | Portable owner interfaces | published | partial | `tests/flagship/release-clauses/portability/owner-views.test.ts` | flagship opt-in only (FEATURE_DISABLED in core-wiki) |
| `INQ-001` | Open questions | published | partial | `tests/qualification/inquiry/inquiry-mechanics.test.ts` | flagship opt-in only (FEATURE_DISABLED in core-wiki) |
| `INQ-002` | Reproducible reasoning | published | partial | `tests/qualification/inquiry/inquiry-mechanics.test.ts` | flagship opt-in only (FEATURE_DISABLED in core-wiki) |
| `INQ-003` | Bounded planning | published | partial | `tests/qualification/inquiry/inquiry-mechanics.test.ts` | flagship opt-in only (FEATURE_DISABLED in core-wiki) |
| `INQ-004` | Routing and ambient discovery | published | partial | `tests/qualification/inquiry/ambient.test.ts` | flagship opt-in only (FEATURE_DISABLED in core-wiki) |
| `INQ-005` | Economical sustained work | published | partial | `tests/qualification/authority/learned-provenance.test.ts` | flagship opt-in only (FEATURE_DISABLED in core-wiki) |
| `TRIAL-001` | Predeclared comparison | published | partial | `tests/qualification/inquiry/trial-loop.test.ts` | flagship opt-in only (FEATURE_DISABLED in core-wiki) |
| `TRIAL-002` | Exposure and safety | published | partial | `tests/qualification/inquiry/trial-loop.test.ts` | flagship opt-in only (FEATURE_DISABLED in core-wiki) |
| `TRIAL-003` | Outcome classification | published | partial | `tests/qualification/inquiry/trial-loop.test.ts` | flagship opt-in only (FEATURE_DISABLED in core-wiki) |
| `TRIAL-004` | Reusable learning | published | partial | `tests/qualification/inquiry/semantic-evaluation.test.ts` | flagship opt-in only (FEATURE_DISABLED in core-wiki) |
| `FLAG-001` | Complete product gate | published | partial | `tests/flagship/release-clauses/portability/profile-retention.test.ts` | release gate; full flagship and provider evidence pending |
| `FLAG-002` | Independent evidence | published | partial | `tests/flagship/release-clauses/portability/staged-recovery.test.ts` | release gate; full flagship and provider evidence pending |
| `FLAG-003` | Value and held-out evaluation | published | partial | `tests/qualification/core/instrumentation.test.ts` | release gate; full flagship and provider evidence pending |
| `FLAG-004` | Complete portable knowledge | published | partial | `tests/qualification/authority/recovery.test.ts` | release gate; full flagship and provider evidence pending |
| `COLLAB-001` | Live co-editing by default | target | partial | `src/core/features/collaboration/durable-object.ts` | see the clause |
| `COLLAB-002` | Presence, cursors and following | target | partial | `src/core/features/collaboration/service.ts` | see the clause |
| `COLLAB-003` | Offline edits that merge | target | partial | `src/core/features/editor/ui/SaveStatus.tsx` | see the clause |
| `COLLAB-004` | Long pages and heavy tables stay fast | target | missing | — | not implemented |
| `COLLAB-005` | Attributed history from co-editing | target | partial | `src/core/features/versions/service.ts` | see the clause |
| `PAGE-015` | Page lock | target | missing | `src/core/features/databases/service.ts` | not implemented |
| `BLOCK-011` | Synced blocks | target | missing | — | not implemented |
| `BLOCK-012` | Columns and page layouts | target | missing | `src/core/features/editor/validation.ts` | not implemented |
| `BLOCK-013` | Equations and diagrams as code | target | missing | — | not implemented |
| `BLOCK-014` | Tables that work like tables | target | partial | `src/core/features/editor/validation.ts` | see the clause |
| `BLOCK-015` | Assigned tasks with due dates | target | partial | `src/core/features/editor/tasks.ts` | see the clause |
| `BLOCK-016` | Task reports | target | missing | — | not implemented |
| `BLOCK-017` | Table of contents block | target | missing | — | not implemented |
| `BLOCK-018` | Status labels | target | missing | — | not implemented |
| `BLOCK-019` | Diagrams.net diagrams | target | missing | — | not implemented |
| `BLOCK-020` | Group mentions | target | partial | `tests/e2e/editor/rich-text-editing.test.tsx` | see the clause |
| `BLOCK-021` | Attachment previews | target | missing | — | not implemented |
| `BLOCK-022` | Attachment versions | target | missing | — | not implemented |
| `CONT-010` | Space blog and announcements | target | missing | — | not implemented |
| `CONT-011` | Space home and company hub | target | partial | `src/core/features/containers/service.ts` | see the clause |
| `CONT-012` | Watch a container | target | missing | — | not implemented |
| `PAGE-016` | Autowatch on create and edit | target | partial | `src/core/features/navigation/service.ts` | see the clause |
| `WORK-016` | People directory and expertise | target | missing | — | not implemented |
| `SHARE-009` | Share with a message | target | partial | `tests/qualification/backend/emitted.mjs` | see the clause |
| `TMPL-007` | Starter templates | target | partial | `src/core/features/templates/service.ts` | see the clause |
| `NAV-007` | My tasks | target | missing | — | not implemented |
| `SEARCH-010` | Labels and advanced search | target | partial | `src/core/features/pages/service.ts` | see the clause |
| `SEARCH-011` | Verified-first ranking and trust badges | target | partial | `src/core/features/page-status/state.ts` | see the clause |
| `SEARCH-012` | Connected results in search | target | partial | `src/core/features/source-memory/service.ts` | see the clause |
| `SEARCH-013` | Search inside attached files | target | missing | — | not implemented |
| `SEARCH-014` | Old Confluence URLs find their Slate record | target | missing | — | not implemented |
| `STAT-006` | Review requests and expert queues | target | partial | `src/core/features/page-status/review.ts` | see the clause |
| `STAT-007` | Verification rules | target | missing | — | not implemented |
| `CARD-001` | Knowledge cards and collections | target | partial | `src/core/features/containers/service.ts` | see the clause |
| `CARD-002` | Browser extension | target | missing | — | not implemented |
| `CARD-003` | Required reading and announcements | target | missing | — | not implemented |
| `DB-013` | Database forms | target | missing | — | not implemented |
| `DB-014` | Dashboards | target | partial | `src/core/features/databases/ui/workspace/DatabaseChart.tsx` | see the clause |
| `DB-015` | Record templates and recurring records | target | partial | `src/core/features/automation/events.ts` | see the clause |
| `DB-016` | AI autofill fields | target | missing | — | not implemented |
| `NOTIF-004` | Reminders | target | missing | — | not implemented |
| `NOTIF-005` | Email, push and digest delivery | target | missing | — | not implemented |
| `NOTIF-006` | Workspace notification defaults | target | missing | — | not implemented |
| `AUTO-006` | Outbound automation actions | target | partial | `src/core/features/automation/actions.ts` | see the clause |
| `AUTO-007` | Triggers from connected tools | target | missing | — | not implemented |
| `AUTO-008` | Accountable follow-through | target | partial | `src/core/features/automation/jobs.ts` | see the clause |
| `IMP-006` | Notion import with comments and live databases | target | partial | `src/core/features/imports/service.ts` | see the clause |
| `IMP-007` | Confluence Cloud live migration | target | missing | — | not implemented |
| `IMP-008` | Guru import | target | missing | — | not implemented |
| `IMP-009` | Folder imports from Google Drive and SharePoint | target | partial | `src/core/features/imports/service.ts` | see the clause |
| `IMP-010` | Confluence macros, tasks and diagrams map to Slate blocks | target | partial | `src/core/features/imports/confluence/storage.ts` | see the clause |
| `IMP-011` | Confluence space permissions become container grants | target | missing | — | not implemented |
| `IMP-012` | Confluence personal spaces become personal containers | target | partial | `src/core/features/imports/confluence/space.ts` | see the clause |
| `IMP-013` | Old Confluence links resolve in Slate | target | partial | `src/core/platform/db/knowledge-operations-schema.ts` | see the clause |
| `IMP-014` | Links between spaces imported in separate passes | target | missing | — | not implemented |
| `PORT-008` | Exports carry comments | target | missing | `src/core/features/workspace-export/readable.ts` | not implemented |
| `PORT-009` | Scheduled backups to the buyer's storage | target | partial | `docs/BACKUP.md` | see the clause |
| `PORT-010` | Word export of a page | target | missing | — | not implemented |
| `EMBED-001` | Live issue embeds from Vector and Jira | target | missing | — | not implemented |
| `EMBED-002` | GitHub and GitLab embeds | target | missing | `src/core/features/connectors/github.ts` | not implemented |
| `EMBED-003` | Design, video and document embeds | target | partial | `tests/flagship/content/preview.test.ts` | see the clause |
| `EMBED-004` | Live file cards from Drive, SharePoint and Chest | target | missing | — | not implemented |
| `EMBED-005` | Backlinks on Jira and Vector issues | target | missing | — | not implemented |
| `EMBED-006` | Jira links to migrated Confluence pages are re-pointed at cutover | target | missing | — | not implemented |
| `EMBED-007` | Issues that link here | target | missing | — | not implemented |
| `EMBED-008` | Slate for Jira: smart links and project pages | target | missing | — | not implemented |
| `CHAT-001` | Chat notifications to Slack, Microsoft Teams and Nook | target | partial | `src/core/features/notifications/slack.ts` | see the clause |
| `CHAT-002` | Ask and unfurl in chat | target | missing | `src/core/features/connectors/slack.ts` | not implemented |
| `CHAT-003` | Capture chat into pages | target | missing | — | not implemented |
| `CHAT-004` | Personal notifications as chat direct messages | target | missing | — | not implemented |
| `CONNECT-001` | Named connectors | target | partial | `src/core/features/connectors/slack.ts` | see the clause |
| `CONNECT-002` | Source permissions are mirrored | target | partial | `src/core/features/connectors/authority.ts` | see the clause |
| `CONNECT-003` | Connector health | target | partial | `src/core/features/connectors/service.ts` | see the clause |
| `ANSWER-001` | Cited answers in the default product | target | partial | `src/core/features/ai/integration.ts` | see the clause |
| `ANSWER-002` | Answers state their trust | target | partial | `tests/flagship/intelligence/authority.test.ts` | see the clause |
| `ANSWER-003` | Answers never leak restricted knowledge | target | partial | `tests/qualification/authority/skill-disclosure.test.ts` | see the clause |
| `ANSWER-004` | Feedback and unanswered questions | target | missing | — | not implemented |
| `ANSWER-005` | Summaries and catch-up | target | partial | `src/core/features/ai/routes.ts` | see the clause |
| `ANSWER-006` | Owner-chosen models and data controls | target | partial | `src/core/features/ai/integration.ts` | see the clause |
| `API-001` | Public REST API | target | partial | `src/core/features/pages/routes.ts` | see the clause |
| `API-002` | Webhooks | target | missing | — | not implemented |
| `API-003` | MCP server | target | partial | `src/core/features/external-agent/routes.ts` | see the clause |
| `API-004` | App and token administration | target | missing | — | not implemented |
| `API-005` | Zapier, Make and Crank apps | target | missing | — | not implemented |
| `ADMIN-001` | SAML single sign-on | target | partial | `src/core/features/session/native/` | see the clause |
| `ADMIN-002` | SCIM provisioning | target | missing | — | not implemented |
| `ADMIN-003` | Guest management | target | partial | `src/core/features/workspace/invitations.ts` | see the clause |
| `ADMIN-004` | Workspace analytics | target | partial | `src/core/features/analytics/` | see the clause |
| `ADMIN-005` | Audit export and SIEM streaming | target | partial | `src/core/features/activity/service.ts` | see the clause |
| `ADMIN-006` | Content governance | target | partial | `tests/qualification/policies/access-publication.test.ts` | see the clause |
| `ADMIN-007` | Every target surface ships in the default product | target | partial | `src/core/platform/config/launch-profile.ts` | see the clause |
| `MOBILE-001` | Native iOS and Android apps | target | missing | `tests/qualification/interface/routed.browser.mjs` | not implemented |
| `MOBILE-002` | Desktop app | target | missing | — | not implemented |
| `MOBILE-003` | Offline pages | target | partial | `src/core/features/editor/ui/SaveStatus.tsx` | see the clause |
| `MOBILE-004` | Push notifications | target | missing | — | not implemented |
| `KEEP-001` | Contradiction watch | target | partial | `src/core/features/impact/routes.ts` | see the clause |
| `KEEP-002` | Revision-specific fix proposals | target | partial | `src/core/features/suggestions/routes.ts` | see the clause |
| `KEEP-003` | Close knowledge gaps as work | target | missing | — | not implemented |
| `KEEP-004` | Duplicates and conflicts | target | partial | `src/core/features/claims/service.ts` | see the clause |
| `KEEP-005` | Answers with current evidence and stated uncertainty | target | partial | `tests/flagship/intelligence/authority.test.ts` | see the clause |
| `KEEP-006` | Checked runbooks | target | partial | `src/core/features/skills/routes.ts` | see the clause |
| `KEEP-007` | Onboarding paths | target | missing | — | not implemented |
| `KEEP-008` | Stale-knowledge sweeps | target | partial | `src/core/features/notifications/events.ts` | see the clause |
| `KEEP-009` | Measured knowledge health | target | partial | `tests/qualification/core/quality.test.ts` | see the clause |
| `KEEP-010` | Team-built agents | target | partial | `tests/qualification/inquiry/routing.test.ts` | see the clause |
