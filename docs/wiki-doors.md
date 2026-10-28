# Wiki doors and representations

These protocol and representation details accompany the capabilities in CONTRACT.md.

## HOME-001 — Installed workspace lobby

An installed Slate answers its public root path (`/`) with the shared Lobby (Base `lobbyResponse`): Slate's card mark and name, one line naming the owner's deployment, and one action, Finish setup (to `/setup`) until the owner has finished first-run setup (`WORK-013`) and Sign in (to `/signin`) after, over Slate's floor art; Base's `GET /setup/state` answers exactly `{"state":"unclaimed"}` or `{"state":"claimed"}` from the same reading. The Lobby and `/setup/state` reveal only that state: they read no other workspace record, member identity or session, set no cookie, run no script, load only same-origin files, answer another origin or Host with the ordinary `404`, are rendered per request and send `no-store`. The product's static landing page is the run site's homepage (`run-slate.com/`), written by `rer build --site` from the edition's own source and configuration with no installation data. Its header and footer carry the configured owner name beside Slate's card logo, the same card mark the sign-in page and the app show beside the owner's name and the deployment serves from its own origin as its favicon (an SVG with PNG fallbacks and an apple-touch icon), the name being the page's only top-level heading, and the footer shows the owner's one-line description. The body is a fixed, owner-editable description of the product in one illustrated style: a hero that says what Slate is, then a section each for open source under the MIT license, pages, databases, search that respects who is asking, sharing and publishing, revision history, the other core-wiki capabilities (comments, templates, verification, inbox, containers, backup and restore) and moving in from another wiki, and a closing call to action. "Run Slate" in the hero and in the closing call to action opens the run site's Run page at `/run` (install rer, then clone the public source and start it with `rer dev`); a Docs link in its header and footer and a "Read the guide" link open `/docs`, and "Read the setup guide" opens `/docs/install` (the run site carries the same first-party pages as `DOCS-001`); and it links to the source repository. The landing links only to those targets, the source repository and, while the credit toggle is on, the credit, and never to an instance-only route (sign-in, setup, the app or its API). It describes only capabilities the default `core-wiki` profile ships. It may show a static “Powered by Slate · runeditrun.com” link when the buyer-configured credit toggle is on, which is its default. The landing exposes no workspace records or member identity and shows no metrics, testimonials, customer logos, plans or prices (it may say only that there is no per-seat pricing). It sets no cookies and runs no analytics or tracking; every font, style and image is served from the run site's own origin and every illustration, with the sample names and pages in its drawings, is drawn inline, so it loads no third-party resource. It stays readable without scripts and with reduced motion, and keeps its own fixed light palette in a dark-themed browser. Pages published to the anonymous web are served under the published-page prefix and are governed by `WEB-001` to `WEB-007`; the root never lists them.

## HOME-002 — Run-site product landing

An installed Slate answers its public root path (`/`) with the shared Lobby (Base `lobbyResponse`): Slate's card mark and name, one line naming the owner's deployment, and one action, Finish setup (to `/setup`) until the owner has finished first-run setup (`WORK-013`) and Sign in (to `/signin`) after, over Slate's floor art; Base's `GET /setup/state` answers exactly `{"state":"unclaimed"}` or `{"state":"claimed"}` from the same reading. The Lobby and `/setup/state` reveal only that state: they read no other workspace record, member identity or session, set no cookie, run no script, load only same-origin files, answer another origin or Host with the ordinary `404`, are rendered per request and send `no-store`. The product's static landing page is the run site's homepage (`run-slate.com/`), written by `rer build --site` from the edition's own source and configuration with no installation data. Its header and footer carry the configured owner name beside Slate's card logo, the same card mark the sign-in page and the app show beside the owner's name and the deployment serves from its own origin as its favicon (an SVG with PNG fallbacks and an apple-touch icon), the name being the page's only top-level heading, and the footer shows the owner's one-line description. The body is a fixed, owner-editable description of the product in one illustrated style: a hero that says what Slate is, then a section each for open source under the MIT license, pages, databases, search that respects who is asking, sharing and publishing, revision history, the other core-wiki capabilities (comments, templates, verification, inbox, containers, backup and restore) and moving in from another wiki, and a closing call to action. "Run Slate" in the hero and in the closing call to action opens the run site's Run page at `/run` (install rer, then clone the public source and start it with `rer dev`); a Docs link in its header and footer and a "Read the guide" link open `/docs`, and "Read the setup guide" opens `/docs/install` (the run site carries the same first-party pages as `DOCS-001`); and it links to the source repository. The landing links only to those targets, the source repository and, while the credit toggle is on, the credit, and never to an instance-only route (sign-in, setup, the app or its API). It describes only capabilities the default `core-wiki` profile ships. It may show a static “Powered by Slate · runeditrun.com” link when the buyer-configured credit toggle is on, which is its default. The landing exposes no workspace records or member identity and shows no metrics, testimonials, customer logos, plans or prices (it may say only that there is no per-seat pricing). It sets no cookies and runs no analytics or tracking; every font, style and image is served from the run site's own origin and every illustration, with the sample names and pages in its drawings, is drawn inline, so it loads no third-party resource. It stays readable without scripts and with reduced motion, and keeps its own fixed light palette in a dark-themed browser. Pages published to the anonymous web are served under the published-page prefix and are governed by `WEB-001` to `WEB-007`; the root never lists them.

## DOCS-001 — Public documentation

The public paths `/docs` and `/docs/<slug>` serve Slate's first-party documentation: the Markdown files that `docs/site.json` lists as published, in the sections and order it gives, which is the only navigation. The documentation Markdown is rendered to HTML at build time: a Vite plugin renders each page to static HTML when Vite loads it, in a build and in development, and never in the Worker or the browser: the emitted Worker and client bundles contain no Markdown or syntax-highlighting code, and each page is its own lazily loaded chunk that the Worker renders per request inside the landing's own header, footer, paper, ink and typeface. A page has its title as its one top-level heading (the landing's brand heading is not repeated), a section menu, an on-this-page list, previous and next links, tables in labeled scrollable regions and an Edit-on-GitHub link. Every Markdown file at the repository root, under `docs/` and as a top-level `<directory>/README.md` is either published or listed in the manifest as GitHub-only with a reason, and an unlisted file, a broken link or anchor, raw HTML, an image outside `docs/media/` or an absolute build-machine path fails verification or the build. Published pages describe only the default `core-wiki` profile, contain no maintainer-only material, and never advertise a flagship-only surface. The documentation reads no workspace record, member identity or session, sets no cookie, runs no analytics or tracking and loads only same-origin resources. An unknown, miscased or nested slug answers the branded `404`, a misconfigured deployment answers `/docs` with the same `503` as the landing, and `/docs` shares the landing's public-document rate limit.

## WORK-013 — First run

An owner claimed through RER’s verified bootstrap or signed claim receives the configured deployment name, a General space and a Welcome page atomically, with first run complete; the name, space and page remain editable. RER currently does not convey its independently renamed app name. A local deployment runs a short wizard that names the workspace, creates the first container and its first page, and ends on an invitation step that can be skipped. It runs once, is never shown to a member who joins later, and creates nothing beyond those three records. Its native owner wizard lives at `/setup`: unfinished owners are redirected there from operator app routes after sign-in; completed setup and later members proceed to `/app`. The same native session and owner authorization guard the route and completion API.

## BLOCK-003 — The insert menu

Typing `/` at the cursor opens an insert menu grouped by kind, filtered by what is typed, navigable and selectable by keyboard alone, and it inserts at the cursor without leaving the editor. Every block type this contract names is reachable from it, and on a touch client the same list is reachable from a labeled control above the keyboard.

## REV-001 — What a revision is

Every page, record, container, comment, template and decision record (`DEC-001`) carries a revision identifier that changes on every committed edit and is never reused. A page revision is immutable: it holds the body and properties as committed, its author, its time, its origin of `autosave` or `publish`, and a content hash, being SHA-256 of the revision's extracted text after Unicode NFC normalization and whitespace collapse. A retried write whose hash matches the latest revision commits nothing. Wherever another clause names a revision, it means this identifier.

## NOTIF-003 — Chat notifications

A workspace owner can connect one chat destination through `chat.notifier.v1` and choose which events reach it. A message carries the event, the actor, the page title and a link, never the page body, and the link still requires access. The connection shows its last delivery and its last failure, retries only transient transport failures, and stops sending the moment it is disconnected; its credential is encrypted with `CONNECTOR_CREDENTIALS_KEY`, returned by no API response, and destroyed on disconnect. A deployment with a chat destination connected and that variable missing fails at startup naming it (`BASE-SECRET-002`) rather than running with the connection off. An expired or revoked authorization marks the connection as needing attention, offers a reconnect action, and stops sending without deleting the connection, its event selection or its delivery history. A Slack destination is one private channel that is not shared with another Slack workspace or organization. Every person in it, apart from deactivated Slack accounts, must have a Slack email that matches an active member of the workspace, and no bot other than the one sending the messages may be in it. Slate refuses to connect a channel that fails this, rechecks it before every send and sends nothing while it fails, and sends a message about an event only when every such person can read what the event links to immediately before sending. In the default `core-wiki` profile the workspace owner can connect a Slack destination by supplying a Slack bot token, with no `CONNECT-001` source connection needed; a destination authorized any other way, such as through a connected Slack source identity, meets every rule in this clause. Target (16 October 2026): `CHAT-001` extends this to any number of Slack, Microsoft Teams and Nook destinations with the same guarantees.

## MAIL-002 — Delivery failure

A send that fails is retried up to 3 times over 5 minutes when the provider guarantees duplicate suppression for that exact request. With SendGrid, explicit rejection is shown for owner retry; ambiguous transport, expired dispatch ownership, or acceptance without a receipt is durably held for provider review with no automatic or explicit blind resend. A send that still fails or remains uncertain is recorded with a safe provider error and shown to a person — on the sign-in screen for a sign-in link, in settings for an invitation — and is never reported as sent. Managed hosting uses Base’s `rer` adapter with RER-assigned `MAIL_PROVIDER`, `MAIL_FROM`, `MAIL_RELAY_URL` and private `MAIL_API_KEY`; no provider account is needed. Relay HTTP 202 establishes acceptance without a provider message ID. Explicit relay throttling is queued within the existing three-attempt budget, no earlier than Retry-After; other relay rejections are visible failures. Ambiguous relay sends and expired dispatch ownership are held for review without blind resend. A provider receipt establishes acceptance, not inbox delivery.

## IMP-001 — Import jobs

An import is idempotent by operation key (`SAVE-005`), retains its exact supplied original, and names every physical page, database, record, file and version created and every construct it did not map. Notion workspace and Confluence space jobs first show a durable Preview with would-create counts, the complete paged loss report, reviewed principal mappings and measured canonical plan size; Preview creates no target tree. Explicit Apply uses that exact review and commits bounded batches with durable journals. Preparing, Running and Indexing progress survives reload and resumes from its committed checkpoint. Incomplete trees stay inaccessible through all native reads and mutations; the whole native tree becomes visible atomically. Completed requires `PORT-004`. Undo is available after partial or completed Apply: it removes independent unchanged creations, preserves native edits, additions and their required dependencies, and reports each retained conflict as `NATIVE_EDIT_CONFLICT`. Preparation can be canceled without publishing a tree. Failed document imports roll back; interrupted reviewed space imports retain an inaccessible, resumable checkpoint. The original remains downloadable until explicitly deleted or invalidated by privacy erasure. Erasing any imported source under `ARCH-006` invalidates the indivisible retained original and all import recovery custody, makes retry, resume and Undo unavailable with a plain reason, and leaves unaffected native pages in place.

## PORT-005 — Access boundary

An export excludes sessions, sign-in links, pending invitations, stored operation-key responses and provider secrets. An import activates only the member named by `SETUP_OWNER_EMAIL`; every other imported member is an inactive historical actor until invited, and no imported page is published to the anonymous web until a member publishes it.

## SUG-001 — Anchored suggestions

Members with comment or edit access can propose a typed change as a separate record anchored to an exact page/block revision, inspect its diff and discuss it. A suggestion changes neither working page/block content nor published content before explicit acceptance under `SUG-002`. Preserve author, time, original text and exact revision; inaccessible anchors disclose no content. Direct granted maintenance remains a separate attributable revision path under `AI-003`/`AI-005`, not suggestion acceptance or a forced review queue.

## PAGE-015 — Page lock

**Requirement.** A member with `edit` access can lock a page against accidental edits. Locking is separate from permissions: it changes no grant. A locked page shows a "Locked by name" banner and opens read-only for everyone, and an `edit` member unlocks it in one action. Both acts are recorded in activity. API calls, automations, imports and AI runs respect the lock and refuse with `PAGE_LOCKED`. Comments stay open.

## BLOCK-015 — Assigned tasks with due dates

**Requirement.** A task item (`BLOCK-007`) can carry one assignee and a due date. Typing `@` inside a task assigns the member mentioned, and typing `//` or choosing from the date picker sets the due date, which renders in the reader's locale and shows as overdue once it passes. The assignee gets one inbox item when assigned (`NOTIF-001`), by email or push under their delivery settings (`NOTIF-005`, `NOTIF-006`), and one reminder on the due date (`NOTIF-004`). Reassigning notifies the new assignee once and the previous assignee not at all, and an assignee completing their own task notifies no one. Assigning a member who cannot read the page asks the assigner to share the page with them or cancel, and never notifies that member. Completion still records who and when. Tasks are read and changed through the API and MCP (`API-001`, `API-003`) under the same checks. A task item stays a block, and it still never appears in a database view.

## BLOCK-018 — Status labels

**Requirement.** An inline status label is a short colored lozenge with text, in gray, blue, green, yellow, red or purple, inserted from the block menu or by typing `/status`. Screen readers and search read it as text. It survives export, as text with its color name in Markdown and as a styled span in HTML, and Confluence's Status macro imports as this label with its color (`IMP-010`). It is separate from a page's status (`STAT-*`).

## SEARCH-014 — Old Confluence URLs find their Slate record

**Requirement.** Wherever a member can paste a URL, an old Confluence URL that `IMP-013` recognizes resolves to its imported record:

- **Search.** Pasting the URL into global search (`SEARCH-001`) returns the record as the first result. A record the member cannot read is returned as `LINK-004`'s access-needed result, with no title, snippet or author, and an unmapped URL returns one "Not migrated" result naming the source space key.
- **Link field.** Pasting the URL into the editor's link field links to the record's permanent URL and shows its current title (`LINK-003`).
- **Page body.** Pasting the URL into a page body inserts a link to the record, not a link card to the old site. One undo restores the URL as pasted.
- **API and MCP.** `GET /api/v1/resolve?url=` and the MCP `resolve` tool (`API-001`, `API-003`) return the record's ID and URL to a token or client acting as a member who can read it, the access-needed result otherwise, and `not_migrated` for an unmapped URL.

## STAT-007 — Verification rules

**Requirement.** Container owners configure nightly rules that flag or unverify, never verify. Examples: unverify a page when a page or source it cites changes, flag pages with no owner, and flag verified pages unviewed for 180 days. Each run records what it changed and why in activity, notifies affected owners once in a coalesced notice, and can be previewed before it is turned on. No rule, automation or AI action renews verification (`STAT-004`).

What the rules mean (each container has the three rules, all off by default):

- **Who configures.** A container's owners, through the same authorization as the container's settings; a workspace owner owns every non-personal container (`WORK-008`). Anyone else is refused.
- **Actions.** A rule's action is `unverify` or `flag` and is fixed by its kind: `cited-changed` unverifies, `no-owner` and `unviewed` flag. Any other action, "verify" first of all, is refused with a 400 problem before anything is stored.
- **Unverify** ends the page's latest verification as lapsed: the run moves that verification's expiry to the run time (never later, so it never extends one), and the one shared definition of current, changed and lapsed (`STAT-003`, `STAT-004`) then reads it lapsed in the page, the review list, search, content queries, AI answers, exports and publishing. It writes no verification row and sets no status; the original verification (verifier, revision, time) stays in history and its previous expiry is kept in the activity entry. In the same batch it marks the `STAT-004` lapse notice sent, so the owner gets the run's one notice and no second lapse notice.
- **Cites.** A page cites another page when its body links to or mentions that page, by the same link scan as the page's backlinks. `cited-changed` fires when a cited page (not deleted or trashed) has a working revision created after the citing page's latest verification, and that verification still reads current.
- **No owner.** The page's owner is unset or names a member who is no longer active. It applies to every live page of the container, verified or not.
- **Unviewed.** No page view in the last N days (180 by default, 1 to 3650) while the page's verification reads current.
- **A flag** is a marker on the page's status panel and in the container's rules panel. It is not verification and does not change search ranking or any trust badge. It is removed when its condition clears; the page's owner or a container owner can dismiss it, and a dismissed flag stays dismissed while its condition holds.
- **Nightly, exactly once.** The run is part of the Worker's own schedule in every profile. Each rule runs once per UTC night, with a durable receipt per rule and night; concurrent cron or queue invocations and a restart produce one run's effects. A rule turned on runs from the next night, never the night it is turned on.
- **Recorded.** Each changed page (unverified, or newly flagged) gets one activity entry with the system as actor, naming the rule and why (the cited pages, the missing owner, the days unviewed) and never page text; it shows only to members who can read the page.
- **One notice.** Each affected owner (the page's owner while an active member, else the container's owners) gets exactly one `verification-rules` inbox item per run, with counts and page titles only for pages that recipient can read.
- **Preview** runs the same selection and writes nothing; pages the previewer cannot read are counted, not named. The rules panel offers it before a rule is turned on and for a rule already on.

"A source it cites" has no block kind in the default product: connected sources are flagship-only. Every existing capability (a cited page) conforms now, and the obligation is inherited: when `SOURCE-003` (scoped claims) and `SOURCE-004` (live observations) ship, a change to a source that a page cites unverifies that page through this same `cited-changed` rule.

## CARD-002 — Browser extension

**Requirement.** A Chrome and Edge extension signs in as the member and searches and asks Slate from any tab. On sites the owner allowlists, such as Salesforce, Zendesk, HappyToHelp, Orbit and GitHub, it suggests cards relevant to the open record. It reads page text only after the member opens the extension on that tab, sends only the query and the record title, and shows only what the member can read.

After a Confluence cutover, a workspace owner lists the old Confluence hostnames (`IMP-013`). The extension then redirects the member's navigation to a Confluence path on those hosts (`/wiki/*`, and `/display/*`, `/x/*`, `/pages/*`, `/spaces/*` and `/download/*` on a Server or Data Center hostname) to Slate's resolver, using a browser redirect rule. It holds no map, reads nothing from the old page and leaves every other path on the host, such as Jira's `/browse/*` on the same `atlassian.net` site, untouched. A member can switch the redirect off. IT can force-install the extension, with the old hostnames preset, on managed Chrome and Edge browsers through enterprise policy.

## AUTO-006 — Outbound automation actions

**Requirement.** Rule actions (`AUTO-001`) can also:

- post to a Slack, Microsoft Teams or Nook channel;
- call a signed webhook (`API-002`);
- send an email from a member's own connected Gmail or Outlook mailbox under that member's OAuth grant, never from Slate's sender (`MAIL-001`);
- create a Vector or Jira issue, with a backlink to the page (`EMBED-005`).

Each action acts as the rule's actor (`AUTO-002`), sends only titles, links and fields the actor can read, uses an operation key so retries never duplicate, and records its receipt in the run log (`AUTO-003`).

## IMP-007 — Confluence Cloud live migration

**Requirement.** Through the Confluence Cloud REST API (OAuth), Slate imports one or more spaces using `IMP-016`'s reviewed principal mapping. It carries:

- pages with every version, each with its mapped author and time;
- blog posts as posts with their original dates and authors (`CONT-010`);
- footer comments with their replies, and inline comments anchored to the same text, each with its author, time and open or resolved state;
- attachments with every version (`BLOCK-022`), with their text searchable (`SEARCH-013`);
- labels (`PAGE-001`, `SEARCH-010`);
- page restrictions, space permissions (`IMP-011`) and personal spaces (`IMP-012`).

Macros, diagrams and tasks with their assignees and due dates map as `IMP-010` names. It can re-sync deltas until cutover. A delta adds exactly what changed since the last pass, keyed by source ID and version, and never duplicates a page, version, comment or attachment. Its redirect map, from every old Confluence URL to its Slate record, is kept in Slate and served by Slate itself (`IMP-013`), so a buyer whose site lives on `atlassian.net`, where only Confluence Premium offers a custom domain, needs no host of its own. Links into spaces imported in later passes are back-filled (`IMP-014`). The cutover report lists what changed since the first pass, every link in Slate that still points at the old site (`IMP-014`), the old URLs requested since cutover that map to nothing (`IMP-013`), and the changes made by the Jira re-pointing step (`EMBED-006`).

## IMP-013 — Old Confluence links resolve in Slate

**Requirement.** Every Confluence import, by file (`IMP-003`) or by API (`IMP-007`), keeps a link map in Slate from each imported space, page, blog post, attachment and comment to its Slate record. The map is keyed by source site and source ID, and keeps every title a page or post has had as an alias. Slate recognizes these old URL forms, on an `atlassian.net/wiki` site and on a Server or Data Center base URL:

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

## PORT-009 — Scheduled backups to the buyer's storage

**Requirement.** An owner can schedule a nightly or weekly complete export (`PORT-001`) to the buyer's own S3-compatible bucket or Cloudflare R2, with a retention count, failure notices to owners, and a restore drill that restores the latest backup into an empty deployment (`PORT-002`). [Chest](https://github.com/just-every/run-chest) inherits this destination contract when it publishes an intake; it is not a destination kind today. Failure notices are in-app; email notices inherit `NOTIF-005`.

Only an owner with a fresh sign-in proof configures or removes a destination. The same proof gates credential replacement, which keeps the schedule and run history. Credentials are encrypted with `CONNECTOR_CREDENTIALS_KEY`, returned by no API and excluded from archives; removal destroys them. Nightly and weekly schedules use UTC. A durable destination/period receipt admits one run even under concurrent invocation or restart; an interrupted run is recorded as a failure rather than uploaded twice. A complete ZIP is streamed in bounded parts, then uploaded and checked by size and SHA-256 readback before retention removes any exact key written by this feature. An incomplete export scope produces a recorded failure and no partial external object. A failed run sends each active owner one in-app notice; a later success clears the current failure while preserving history. Restore requires an empty separate deployment and renewed credentials. The source action validates the latest archive and supplies a report and instructions; it does not claim that the separate restore has already completed.

## PORT-010 — Word export of a page

**Requirement.** A member can export one page, or a page with its descendants, as one Word `.docx` file. It carries headings, bulleted, numbered and toggle lists, tasks with their checked state, assignee and due date, tables with horizontal and vertical merged cells, code, callouts, images with their alt text, equations, diagrams as images and links: links to other exported pages resolve inside the document, and other links point to their Slate URLs. A table of contents (`BLOCK-017`) exports as a linked list. Comments can be included as Word comments, retaining authors, times, replies and resolved state under `PORT-008`'s authorization rules. The file carries only what the exporting member can read: an unreadable descendant contributes no content, title, count or placeholder. Access is rechecked before the export is returned. Re-importing under `IMP-005` reproduces headings, tables including merged cells, and images with their alt text.

Every string is XML-escaped. The document contains no macros and no external relationships except hyperlinks to Slate URLs; image bytes come only from files the exporting member can read. The not-yet-implemented equation and diagram blocks inherit these Word obligations in their own clauses and acceptance: `BLOCK-013` carries equations as OMML or images and Mermaid diagrams as images; `BLOCK-019` carries diagrams.net previews as images. Their absence does not invent an export representation or establish those clauses as implemented.

## CHAT-001 — Chat notifications to Slack, Microsoft Teams and Nook

**Requirement.** Workspace and container owners connect any number of channels in Slack, Microsoft Teams or [Nook](https://github.com/just-every/run-nook), each with its own event selection: published or updated pages, new comments, blog posts, review requests and lapsed verifications in the container. `NOTIF-003`'s guarantees apply to every destination: link-only messages, access-checked links, encrypted credentials returned by no API response and destroyed on disconnect, startup refusal naming `CONNECTOR_CREDENTIALS_KEY` when any destination is connected and that key is missing, delivery and failure state, transient-only retry, and stopping on disconnect. Expired or revoked authorization marks that destination as needing attention, offers reconnect and stops sending to it while retaining the destination, its event selection and its delivery history. Every Slack destination, however it is authorized, also meets `NOTIF-007`'s Slack channel and audience rules. Every Teams and Nook destination meets the same rule in its provider's terms: a channel whose full roster Slate can read and only admitted members change (Teams private team or private channel, Nook private channel), not shared with another organization (`NOOK-031`), with no guest, external account or bot but Slate's, and every person an active Slate member by verified email who can read the linked record immediately before sending; Slate refuses it at connect, rechecks before every send and sends nothing while it fails. Slack connects as an OAuth app a workspace admin installs; Teams as an app package an Entra admin consents to with resource-specific channel permissions; Nook through `NOOK-080`. Slate honours each provider's rate limit and `Retry-After` without loss, and coalesces more than five events per destination per minute into one message. Later events on the same page within 24 hours reply in its first message's thread. Each destination chooses immediate or daily digest. When a page is deleted, moves beyond the channel's audience or its actor is erased (`WORK-007`), Slate edits every message it sent about it to "Restricted Slate page".

## CHAT-002 — Ask and unfurl in chat

**Requirement.** In Slack, Teams and Nook:

- a Slate page link unfurls with its title, status and verification, owner and last update, but only when the unfurling user's linked Slate identity can read the page; otherwise it shows "Restricted Slate page";
- `/slate` or a mention asks a question and gets a cited answer (`ANSWER-001`) computed for the asker alone, posted only to the asker when the channel's audience is broader than the sources' readers.

A member links their chat identity to Slate once, from Slate or from the app's first prompt in chat. The same link delivers their personal notifications (`CHAT-004`).

## CHAT-004 — Personal notifications as chat direct messages

**Requirement.** A member who has linked their Slack, Microsoft Teams or Nook identity (`CHAT-002`) can choose "chat direct message" as the delivery for any event kind (`NOTIF-005`). A workspace owner can make it the default for any event kind (`NOTIF-006`). The Slate app then sends that member one direct message per event, for each of these kinds:

- mentions, including group mentions (`BLOCK-020`);
- replies, and comments on watched or authored pages;
- task assignments and due tasks (`BLOCK-015`);
- reminders (`NOTIF-004`), at the member's local time and once each;
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

## ANSWER-001 — Cited answers in the default product

**Requirement.** Once an owner configures a provider and turns AI on (`AI-001`), every member gets Ask: a box above search results and a side panel on any page. It answers from pages, records, comments and connected items the asker can read, with inline citations that open the exact revision (`AI-004`, `REV-005`). It keeps the conversation: a follow-up question is answered in the context of the earlier turns, each answer offers up to three suggested follow-ups, and the member's past conversations are listed privately to them, can be reopened and continued, and can be deleted. Every turn recomputes access, so a follow-up never cites a page the asker has since lost. This needs no `SLATE_PROFILE=flagship` opt-in, and every `AI-*` guarantee applies.

## API-001 — Public REST API

**Requirement.** A versioned `/api/v1` covers pages, blocks, databases, records, comments, search, members, groups and files, described by a published OpenAPI document. It uses cursor pagination, operation keys (`SAVE-005`), declared rate limits and a stable error shape. Authentication is a personal access token or an OAuth 2.0 app with scopes (read or write, per container). Every call acts as exactly one member and passes the same checks as the UI (`SHARE-002`, `LIFE-002`, `SEARCH-005`). Tasks (`BLOCK-015`) are read and changed through it, with their assignee, due date and completion, under the same checks and notifications as the UI: assigning a member who cannot read the page is refused until it is shared, and completion records who and when.

## API-002 — Webhooks

**Requirement.** Owners and OAuth apps subscribe to page, record, comment, status, verification and member events by container. Deliveries are HMAC-signed with a timestamp, retried with backoff for 24 hours, logged with their responses, replayable, and disabled with a notice after repeated failure. Payloads carry IDs and titles only when the subscription's acting member can read the record.

## API-004 — App and token administration

**Requirement.** Owners see every personal access token, OAuth app, MCP client and webhook, with its member, scopes, creation time and last use, and can revoke any of them. Members see and revoke their own. Tokens expire after a default of 90 days. Revocation takes effect on the next request, and every grant and revocation is recorded in activity.

## API-005 — Zapier, Make and Crank apps

**Requirement.** Slate publishes an app in the Zapier app directory and one in Make's app directory, and ships a [Crank](https://github.com/just-every/run-crank) connector. Each one connects to the buyer's own deployment by URL through `API-001`'s OAuth app flow and acts as the connecting member.

- **Triggers** use `API-002` webhooks (REST hooks), never polling where a webhook exists. They cover a page published or updated, a comment added, a record created or updated, a verification lapsed, a review requested and a form submitted (`DB-013`).
- **Actions** create a page from a template, append to a page, create or update a record, add a comment, request review and search.
- **Access.** A trigger never fires for a record the connecting member cannot read, and an action passes the same checks as the UI.
- **Revocation.** Revoking the app under `API-004` stops its triggers and actions on the next request.

## ADMIN-001 — SAML single sign-on

**Requirement.** Slate is a SAML 2.0 service provider for Okta, Microsoft Entra ID, Google Workspace, JumpCloud and [Auth](https://github.com/just-every/run-auth). It supports both SP- and IdP-initiated sign-in, signed assertions, an email domain verified by a DNS TXT record the owner publishes (rechecked daily; a failed check stops new just-in-time creation and notifies owners) and just-in-time creation of invited or allow-listed members. When an owner enforces SSO, members sign in only through the provider, guests keep magic links, and one designated owner keeps a magic-link break-glass path. Slate's OIDC identity-provider function (WORK-015) stays available to members who have signed in through the enforced method.

## ADMIN-007 — Every target surface ships in the default product

**Requirement.** Every surface that a target or push-further clause describes is part of the default product, and an owner turns it on in workspace settings with nothing else needed. Ask, AI writing and AI fields turn on once a provider is configured and AI is on (`AI-001`, `ANSWER-006`). Suggestions and agent maintenance (`SUG-*`, `KEEP-*`) turn on with AI. Each connector turns on once it is connected (`CONNECT-001`), and chat ask and unfurl once the chat app is installed (`CHAT-002`). MCP and OAuth clients work once a member grants them (`API-003`, `API-004`), and live co-editing is on from the start (`COLLAB-001`). No target surface requires `SLATE_PROFILE=flagship`. Settings show each switch's state and who changed it when, and every change is recorded in activity. Turning a switch off refuses its surface with `FEATURE_DISABLED` from the next request and stops its scheduled jobs, and it erases nothing. A surface also stays refused until its clause's own safety acceptance has passed: `ANSWER-003` for answers, `CONNECT-002` for connected items and `COLLAB-001`'s revocation test for co-editing. `SLATE_PROFILE=flagship` remains only for the inquiry, experiment, trial and production-effect extension (`INQ-*`, `TRIAL-*`, `EFFECT-002`).
