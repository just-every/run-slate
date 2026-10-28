<!-- Generated from CONTRACT.md by contract-docs. Edit CONTRACT.md, then regenerate. -->

# Accept a CONTRACT.md — Slate installation

The primary journey: Exercise the capabilities and acceptance journeys below.

## Progress

| Tier | Done | Partial | Missing | Total |
| --- | ---: | ---: | ---: | ---: |
| Core | 59 | 233 | 34 | 326 |
| Agent surface | 0 | 0 | 0 | 0 |
| Later | 0 | 0 | 0 | 0 |
| Full target | 59 | 233 | 34 | 326 |

Judged from the code and tests at commit `23c59bb2dcdd4b6df2499f350b3bc624bc14feee` (25 October 2026). Field proof register: 0 rows; 0 passed, 0 failed, 0 not run.

## Core

### Public landing

#### HOME-001 — Public landing

Core · published · **done**

**Requirement.** An installed Slate answers its public root path (`/`) with the shared Lobby (Base `lobbyResponse`): Slate's card mark and name, one line naming the owner's deployment, and one action, Finish setup (to `/setup`) until the owner has finished first-run setup (`WORK-013`) and Sign in (to `/signin`) after, over Slate's floor art; Base's `GET /setup/state` answers exactly `{"state":"unclaimed"}` or `{"state":"claimed"}` from the same reading. The Lobby and `/setup/state` reveal only that state: they read no other workspace record, member identity or session, set no cookie, run no script, load only same-origin files, answer another origin or Host with the ordinary `404`, are rendered per request and send `no-store`. The product's static landing page is the run site's homepage (`run-slate.com/`), written by `rer build --site` from the edition's own source and configuration with no installation data. Its header and footer carry the configured owner name beside Slate's card logo, the same card mark the sign-in page and the app show beside the owner's name and the deployment serves from its own origin as its favicon (an SVG with PNG fallbacks and an apple-touch icon), the name being the page's only top-level heading, and the footer shows the owner's one-line description. The body is a fixed, owner-editable description of the product in one illustrated style: a hero that says what Slate is, then a section each for open source under the MIT license, pages, databases, search that respects who is asking, sharing and publishing, revision history, the other core-wiki capabilities (comments, templates, verification, inbox, containers, backup and restore) and moving in from another wiki, and a closing call to action. "Run Slate" in the hero and in the closing call to action opens the run site's Run page at `/run` (install rer, then clone the public source and start it with `rer dev`); a Docs link in its header and footer and a "Read the guide" link open `/docs`, and "Read the setup guide" opens `/docs/install` (the run site carries the same first-party pages as `DOCS-001`); and it links to the source repository. The landing links only to those targets, the source repository and, while the credit toggle is on, the credit, and never to an instance-only route (sign-in, setup, the app or its API). It describes only capabilities the default `core-wiki` profile ships. It may show a static “Powered by Slate · runeditrun.com” link when the buyer-configured credit toggle is on, which is its default. The landing exposes no workspace records or member identity and shows no metrics, testimonials, customer logos, plans or prices (it may say only that there is no per-seat pricing). It sets no cookies and runs no analytics or tracking; every font, style and image is served from the run site's own origin and every illustration, with the sample names and pages in its drawings, is drawn inline, so it loads no third-party resource. It stays readable without scripts and with reduced motion, and keeps its own fixed light palette in a dark-themed browser. Pages published to the anonymous web are served under the published-page prefix and are governed by `WEB-001` to `WEB-007`; the root never lists them.

**Evidence.** `tests/e2e/landing-styles.test.mjs` — "landing styles preserve the light palette, same-origin resources and reduced-motion access"
**Gap.** None.

#### DOCS-001 — Public documentation

Core · published · **done**

**Requirement.** The public paths `/docs` and `/docs/<slug>` serve Slate's first-party documentation: the Markdown files that `docs/site.json` lists as published, in the sections and order it gives, which is the only navigation. The documentation Markdown is rendered to HTML at build time: a Vite plugin renders each page to static HTML when Vite loads it, in a build and in development, and never in the Worker or the browser: the emitted Worker and client bundles contain no Markdown or syntax-highlighting code, and each page is its own lazily loaded chunk that the Worker renders per request inside the landing's own header, footer, paper, ink and typeface. A page has its title as its one top-level heading (the landing's brand heading is not repeated), a section menu, an on-this-page list, previous and next links, tables in labeled scrollable regions and an Edit-on-GitHub link. Every Markdown file at the repository root, under `docs/` and as a top-level `<directory>/README.md` is either published or listed in the manifest as GitHub-only with a reason, and an unlisted file, a broken link or anchor, raw HTML, an image outside `docs/media/` or an absolute build-machine path fails verification or the build. Published pages describe only the default `core-wiki` profile, contain no maintainer-only material, and never advertise a flagship-only surface. The documentation reads no workspace record, member identity or session, sets no cookie, runs no analytics or tracking and loads only same-origin resources. An unknown, miscased or nested slug answers the branded `404`, a misconfigured deployment answers `/docs` with the same `503` as the landing, and `/docs` shares the landing's public-document rate limit.

**Evidence.** `tests/e2e/docs.test.ts` — "DOCS-001 public documentation supporting regressions public docs serve declared pages with accessible navigation and refuse unknown routes"
**Gap.** None.

### Workspace and members

#### WORK-001 — One workspace

Core · published · **partial**

**Requirement.** A deployment holds exactly one workspace and every container, page, record and comment belongs to it. Its name and mark are editable in settings and shown in the app header. No interface or endpoint creates a second workspace.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "A deployment holds exactly one workspace and every container, page, record and comment belongs to it."<br>No validated CI-run proof for this acceptance point: "Its name and mark are editable in settings and shown in the app header."<br>No validated CI-run proof for this acceptance point: "No interface or endpoint creates a second workspace."

#### WORK-003 — Member management

Core · published · **partial**

**Requirement.** Members are invited by email address and removed in settings. A workspace owner may invite any person and remove any member other than the setup member; a member may invite and may remove no one. The member created at setup can be removed only by themselves, and `WORK-007` rejects removing the last workspace owner. No policy value, extension, automation or AI action changes any of this.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "Members are invited by email address and removed in settings."<br>No validated CI-run proof for this acceptance point: "A workspace owner may invite any person and remove any member other than the setup member; a member may invite and may remove no one."<br>No validated CI-run proof for this acceptance point: "The member created at setup can be removed only by themselves, and `WORK-007` rejects removing the last workspace owner."<br>No validated CI-run proof for this acceptance point: "No policy value, extension, automation or AI action changes any of this."

#### WORK-006 — Invitations

Core · published · **done**

**Requirement.** An invitation is single-use, can be revoked before it is used, and can no longer be accepted 7 days after it was sent; an expired invitation is retained, not deleted. Requesting an invitation returns the same response whether or not the address already belongs to a member.

**Evidence.** `tests/e2e/local-outbox.node.test.mts` — "native local mail sign-in and invitations preserve identity, delivery and scoped authority"
**Gap.** None.

#### WORK-007 — Removal

Core · published · **partial**

**Requirement.** Removing a member revokes their sessions and unused invitations immediately, removes their personal grants from every page and container, archives their personal container and its pages (`CONT-005`) rather than exposing or deleting them, leaves each page they owned with no owner and offers reassignment in bulk (`CONT-006`), and keeps their name on existing activity until personal-data erasure anonymizes it (`BASE-DATA-003`). Removing the only remaining workspace owner is rejected.

**Evidence.** `tests/qualification/core/identity.mjs`
**Gap.** evidence tests are not loaded by any Verify job or named scheduled job: `tests/qualification/core/identity.mjs`.

#### WORK-008 — Roles

Core · published · **partial**

**Requirement.** A member is a workspace owner or a member. Workspace owners administer the workspace: settings, members, groups, guests, containers they are not in, and the site-wide switches in `CONT-007`. Every other permission comes from a grant on a page or a container (`SHARE-001`, `CONT-009`), never from the role.

**Evidence.** `tests/qualification/core/identity.mjs`
**Gap.** evidence tests are not loaded by any Verify job or named scheduled job: `tests/qualification/core/identity.mjs`.

#### WORK-009 — Groups

Core · published · **partial**

**Requirement.** A workspace owner can create a named group, add and remove members, and use it as a grant principal anywhere a person can be used. Changing a group's membership changes access at once and writes one activity entry, and deleting a group removes its grants without touching the grants of its members.

**Evidence.** `tests/qualification/core/identity.mjs`
**Gap.** evidence tests are not loaded by any Verify job or named scheduled job: `tests/qualification/core/identity.mjs`.

#### WORK-010 — Guests

Core · published · **partial**

**Requirement.** A guest is a person invited to named pages or containers only. A guest is outside the member count and the member list, reaches nothing but what they were granted, and cannot see the container index, the workspace member list, or search results beyond their grants. A container may forbid guests (`CONT-007`).

**Evidence.** `tests/qualification/core/identity.mjs`
**Gap.** evidence tests are not loaded by any Verify job or named scheduled job: `tests/qualification/core/identity.mjs`.

#### WORK-011 — Workspace settings

Core · published · **partial**

**Requirement.** Settings are a shell with its own navigation, holding workspace identity, members, groups, guests, the status vocabulary, published-page and guest switches, connected services, AI, import and export. It is separate from a container's own settings shell (`CONT-004`), and a change in one never silently changes the other.

**Evidence.** `tests/qualification/core/identity.mjs`
**Gap.** evidence tests are not loaded by any Verify job or named scheduled job: `tests/qualification/core/identity.mjs`.

#### WORK-012 — Theme

Core · published · **partial**

**Requirement.** Light, dark and follow-the-system are offered, apply to every operator surface including editors, and persist per member across sessions and devices. The anonymous read view uses the published page's own theme (`WEB-002`), never the reader's member setting.

**Evidence.** `tests/qualification/core/identity.mjs`
**Gap.** evidence tests are not loaded by any Verify job or named scheduled job: `tests/qualification/core/identity.mjs`.

#### WORK-013 — First run

Core · published · **partial**

**Requirement.** An owner claimed through RER’s verified bootstrap or signed claim receives the configured deployment name, a General space and a Welcome page atomically, with first run complete; the name, space and page remain editable. RER currently does not convey its independently renamed app name. A local deployment runs a short wizard that names the workspace, creates the first container and its first page, and ends on an invitation step that can be skipped. It runs once, is never shown to a member who joins later, and creates nothing beyond those three records. Its native owner wizard lives at `/setup`: unfinished owners are redirected there from operator app routes after sign-in; completed setup and later members proceed to `/app`. The same native session and owner authorization guard the route and completion API.

**Evidence.** `tests/qualification/backend/emitted.mjs`
**Gap.** evidence tests are not loaded by any Verify job or named scheduled job: `tests/qualification/backend/emitted.mjs`.

#### WORK-014 — Shortcut reference

Core · published · **partial**

**Requirement.** One reference lists every keyboard shortcut and every typed formatting shortcut the editor accepts, is reachable from anywhere in the operator app by a single shortcut, and matches what the editor actually does.

**Evidence.** `tests/qualification/core/shell.mjs`
**Gap.** evidence tests are not loaded by any Verify job or named scheduled job: `tests/qualification/core/shell.mjs`.

#### WORK-015 — Identity provider

Core · published · **partial**

**Requirement.** Sign-in is by the baseline's magic link (`BASE-ACCESS-001`) and, when a workspace owner configures one, by an identity provider through `identity.provider.v1`. A provider sign-in creates no member who was not invited or allow-listed, and an unconfigured or failing provider leaves magic-link sign-in working and says which is unavailable. There is no password, no security question and no account-recovery path, because `BASE-ACCESS-001` stores no password: access to the mailbox is the credential, and the identity provider is the only alternative to it. A member who has lost their mailbox is re-invited at a new address (`WORK-003`), which is not a recovery flow and does not restore their old sessions. Target (16 October 2026): SAML single sign-on and SCIM provisioning are `ADMIN-001` and `ADMIN-002`.

**Evidence.** `tests/qualification/core/identity.mjs`
**Gap.** evidence tests are not loaded by any Verify job or named scheduled job: `tests/qualification/core/identity.mjs`.

### Editing and saving

#### SAVE-001 — Durable save state

Core · published · **partial**

**Requirement.** An editor shows Saving until the write and its activity entry are committed, then shows Saved within 2 seconds of the commit.

**Evidence.** `tests/qualification/interface/routed.browser.mjs`
**Gap.** evidence tests are not loaded by any Verify job or named scheduled job: `tests/qualification/interface/routed.browser.mjs`.

#### SAVE-002 — Failed writes

Core · published · **done**

**Requirement.** A failed write leaves the editor in a failed state, never Saved. It keeps the unsent value, names the failure, and offers an explicit retry.

**Evidence.** `tests/e2e/saving/failed-writes.test.ts`, `tests/qualification/ui-convergence/failed-save-journey.mjs`
**Gap.** Real validation refusals retain unsent titles, name the failure and require explicit retry; corrected retries persist at 1440 and 390. Existing body transport-loss journey retains and retries unsent blocks.

#### SAVE-003 — Revision conflicts

Core · published · **partial**

**Requirement.** Every edit is submitted with the revision it began from: the block's revision for a body edit, the page's for a title, property, structure or order change. An edit against a superseded revision is rejected with 409, keeps the local draft, and offers compare, reload, or explicit overwrite. Slate never resolves a conflict by last write wins.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "Every edit is submitted with the revision it began from: the block's revision for a body edit, the page's for a title, property, structure or order change."<br>No validated CI-run proof for this acceptance point: "An edit against a superseded revision is rejected with 409, keeps the local draft, and offers compare, reload, or explicit overwrite."<br>No validated CI-run proof for this acceptance point: "Slate never resolves a conflict by last write wins."

#### SAVE-004 — Network loss

Core · published · **partial**

**Requirement.** While the server is unreachable the editor shows Offline and keeps the unsent draft in browser storage as recovery only. A recovered draft is labeled unsaved and never appears in the tree, in lists, in search, or in export as workspace data.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "While the server is unreachable the editor shows Offline and keeps the unsent draft in browser storage as recovery only."<br>No validated CI-run proof for this acceptance point: "A recovered draft is labeled unsaved and never appears in the tree, in lists, in search, or in export as workspace data."

#### SAVE-005 — Operation keys

Core · published · **partial**

**Requirement.** Every mutation accepts an operation key. Repeating a key with the same body within 24 hours returns the first response and creates no second record, notification, AI run, publish, import, or activity entry; repeating it with a different body is rejected with 409.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "Every mutation accepts an operation key."<br>No validated CI-run proof for this acceptance point: "Repeating a key with the same body within 24 hours returns the first response and creates no second record, notification, AI run, publish, import, or activity entry; repeating it with a different body is rejected with 409."

#### SAVE-006 — Concurrent editing and optional co-editing

Core · published · **partial**

**Requirement.** Different blocks can be edited concurrently; revision conflicts retain SAVE-003 and unsent text. Committed blocks refresh within ten seconds without replacing a reader’s unsaved block. A page shows who has it open. Deployments may enable real live co-editing, shared cursors and presence with durable accepted operations, current ACL checks, revocation, reconnect recovery and attributable revision history. Co-editing never silently loses an accepted edit or converts unconfirmed local text into Saved. The full flagship acceptance exercises real co-editing; a deployment may keep it disabled. Target (16 October 2026): live co-editing becomes the default behavior, specified by `COLLAB-001` to `COLLAB-005`.

**Evidence.** `tests/qualification/ui-convergence/two-people-editing.mjs`
**Gap.** live co-editing only under the flagship opt-in; see COLLAB-001

### The page

#### PAGE-001 — What a page is

Core · published · **done**

**Requirement.** A page has an identifier, a title, an optional icon, an optional cover, an owner, contributors, created and updated times, a container, a position in that container's tree, a body (`BLOCK-001`), a lifecycle state (`LIFE-001`), grants (`SHARE-001`), a revision (`REV-001`) and a set of labels. A label is a short text tag, unique on the page, added and removed by anyone with edit access, shown in the page's details (`PAGE-007`), carried through import (`IMP-003`) and through export and re-import (`PORT-001`, `PORT-002`, `PORT-007`), and never discarded; filtering and searching by label is target clause `SEARCH-010`. A database record is a page (`DB-010`), and every comment thread, revision, decision record and public exposure record names exactly one page.

**Evidence.** `tests/e2e/imports/real-exports.test.ts`
**Gap.** None.

#### PAGE-002 — Creation

Core · published · **partial**

**Requirement.** A member with edit access on the destination can create a page blank or from a template (`TMPL-003`), from the tree, from the global create action, or as a child of an open page. It is created in exactly one container at one position, and its initial lifecycle state follows `LIFE-006`.

**Evidence.** `tests/qualification/interface/content.mjs`
**Gap.** evidence tests are not loaded by any Verify job or named scheduled job: `tests/qualification/interface/content.mjs`.

#### PAGE-003 — Identity survives everything

Core · published · **partial**

**Requirement.** A page keeps its identifier for its lifetime. Renaming it, editing it, moving it within or between containers, archiving, trashing, restoring, publishing and unpublishing never change it, and every link, mention, citation, content query and search result continues to resolve to it (`LINK-001`).

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "A page keeps its identifier for its lifetime."<br>No validated CI-run proof for this acceptance point: "Renaming it, editing it, moving it within or between containers, archiving, trashing, restoring, publishing and unpublishing never change it, and every link, mention, citation, content query and search result continues to resolve to it (`LINK-001`)."

#### PAGE-004 — Move

Core · published · **partial**

**Requirement.** A member with edit access on both places can move a page to another position, another parent, or another container, choosing the destination from a searchable picker. Children move with it, grants are re-resolved against the new parent and the change is shown before it is applied, and comments, versions and links are unchanged.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "A member with edit access on both places can move a page to another position, another parent, or another container, choosing the destination from a searchable picker."<br>No validated CI-run proof for this acceptance point: "Children move with it, grants are re-resolved against the new parent and the change is shown before it is applied, and comments, versions and links are unchanged."

#### PAGE-005 — Duplicate

Core · published · **done**

**Requirement.** Duplicating a page copies its title, icon, cover, body and properties into a new page with a new identifier, optionally including its children. It copies no comment, version, watcher, analytics figure, grant beyond the destination's inheritance, or public link.

**Evidence.** `tests/flagship/content/http.test.ts`
**Gap.** None.

#### PAGE-006 — Icon and cover

Core · published · **partial**

**Requirement.** A page takes an icon from emoji, a supplied icon set or an upload, and a cover from a gallery, an upload or a link. Both are removable, both render in the tree and in search results where the surface has room, and neither is required.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "A page takes an icon from emoji, a supplied icon set or an upload, and a cover from a gallery, an upload or a link."<br>No validated CI-run proof for this acceptance point: "Both are removable, both render in the tree and in search results where the surface has room, and neither is required."

#### PAGE-007 — Details

Core · published · **partial**

**Requirement.** A page's details show its owner, creator, contributors, created and updated times, length, status (`STAT-002`), labels (`PAGE-001`), views (`PAGE-013`) and the pages that link to it. A member with `full` access can reassign the owner, which changes no grant and writes one activity entry.

**Evidence.** `tests/qualification/backend/emitted.mjs`
**Gap.** evidence tests are not loaded by any Verify job or named scheduled job: `tests/qualification/backend/emitted.mjs`.

#### PAGE-008 — Favorite

Core · published · **partial**

**Requirement.** A member can favorite a page or a container and unfavorite it. Favorites are personal, are listed in the navigation (`NAV-003`), and are visible to no other member.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "A member can favorite a page or a container and unfavorite it."<br>No validated CI-run proof for this acceptance point: "Favorites are personal, are listed in the navigation (`NAV-003`), and are visible to no other member."

#### PAGE-009 — Watch

Core · published · **done**

**Requirement.** A member can watch a page, and watches it implicitly after commenting on it until they stop. A watched page delivers its comments, replies and published changes to that member's inbox (`NOTIF-001`). Watching is personal and a member's own action never notifies them. Target (16 October 2026): `PAGE-016` also watches a page its creator or editor creates or edits, and `CONT-012` watches a whole container.

**Evidence.** `tests/flagship/discovery/following.test.ts`
**Gap.** None.

#### PAGE-010 — Outline

Core · published · **done**

**Requirement.** A page shows an outline built from its headings that reflects the current body within 2 seconds of an edit, and selecting an entry scrolls to that heading. A page with no headings shows no outline rather than an empty one.

**Evidence.** `tests/qualification/ui-convergence/outline-journey.mjs`
**Gap.** Current heading text, navigation, persistence and no-heading state proven at 1440 and 390; long labels wrap.

#### PAGE-011 — Present

Core · published · **done**

**Requirement.** Present mode fills the screen, paginates the page by its top-level headings, and shows no navigation, comments or editing affordances. Leaving it returns to the same scroll position.

**Evidence.** `tests/e2e/pages/presentation.test.ts`, `tests/qualification/ui-convergence/presentation-journey.mjs`
**Gap.** Read-only full-screen slides split at top-level headings; long slides keep controls visible, keyboard/touch navigation and exact scroll/focus return at 1440/390.

#### PAGE-012 — Page display options

Core · published · **done**

**Requirement.** Each page carries its own typeface from a fixed set, small-text and full-width toggles, and these are stored on the page and are the same for every reader. They change no stored content and survive export and import.

**Evidence.** `tests/e2e/pages/display-options.test.ts`, `tests/qualification/ui-convergence/page-display-journey.mjs`
**Gap.** Shared typeface, small text and full width; unchanged body; Markdown/HTML/PDF readable round trips and complete workspace restore; editor/reader browser journeys at 1440/390.

#### PAGE-013 — Analytics

Core · published · **done**

**Requirement.** A page records total views and unique viewers over time with the members who viewed and edited it, and a container rolls the same figures up over its pages. Both scopes ship and neither is gated by a plan, a role beyond read access to the page, or a policy. A member's own views of their own page are counted and labeled as such, and analytics never expose a viewer a member could not otherwise see.

**Evidence.** `tests/e2e/pages/analytics.test.ts`, `tests/qualification/ui-convergence/analytics-journey.mjs`
**Gap.** Page/space daily totals and uniques, named permitted readers/contributors, labeled author views, inclusive date filtering, draft/private-page exclusions and guest identity boundaries; 1440/390 reader journeys.

#### PAGE-014 — Reactions

Core · published · **done**

**Requirement.** A member can add and remove an emoji reaction on a page and on a comment (`COMM-005`). Reactions show who reacted, are not notifications, and are not counted in analytics.

**Evidence.** `tests/e2e/pages/reactions.test.ts`, `tests/qualification/ui-convergence/reactions-journey.mjs`
**Gap.** Page/comment add and removal, named reactors, read-only readers, persistence, access refusal and unchanged notification/view counts at 1440/390.

### The page tree

#### TREE-001 — A nested tree in a container

Core · published · **partial**

**Requirement.** Every container holds one tree of pages of unlimited depth. A node shows its icon, title and whether it has children, expands and collapses, and remembers its expansion per member. A page has exactly one parent — a page or the container root — and appears in exactly one place.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "Every container holds one tree of pages of unlimited depth."<br>No validated CI-run proof for this acceptance point: "A node shows its icon, title and whether it has children, expands and collapses, and remembers its expansion per member."<br>No validated CI-run proof for this acceptance point: "A page has exactly one parent — a page or the container root — and appears in exactly one place."

#### TREE-002 — Reordering and nesting

Core · published · **partial**

**Requirement.** A member with edit access can reorder a page among its siblings and re-parent it by dragging or through `PAGE-004`. Order is explicit and stored, is the same for every member, and never changes as a side effect of an edit, a rename or a publish.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "A member with edit access can reorder a page among its siblings and re-parent it by dragging or through `PAGE-004`."<br>No validated CI-run proof for this acceptance point: "Order is explicit and stored, is the same for every member, and never changes as a side effect of an edit, a rename or a publish."

#### TREE-003 — Shared with me

Core · published · **done**

**Requirement.** A member's navigation lists pages granted to them individually that sit in containers they are not a member of, with their container named. Removing the grant removes the entry within the same load.

**Evidence.** `tests/e2e/navigation/shared-navigation.test.ts`, `tests/qualification/ui-convergence/shared-navigation-journey.mjs`
**Gap.** Individual grants in non-member spaces have a named Shared with me section, independent of container discovery and broader access; revoked/expired grants remove the entry on the next load. Workers and 1440/390 browser journeys cover private neighbors, opening and revocation.

#### TREE-004 — Filter the tree

Core · published · **done**

**Requirement.** Each container's tree carries a filter over page titles that narrows the visible nodes while keeping their ancestors, matches within 200ms of typing, and clears in one action without changing expansion state.

**Evidence.** `tests/e2e/navigation/tree-filter.test.ts`, `tests/qualification/ui-convergence/tree-filter-journey.mjs`
**Gap.** Per-space title matching retains readable ancestors within 200ms; one clear restores member expansion, with access and 1440/390 browser coverage.

#### TREE-005 — Create in place

Core · published · **done**

**Requirement.** A page can be created at the foot of a tree, as a child from any node's own actions, and from one global create action available on every operator screen. Each names the destination before creating.

**Evidence.** `tests/e2e/navigation/create-in-place.test.ts`, `tests/qualification/ui-convergence/create-in-place-journey.mjs`
**Gap.** Named tree-footer, child and global destinations, exact placement, persistence and read-only access checks at 1440/390.

### The page body

#### BLOCK-001 — A body of blocks

Core · published · **partial**

**Requirement.** A page body is an ordered tree of typed blocks, each with an identifier, a type, content, and optional children. Every block has a drag handle, can be reordered and nested, can be selected with its neighbors, and can be duplicated or deleted. Block identifiers survive editing, moving and export, and an anchored comment (`COMM-001`) points at one.

**Evidence.** `tests/qualification/interface/routed.browser.mjs`
**Gap.** evidence tests are not loaded by any Verify job or named scheduled job: `tests/qualification/interface/routed.browser.mjs`.

#### BLOCK-002 — Inline text

Core · published · **partial**

**Requirement.** Text in a block carries bold, italic, underline, strikethrough, inline code, color, links, and mentions, and nothing else. It is stored in one format, rendered under `BASE-INPUT-002`, and round-trips unchanged through page export, workspace export and import.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "Text in a block carries bold, italic, underline, strikethrough, inline code, color, links, and mentions, and nothing else."<br>No validated CI-run proof for this acceptance point: "It is stored in one format, rendered under `BASE-INPUT-002`, and round-trips unchanged through page export, workspace export and import."

#### BLOCK-003 — The insert menu

Core · published · **partial**

**Requirement.** Typing `/` at the cursor opens an insert menu grouped by kind, filtered by what is typed, navigable and selectable by keyboard alone, and it inserts at the cursor without leaving the editor. Every block type this contract names is reachable from it, and on a touch client the same list is reachable from a labeled control above the keyboard.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "Typing `/` at the cursor opens an insert menu grouped by kind, filtered by what is typed, navigable and selectable by keyboard alone, and it inserts at the cursor without leaving the editor."<br>No validated CI-run proof for this acceptance point: "Every block type this contract names is reachable from it, and on a touch client the same list is reachable from a labeled control above the keyboard."

#### BLOCK-004 — Markdown shortcuts

Core · published · **partial**

**Requirement.** Typed Markdown converts as it is written — headings, lists, quotes, code fences, dividers, bold, italic and inline code — and each conversion is undone by one undo without losing the typed characters. The reference in `WORK-014` lists every shortcut the editor accepts.

**Evidence.** `tests/qualification/interface/content.mjs`
**Gap.** evidence tests are not loaded by any Verify job or named scheduled job: `tests/qualification/interface/content.mjs`.

#### BLOCK-005 — Mentions

Core · published · **partial**

**Requirement.** Typing `@` offers people, pages and dates in one list. A person mention notifies them (`NOTIF-001`) and renders their name; a page mention renders the page's current title and follows renames and moves (`LINK-003`); a date mention renders in the reader's locale. Target (16 October 2026): `BLOCK-020` adds group mentions.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "Typing `@` offers people, pages and dates in one list."<br>No validated CI-run proof for this acceptance point: "A person mention notifies them (`NOTIF-001`) and renders their name; a page mention renders the page's current title and follows renames and moves (`LINK-003`); a date mention renders in the reader's locale."

#### BLOCK-006 — Structured blocks

Core · published · **partial**

**Requirement.** The body carries headings, bulleted, numbered and toggle lists, quotes, dividers, callout panels, expandable sections, tables with header rows, and code blocks with a language and copy action. Each survives export and import and each has a Markdown or import equivalent named in `IMP-002` and `IMP-003`. Target (16 October 2026): a table-of-contents block (`BLOCK-017`), status labels (`BLOCK-018`) and diagrams.net diagrams (`BLOCK-019`) join them, and `IMP-010` names the Confluence macro each one replaces.

**Evidence.** `tests/qualification/interface/blocks.mjs`
**Gap.** evidence tests are not loaded by any Verify job or named scheduled job: `tests/qualification/interface/blocks.mjs`.

#### BLOCK-007 — Task items

Core · published · **done**

**Requirement.** A checkable item in the body toggles for anyone with edit access, records who completed it and when, and is counted where the page shows a completion figure. It is a block, not a record in a database, and it never appears in a database view. Target (16 October 2026): `BLOCK-015` adds an assignee and a due date, `NAV-007` a My tasks view and `BLOCK-016` task reports; a task item stays a block and still never appears in a database view.

**Evidence.** `tests/flagship/content/repair.test.ts`
**Gap.** None.

#### BLOCK-008 — Media blocks

Core · published · **partial**

**Requirement.** Images, video, audio and file attachments are inserted by upload, by link, or from a configured stock source, each with an optional caption and an alt text field, and stored under `BASE-INPUT-003`. This clause supersedes `BASE-INPUT-003` on disposition alone. A file requested for display — an image, video or audio block, a page icon or cover (`PAGE-006`), or either of those behind a published page (`WEB-003`) — is served inline with its declared content type; every other request for a stored file, including every file attachment and every direct request for a media file, is served with a download disposition. Both dispositions send the declared content type and `X-Content-Type-Options: nosniff`, and an SVG is sanitized under `BASE-INPUT-002` before it is served inline. Disposition changes nothing about access: a media file is readable only by a session that may read its page, or through that page's public link (`WEB-003`).

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "Images, video, audio and file attachments are inserted by upload, by link, or from a configured stock source, each with an optional caption and an alt text field, and stored under `BASE-INPUT-003`."<br>No validated CI-run proof for this acceptance point: "A file requested for display — an image, video or audio block, a page icon or cover (`PAGE-006`), or either of those behind a published page (`WEB-003`) — is served inline with its declared content type; every other request for a stored file, including every file attachment and every direct request for a media file, is served with a download disposition."<br>No validated CI-run proof for this acceptance point: "Both dispositions send the declared content type and `X-Content-Type-Options: nosniff`, and an SVG is sanitized under `BASE-INPUT-002` before it is served inline."<br>No validated CI-run proof for this acceptance point: "Disposition changes nothing about access: a media file is readable only by a session that may read its page, or through that page's public link (`WEB-003`)."

#### BLOCK-009 — Link cards

Core · published · **done**

**Requirement.** A pasted URL becomes a link card showing the target's title, description and icon, and can be switched between a plain link, an inline card and a block card without retyping it. Fetching a preview goes through `link.preview.v1` and issues a bodyless GET to public HTTPS origins only, sends no session, credential or member identity, rejects local, private, link-local and cloud-metadata addresses before the first request and before each redirect, and enforces the redirect, byte, time and media-type limits in `seed.json → limits`. A refused or failed fetch leaves the plain link and says so; the URL is stored exactly as pasted either way.

**Evidence.** `tests/flagship/content/preview.test.ts`
**Gap.** None.

#### BLOCK-010 — Content queries

Core · published · **partial**

**Requirement.** A body can hold a live list of pages defined by container, ancestor, type, status, contributor and date, ordered and limited by the author. It re-runs when the page is opened, shows when it last ran, shows each reader only the pages that reader may read, and never renders a draft (`LIFE-002`). A query whose source is deleted shows that, not an empty list.

**Evidence.** `tests/qualification/interface/blocks.mjs`
**Gap.** evidence tests are not loaded by any Verify job or named scheduled job: `tests/qualification/interface/blocks.mjs`.

### Page lifecycle

#### LIFE-001 — Lifecycle states

Core · published · **partial**

**Requirement.** A page is `draft`, `scheduled`, `live`, `live-with-unpublished-changes` or `archived`. It always has a working revision and has a published revision in every state but `draft`; `live-with-unpublished-changes` means both exist and differ. Every transition records the actor and the time, and every state exists in the stored model whichever value `LIFE-006` carries.

**Evidence.** `tests/qualification/interface/publication.mjs`
**Gap.** evidence tests are not loaded by any Verify job or named scheduled job: `tests/qualification/interface/publication.mjs`.

#### LIFE-002 — A draft is private

Core · published · **partial**

**Requirement.** While a page is `draft` it is absent from search, from content queries, from the inbox, from analytics, from AI grounding, from every administrative and export listing, and from the tree of every member it has not been shared with. Its body is readable only by its author and by the principals in its own grant list: sharing a draft, by link or by address, creates a grant under `SHARE-001` and `SHARE-006`, that grant requires a session like every other, it is shown in the draft's grant list, and revoking it ends access under `SHARE-007`. There is no readable address for a draft that carries no grant, a draft has no general access grant under either value of `SHARE-005` (`SHARE-004`), and a draft cannot be published to the anonymous web (`WEB-001`). No role, policy value, container setting, workspace owner action, automation or extension defeats this. `LIFE-006` decides whether a draft state arises, never whether this clause holds.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "While a page is `draft` it is absent from search, from content queries, from the inbox, from analytics, from AI grounding, from every administrative and export listing, and from the tree of every member it has not been shared with."<br>No validated CI-run proof for this acceptance point: "Its body is readable only by its author and by the principals in its own grant list: sharing a draft, by link or by address, creates a grant under `SHARE-001` and `SHARE-006`, that grant requires a session like every other, it is shown in the draft's grant list, and revoking it ends access under `SHARE-007`."<br>No validated CI-run proof for this acceptance point: "There is no readable address for a draft that carries no grant, a draft has no general access grant under either value of `SHARE-005` (`SHARE-004`), and a draft cannot be published to the anonymous web (`WEB-001`)."<br>No validated CI-run proof for this acceptance point: "No role, policy value, container setting, workspace owner action, automation or extension defeats this."<br>No validated CI-run proof for this acceptance point: "`LIFE-006` decides whether a draft state arises, never whether this clause holds."

#### LIFE-003 — Publish

Core · published · **partial**

**Requirement.** Publishing takes a location, a general access setting (`SHARE-004`), an optional version comment, an optional schedule and an optional publish-as attribution, shows a preview of what readers will see, and on confirmation makes the page visible in its container's tree, in search and in content queries, and writes one version with origin `publish` (`REV-002`).

**Evidence.** `tests/qualification/interface/publication.mjs`
**Gap.** evidence tests are not loaded by any Verify job or named scheduled job: `tests/qualification/interface/publication.mjs`.

#### LIFE-004 — Scheduled publish

Core · published · **partial**

**Requirement.** A publish set for a future time leaves the page `scheduled`, shows that time wherever the page appears to its author, and publishes at that time without a further action. Canceling before it fires returns the page to `draft` and publishes nothing; a schedule that fails to fire leaves the page `scheduled` and reports the failure under `BASE-OPS-004`.

**Evidence.** `tests/qualification/interface/publication.mjs`
**Gap.** evidence tests are not loaded by any Verify job or named scheduled job: `tests/qualification/interface/publication.mjs`.

#### LIFE-005 — Unpublished changes

Core · published · **partial**

**Requirement.** Editing a `live` page changes what readers see only when it is republished: every reader other than the editors sees the published revision, and the page shows that it has unpublished changes to anyone who may edit it. Discarding them restores the published revision as the working revision and deletes no version.

**Evidence.** `tests/qualification/interface/publication.mjs`
**Gap.** evidence tests are not loaded by any Verify job or named scheduled job: `tests/qualification/interface/publication.mjs`.

#### LIFE-006 — Lifecycle profile

Core · published · **partial**

**Requirement.** *Policy: `page.lifecycle.v1`; default: `always-live`, following Notion. Under `always-live` a new page is live from creation and the product hides the publish action and its modal, close and discard draft, the draft banner, the draft chip in the tree, the scheduled state, the unpublished-changes state, the version-comment field and the publish-as selector; the page's own share panel (`SHARE-001`) is how it becomes visible to others. Under `draft-then-publish` a new page appears only in its author's tree with a draft chip, nothing is hidden, and `LIFE-003` to `LIFE-005` are the working path. Both values store every state in `LIFE-001`, so a workspace can be switched either way without a migration and an imported draft is never published on arrival.*

**Evidence.** `tests/qualification/policies/emitted.mjs`
**Gap.** evidence tests are not loaded by any Verify job or named scheduled job: `tests/qualification/policies/emitted.mjs`.

#### LIFE-007 — Discarding a draft

Core · published · **partial**

**Requirement.** The author of a `draft` page can discard it, which moves it to trash (`ARCH-005`) rather than deleting it, and can close it, which leaves it a draft. Neither action notifies anyone or leaves a trace in another member's tree.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "The author of a `draft` page can discard it, which moves it to trash (`ARCH-005`) rather than deleting it, and can close it, which leaves it a draft."<br>No validated CI-run proof for this acceptance point: "Neither action notifies anyone or leaves a trace in another member's tree."

### Sharing and access

#### SHARE-001 — Grants

Core · published · **partial**

**Requirement.** A page carries an ordered list of grants. Each grant names a principal — a person, a group, a container or the workspace — a level from `full`, `edit`, `comment` and `view`, and an optional expiry. The panel that edits them shows every effective grant, whether it is inherited or set here, and where an inherited one comes from.

**Evidence.** `tests/qualification/backend/emitted.mjs`
**Gap.** evidence tests are not loaded by any Verify job or named scheduled job: `tests/qualification/backend/emitted.mjs`.

#### SHARE-002 — What the levels mean

Core · published · **partial**

**Requirement.** `full` may read, edit, comment, share and change access; `edit` may read, edit and comment; `comment` may read and comment; `view` may read only. Every server operation checks the level for the acting member (`BASE-ACCESS-004`), and no interface offers an action the level does not carry.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "`full` may read, edit, comment, share and change access; `edit` may read, edit and comment; `comment` may read and comment; `view` may read only."<br>No validated CI-run proof for this acceptance point: "Every server operation checks the level for the acting member (`BASE-ACCESS-004`), and no interface offers an action the level does not carry."

#### SHARE-003 — Inheritance

Core · published · **partial**

**Requirement.** A page inherits its parent's grants, and a child added later inherits the parent's grants at that moment. A page may add grants or be restricted, and a restriction is shown on the page and on every descendant it affects. Removing a restriction restores inheritance rather than copying the parent's grants.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "A page inherits its parent's grants, and a child added later inherits the parent's grants at that moment."<br>No validated CI-run proof for this acceptance point: "A page may add grants or be restricted, and a restriction is shown on the page and on every descendant it affects."<br>No validated CI-run proof for this acceptance point: "Removing a restriction restores inheritance rather than copying the parent's grants."

#### SHARE-004 — General access

Core · published · **done**

**Requirement.** At most one grant on a page has the container or the workspace as its principal; that is the general access grant. A page that carries none is restricted to its named grants, and a page in a personal container (`CONT-005`) carries none under either value of `SHARE-005`. Changing it is one action and is recorded in activity.

**Evidence.** `tests/e2e/imports/real-exports.test.ts`
**Gap.** None.

#### SHARE-005 — Access profile

Core · published · **done**

**Requirement.** *Policy: `page.access.v1`; default: `workspace-general` with all four levels, following Notion. `workspace-general` makes the workspace the general principal and shows the four-level ladder on each grant. `container-general` makes the container the general principal, labels that row with the container's name, and hides nothing else. Removing a level from the list hides it everywhere, including the comment affordance when `comment` is removed. A page imported with a container-wide general grant is created with a container principal under either value, never widened to the workspace. Switching the value relabels the general access row and rewrites no grant: no value widens an existing page's general principal, and no page gains a general grant it did not already carry.*

**Evidence.** `tests/e2e/imports/real-exports.test.ts`
**Gap.** None.

#### SHARE-006 — Sharing with a person who is not a member

Core · published · **partial**

**Requirement.** Granting access to an address that belongs to no member creates a guest invitation (`WORK-010`, `MAIL-001`) and the grant takes effect when it is accepted. Until then the page shows the pending grant, and revoking it cancels the invitation.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "Granting access to an address that belongs to no member creates a guest invitation (`WORK-010`, `MAIL-001`) and the grant takes effect when it is accepted."<br>No validated CI-run proof for this acceptance point: "Until then the page shows the pending grant, and revoking it cancels the invitation."

#### SHARE-007 — Access changes take effect at once

Core · published · **partial**

**Requirement.** Removing or narrowing a grant applies to the next request from every existing session, closes an open editor with an explanation rather than silently discarding the writer's unsaved text, and removes the page from that member's search results, tree, inbox items and AI answers within 5 seconds.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "Removing or narrowing a grant applies to the next request from every existing session, closes an open editor with an explanation rather than silently discarding the writer's unsaved text, and removes the page from that member's search results, tree, inbox items and AI answers within 5 seconds."

#### SHARE-008 — Expiring grants

Core · published · **partial**

**Requirement.** A grant may carry an expiry time. When it passes, access ends under `SHARE-007`, the grant is shown as expired rather than deleted, and re-granting is one action.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "A grant may carry an expiry time."<br>No validated CI-run proof for this acceptance point: "When it passes, access ends under `SHARE-007`, the grant is shown as expired rather than deleted, and re-granting is one action."

### Public links

#### WEB-001 — Anonymous access takes two acts

Core · published · **partial**

**Requirement.** A page is readable without signing in only when a member with `full` access publishes it (`WEB-002`), directly or through an explicit bounded revocable owner grant for that exact page or named publication class under `AI-011` and only while its container allows it. Each of the container's three switches (`CONT-007`) vetoes its own act and no other. While public links are forbidden, publishing a page in that container is rejected and every existing public link on its pages stops resolving at once. While anonymous access is forbidden, a published page in that container resolves only for a signed-in member who may read it. While guests are forbidden, a guest invitation to that container or to a page in it is rejected and existing guest access to it ends under `SHARE-007`. Each veto is not gated by a plan or a role beyond container administration, is not a policy value, and no extension, automation or AI action may bypass it. Each delegated publication rechecks the grant, current full access, exact source-audience disclosure rights and target; standing authority avoids repeated approval but supplies no audience or veto bypass.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "A page is readable without signing in only when a member with `full` access publishes it (`WEB-002`), directly or through an explicit bounded revocable owner grant for that exact page or named publication class under `AI-011` and only while its container allows it."<br>No validated CI-run proof for this acceptance point: "Each of the container's three switches (`CONT-007`) vetoes its own act and no other."<br>No validated CI-run proof for this acceptance point: "While public links are forbidden, publishing a page in that container is rejected and every existing public link on its pages stops resolving at once."<br>No validated CI-run proof for this acceptance point: "While anonymous access is forbidden, a published page in that container resolves only for a signed-in member who may read it."<br>No validated CI-run proof for this acceptance point: "While guests are forbidden, a guest invitation to that container or to a page in it is rejected and existing guest access to it ends under `SHARE-007`."<br>No validated CI-run proof for this acceptance point: "Each veto is not gated by a plan or a role beyond container administration, is not a policy value, and no extension, automation or AI action may bypass it."<br>No validated CI-run proof for this acceptance point: "Each delegated publication rechecks the grant, current full access, exact source-audience disclosure rights and target; standing authority avoids repeated approval but supplies no audience or veto bypass."

#### WEB-002 — What a published page carries

Core · published · **partial**

**Requirement.** Publishing writes a public exposure record holding the host, a slug the publisher may edit, a search-engine indexing flag, a theme, the set of header controls the page shows, whether readers may duplicate it, and the time it was revoked if it was. The slug is stored, never derived, so an imported public address is preserved exactly; a slug already in use is rejected.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "Publishing writes a public exposure record holding the host, a slug the publisher may edit, a search-engine indexing flag, a theme, the set of header controls the page shows, whether readers may duplicate it, and the time it was revoked if it was."<br>No validated CI-run proof for this acceptance point: "The slug is stored, never derived, so an imported public address is preserved exactly; a slug already in use is rejected."

#### WEB-003 — The anonymous read view

Core · published · **partial**

**Requirement.** A published page renders its published revision and nothing else: no navigation, no editing, no comments, no member names beyond the byline the page itself shows, and no other page unless that page is itself published. It sets no cookie, loads nothing from a third-party domain, and sends no visitor data before an interaction (`BASE-PUBLIC-001`), and it counts a view without identifying the viewer (`PAGE-013`).

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "A published page renders its published revision and nothing else: no navigation, no editing, no comments, no member names beyond the byline the page itself shows, and no other page unless that page is itself published."<br>No validated CI-run proof for this acceptance point: "It sets no cookie, loads nothing from a third-party domain, and sends no visitor data before an interaction (`BASE-PUBLIC-001`), and it counts a view without identifying the viewer (`PAGE-013`)."

#### WEB-004 — Children are not published by inheritance

Core · published · **partial**

**Requirement.** Publishing one page publishes only that page unless the publisher explicitly includes its children, and a child added later is not published until someone publishes it. A link from a published page to an unpublished one is rendered as text, not as a link that would return a sign-in page.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "Publishing one page publishes only that page unless the publisher explicitly includes its children, and a child added later is not published until someone publishes it."<br>No validated CI-run proof for this acceptance point: "A link from a published page to an unpublished one is rendered as text, not as a link that would return a sign-in page."

#### WEB-005 — Indexing is off until it is chosen

Core · published · **partial**

**Requirement.** Search-engine indexing is off for a newly published page: the response and the served document tell crawlers not to index it until a member turns indexing on, and turning it off again restores that state within one request.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "Search-engine indexing is off for a newly published page: the response and the served document tell crawlers not to index it until a member turns indexing on, and turning it off again restores that state within one request."

#### WEB-006 — Unpublish

Core · published · **partial**

**Requirement.** Unpublishing stops the address resolving within 5 seconds, returns a content-free page saying the link is no longer available, and keeps the slug reserved for that page so republishing restores the same address. It deletes no version and changes no grant.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "Unpublishing stops the address resolving within 5 seconds, returns a content-free page saying the link is no longer available, and keeps the slug reserved for that page so republishing restores the same address."<br>No validated CI-run proof for this acceptance point: "It deletes no version and changes no grant."

#### WEB-007 — Public-link profile

Core · published · **partial**

**Requirement.** *Policy: `page.public-access.v1`; default: `site`, following Notion. `site` shows the host and slug fields, the theme, the header controls, the duplicate-as-template switch, social preview settings and the live-site banner over the page. `link` hides all of those and shows a single toggle, the resulting URL, the indexing switch and unpublish. Both values store the whole record in `WEB-002`, so a workspace switched to `link` keeps the slug and theme an imported or previously published page already had.*

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "`site` shows the host and slug fields, the theme, the header controls, the duplicate-as-template switch, social preview settings and the live-site banner over the page."<br>No validated CI-run proof for this acceptance point: "`link` hides all of those and shows a single toggle, the resulting URL, the indexing switch and unpublish."<br>No validated CI-run proof for this acceptance point: "Both values store the whole record in `WEB-002`, so a workspace switched to `link` keeps the slug and theme an imported or previously published page already had."

### Versions

#### REV-001 — What a revision is

Core · published · **partial**

**Requirement.** Every page, record, container, comment, template and decision record (`DEC-001`) carries a revision identifier that changes on every committed edit and is never reused. A page revision is immutable: it holds the body and properties as committed, its author, its time, its origin of `autosave` or `publish`, and a content hash, being SHA-256 of the revision's extracted text after Unicode NFC normalization and whitespace collapse. A retried write whose hash matches the latest revision commits nothing. Wherever another clause names a revision, it means this identifier.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "Every page, record, container, comment, template and decision record (`DEC-001`) carries a revision identifier that changes on every committed edit and is never reused."<br>No validated CI-run proof for this acceptance point: "A page revision is immutable: it holds the body and properties as committed, its author, its time, its origin of `autosave` or `publish`, and a content hash, being SHA-256 of the revision's extracted text after Unicode NFC normalization and whitespace collapse."<br>No validated CI-run proof for this acceptance point: "A retried write whose hash matches the latest revision commits nothing."<br>No validated CI-run proof for this acceptance point: "Wherever another clause names a revision, it means this identifier."

#### REV-002 — History

Core · published · **partial**

**Requirement.** Each of those records has a history listing its revisions newest first with the actor, the time, the origin, and, where `REV-007` assigns them, an ordinal and a label. History is readable by anyone who may read the record and is never editable.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "Each of those records has a history listing its revisions newest first with the actor, the time, the origin, and, where `REV-007` assigns them, an ordinal and a label."<br>No validated CI-run proof for this acceptance point: "History is readable by anyone who may read the record and is never editable."

#### REV-003 — Restore

Core · published · **partial**

**Requirement.** A member with edit access can restore a previous revision. Restoring writes a new revision holding the earlier content, records who restored which revision in activity, and changes no link, comment anchor, child page, grant or public link.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "A member with edit access can restore a previous revision."<br>No validated CI-run proof for this acceptance point: "Restoring writes a new revision holding the earlier content, records who restored which revision in activity, and changes no link, comment anchor, child page, grant or public link."

#### REV-004 — Compare

Core · published · **done**

**Requirement.** Any two revisions of one page can be compared, showing added, removed and changed blocks in place. Compare is available under every value of `REV-007`.

**Evidence.** `tests/e2e/review/verification-flow.test.ts`
**Gap.** None.

#### REV-005 — A citation resolves to its revision

Core · published · **done**

**Requirement.** A link, mention or AI citation that names a revision opens that revision with its content as committed, even after the page has changed, and says that a newer revision exists. The reader's access is checked against the page as it is now: a member who may not read the page today gets `LINK-004` and no historical content, an anonymous reader gets nothing unless the page is published (`WEB-001`), and no grant that has since been removed or expired reopens a revision. When the page has been erased it opens a content-free tombstone (`LINK-002`) carrying no body, quote or personal metadata.

**Evidence.** `tests/e2e/review/verification-flow.test.ts`
**Gap.** None.

#### REV-006 — Deleting a version

Core · published · **partial**

**Requirement.** A member with `full` access can delete one intermediate version, which removes its content and leaves a numbered tombstone in history naming who deleted it and when. The current revision and the published revision cannot be deleted, and deletion is offered only where `REV-007` says so.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "A member with `full` access can delete one intermediate version, which removes its content and leaves a numbered tombstone in history naming who deleted it and when."<br>No validated CI-run proof for this acceptance point: "The current revision and the published revision cannot be deleted, and deletion is offered only where `REV-007` says so."

#### REV-007 — Version profile

Core · published · **done**

**Requirement.** *Policy: `page.version.v1`; default: `autosnapshot`, following Notion. `autosnapshot` writes a revision on save, assigns no ordinal or label, and hides the version and comment columns, the version-comment field and version deletion, keeping selection, compare, restore and difference summaries. `labelled` numbers each published revision, carries the version comment taken at publish and the page's status at that moment, and hides nothing. Ordinals come from publish events, so a workspace with `page.lifecycle.v1` at `always-live` and this policy at `labelled` numbers nothing until a page is published; the model stores the ordinal and label fields under both values, so an imported numbered history is never discarded.*

**Evidence.** `tests/e2e/imports/real-exports.test.ts`
**Gap.** None.

### Page status and verification

#### STAT-001 — The status vocabulary

Core · published · **partial**

**Requirement.** The workspace holds a list of status entries, each with a key, a label, a color and an optional verification requirement. It ships seeded with Rough draft, In progress, Ready for review and Verified under every value of `STAT-005`, and a workspace owner can add, rename, recolor and retire entries. Retiring an entry keeps it on the pages that carry it and offers a bulk change (`CONT-006`).

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "The workspace holds a list of status entries, each with a key, a label, a color and an optional verification requirement."<br>No validated CI-run proof for this acceptance point: "It ships seeded with Rough draft, In progress, Ready for review and Verified under every value of `STAT-005`, and a workspace owner can add, rename, recolor and retire entries."<br>No validated CI-run proof for this acceptance point: "Retiring an entry keeps it on the pages that carry it and offers a bulk change (`CONT-006`)."

#### STAT-002 — A page's status

Core · published · **partial**

**Requirement.** A page carries at most one status. Setting or clearing it is one action for anyone with edit access, writes one activity entry, and makes the page findable by that status in search (`SEARCH-003`) and in content queries (`BLOCK-010`).

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "A page carries at most one status."<br>No validated CI-run proof for this acceptance point: "Setting or clearing it is one action for anyone with edit access, writes one activity entry, and makes the page findable by that status in search (`SEARCH-003`) and in content queries (`BLOCK-010`)."

#### STAT-003 — Verification

Core · published · **done**

**Requirement.** Setting a status entry that requires verification records the verifying member as its owner and an expiry of 7, 30 or 90 days, a chosen date, or none, and can be set only by a member who has opened the exact revision they are attesting to. The badge shows the owner, the expiry and the revision verified, and editing the page after verification shows that the verified revision is not the current one.

**Evidence.** `tests/e2e/review/verification-flow.test.ts`
**Gap.** None.

#### STAT-004 — Verification lapses

Core · published · **partial**

**Requirement.** When an expiry passes, the page shows the status as lapsed rather than verified, notifies the owner once (`NOTIF-001`), and keeps the original verification in history. Nothing renews it automatically, no AI action renews it (`AI-011`), and a lapsed verification never reads as current in search results, content queries, AI answers or exports.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "When an expiry passes, the page shows the status as lapsed rather than verified, notifies the owner once (`NOTIF-001`), and keeps the original verification in history."<br>No validated CI-run proof for this acceptance point: "Nothing renews it automatically, no AI action renews it (`AI-011`), and a lapsed verification never reads as current in search results, content queries, AI answers or exports."

#### STAT-005 — Status profile

Core · published · **partial**

**Requirement.** *Policy: `page.status.v1`; default: `verification-only`, following Notion. `verification-only` exposes only the entries that require verification, hides the color picker and the custom-status field, offers the control from the title's own hover row, and renders the chip beside the breadcrumb title. `open-vocabulary` exposes every entry, shows the color picker and a custom label of at most twenty characters, and renders the chip on the byline between the author and the reading time. Both values store the whole vocabulary, so switching exposes or hides entries and rewrites no page.*

**Evidence.** `tests/qualification/policies/emitted.mjs`
**Gap.** evidence tests are not loaded by any Verify job or named scheduled job: `tests/qualification/policies/emitted.mjs`.

### Comments

#### COMM-001 — Two kinds of thread

Core · published · **partial**

**Requirement.** A member with `comment` access or more can open an inline thread anchored to a selection in a block, and a page thread about the page as a whole. A thread is chronological, is Open or Resolved, and records each comment's author and time. Both kinds are threads; only their anchor differs.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "A member with `comment` access or more can open an inline thread anchored to a selection in a block, and a page thread about the page as a whole."<br>No validated CI-run proof for this acceptance point: "A thread is chronological, is Open or Resolved, and records each comment's author and time."<br>No validated CI-run proof for this acceptance point: "Both kinds are threads; only their anchor differs."

#### COMM-002 — Editing and deletion

Core · published · **partial**

**Requirement.** A member can edit or delete only their own comments. An edited comment shows the time it was last edited, a deleted comment leaves a tombstone in place, and both write an activity entry.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "A member can edit or delete only their own comments."<br>No validated CI-run proof for this acceptance point: "An edited comment shows the time it was last edited, a deleted comment leaves a tombstone in place, and both write an activity entry."

#### COMM-003 — Mentions

Core · published · **partial**

**Requirement.** Mentioning a member in a comment creates one unread notification (`NOTIF-001`) linked to that comment, and mentions no one who cannot read the page. Editing the comment notifies only a member the comment did not already mention.

**Evidence.** `tests/qualification/interface/content.mjs`
**Gap.** evidence tests are not loaded by any Verify job or named scheduled job: `tests/qualification/interface/content.mjs`.

#### COMM-004 — Anchors survive editing

Core · published · **partial**

**Requirement.** An inline thread follows its text through edits, splits and moves within the page. When its text is deleted the thread becomes orphaned rather than lost: it stays in the discussions panel, names the revision it was anchored in, and opens that revision (`REV-005`).

**Evidence.** `tests/qualification/interface/content.mjs`
**Gap.** evidence tests are not loaded by any Verify job or named scheduled job: `tests/qualification/interface/content.mjs`.

#### COMM-005 — Reactions

Core · published · **partial**

**Requirement.** A member can add and remove an emoji reaction on any comment they can read. Reactions show who reacted and never notify.

**Evidence.** `tests/qualification/interface/content.mjs`
**Gap.** evidence tests are not loaded by any Verify job or named scheduled job: `tests/qualification/interface/content.mjs`.

#### COMM-006 — Discussions panel

Core · published · **partial**

**Requirement.** One panel lists every thread on the page, filtered by kind, status and person, with an action that resolves all open threads. It shows unresolved threads whose anchor is orphaned, and selecting a thread scrolls to its anchor.

**Evidence.** `tests/qualification/interface/content.mjs`
**Gap.** evidence tests are not loaded by any Verify job or named scheduled job: `tests/qualification/interface/content.mjs`.

#### COMM-007 — Resolve

Core · published · **partial**

**Requirement.** Any member with `comment` access can resolve or reopen a thread. A resolved thread is hidden from the page body, stays readable in the panel and in search, and keeps its comments and reactions.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "Any member with `comment` access can resolve or reopen a thread."<br>No validated CI-run proof for this acceptance point: "A resolved thread is hidden from the page body, stays readable in the panel and in search, and keeps its comments and reactions."

### Archive, trash and deletion

#### ARCH-001 — Archive

Core · published · **partial**

**Requirement.** A page, a container or a database can be archived. Archiving records the actor, the time, the prior location and an optional reason, and archives the record's descendants with it.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "A page, a container or a database can be archived."<br>No validated CI-run proof for this acceptance point: "Archiving records the actor, the time, the prior location and an optional reason, and archives the record's descendants with it."

#### ARCH-002 — What archived means

Core · published · **partial**

**Requirement.** An archived record is read-only, is absent from the tree, from default search (`SEARCH-009`), from content queries and from AI grounding, and its existing links, mentions and citations still resolve. It is discoverable by the archived filter, and its comments, versions and grants are unchanged.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "An archived record is read-only, is absent from the tree, from default search (`SEARCH-009`), from content queries and from AI grounding, and its existing links, mentions and citations still resolve."<br>No validated CI-run proof for this acceptance point: "It is discoverable by the archived filter, and its comments, versions and grants are unchanged."

#### ARCH-003 — Restore from archive

Core · published · **partial**

**Requirement.** Restoring returns a record to its prior parent and position with the same identifiers, revisions, comments, grants and status. Where the prior parent is gone, the member chooses a destination before the restore completes.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "Restoring returns a record to its prior parent and position with the same identifiers, revisions, comments, grants and status."<br>No validated CI-run proof for this acceptance point: "Where the prior parent is gone, the member chooses a destination before the restore completes."

#### ARCH-004 — Archive is not deletion

Core · published · **partial**

**Requirement.** Archiving deletes no data. Permanent deletion is a separate confirmed action governed by `BASE-DATA-002`, `BASE-DATA-003` and `ARCH-006`.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "Archiving deletes no data."<br>No validated CI-run proof for this acceptance point: "Permanent deletion is a separate confirmed action governed by `BASE-DATA-002`, `BASE-DATA-003` and `ARCH-006`."

#### ARCH-005 — Trash

Core · published · **partial**

**Requirement.** Deleting a page moves it and its descendants to the trash, where they are listed with the deleting member, the time and the prior location, searchable and filterable within the trash, and restorable to their prior place. Nothing leaves the trash on a timer (`BASE-DATA-002`), and a page in the trash is absent from every surface but the trash itself.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "Deleting a page moves it and its descendants to the trash, where they are listed with the deleting member, the time and the prior location, searchable and filterable within the trash, and restorable to their prior place."<br>No validated CI-run proof for this acceptance point: "Nothing leaves the trash on a timer (`BASE-DATA-002`), and a page in the trash is absent from every surface but the trash itself."

#### ARCH-006 — Permanent deletion

Core · published · **done**

**Requirement.** Emptying the trash, or permanently deleting one record in it, is explicit and confirmed, names what will be destroyed, and removes the body, every revision, uploaded files, comments, analytics rows and AI grounding within the cascade deadline in `BASE-DATA-003`. Every link to it then resolves to a content-free tombstone (`LINK-002`), and activity entries survive with their references anonymized.

**Evidence.** `tests/qualification/erasure-metadata/atomic-custody.test.ts` — "Erasure ARCH-006 BASE-DATA-003 PORT-001 PORT-002: atomic page and member custody erasure survives cleanup failure, restore and re-export"
**Gap.** None.

### Containers

#### CONT-001 — What a container is

Core · published · **partial**

**Requirement.** A container has an identifier, an optional key, an icon, a name, a description, owners, a visibility of `default`, `open`, `closed`, `private` or `personal`, a grant list shaped like a page's, and external-access switches (`CONT-007`). It holds one page tree (`TREE-001`) and the databases in that tree.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "A container has an identifier, an optional key, an icon, a name, a description, owners, a visibility of `default`, `open`, `closed`, `private` or `personal`, a grant list shaped like a page's, and external-access switches (`CONT-007`)."<br>No validated CI-run proof for this acceptance point: "It holds one page tree (`TREE-001`) and the databases in that tree."

#### CONT-002 — Creating a container

Core · published · **partial**

**Requirement.** A workspace owner or, where the workspace allows it, any member can create a container from a form taking an icon, a name, a description, a visibility and an optional key, and a purpose that sets the form's defaults. A purpose supplies default values only; it creates no second kind of container and nothing about the container is unreachable afterwards.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "A workspace owner or, where the workspace allows it, any member can create a container from a form taking an icon, a name, a description, a visibility and an optional key, and a purpose that sets the form's defaults."<br>No validated CI-run proof for this acceptance point: "A purpose supplies default values only; it creates no second kind of container and nothing about the container is unreachable afterwards."

#### CONT-003 — The container index

Core · published · **partial**

**Requirement.** One index lists every container the member may see with its name, description, access and member count, filtered by membership, visibility and whether it is personal, and opens each one. Containers a member cannot see are neither listed nor counted.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "One index lists every container the member may see with its name, description, access and member count, filtered by membership, visibility and whether it is personal, and opens each one."<br>No validated CI-run proof for this acceptance point: "Containers a member cannot see are neither listed nor counted."

#### CONT-004 — Container settings

Core · published · **partial**

**Requirement.** Each container has its own settings shell holding its identity, members and grants, external-access switches, templates, trash and bulk tools. It is separate from workspace settings (`WORK-011`) and a container administrator reaches only their own container's.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "Each container has its own settings shell holding its identity, members and grants, external-access switches, templates, trash and bulk tools."<br>No validated CI-run proof for this acceptance point: "It is separate from workspace settings (`WORK-011`) and a container administrator reaches only their own container's."

#### CONT-005 — Personal containers

Core · published · **done**

**Requirement.** Every member has one personal container that no other member can be granted access to; its pages are theirs alone until they are moved or shared to another container. Deleting the member archives it under `WORK-007` rather than exposing it.

**Evidence.** `tests/e2e/imports/real-exports.test.ts`
**Gap.** None.

#### CONT-006 — Bulk actions

Core · published · **partial**

**Requirement.** A member can select several pages, in a tree or in a container's content list, and archive, trash, move, change owner or change status for all of them in one action. Each selected page records its own change with its own activity entry, each is checked against the acting member's access, and a partial failure names the pages that failed and applies the rest.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "A member can select several pages, in a tree or in a container's content list, and archive, trash, move, change owner or change status for all of them in one action."<br>No validated CI-run proof for this acceptance point: "Each selected page records its own change with its own activity entry, each is checked against the acting member's access, and a partial failure names the pages that failed and applies the rest."

#### CONT-007 — External-access switches

Core · published · **partial**

**Requirement.** A container carries three switches — guests, public links and anonymous access — each `allowed` or `forbidden`. A workspace owner sets a workspace-wide value and a container administrator may only narrow it. Forbidding takes effect at once under `WEB-001` and `SHARE-007`. These switches carry no plan, tier or upgrade gate.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "A container carries three switches — guests, public links and anonymous access — each `allowed` or `forbidden`."<br>No validated CI-run proof for this acceptance point: "A workspace owner sets a workspace-wide value and a container administrator may only narrow it."<br>No validated CI-run proof for this acceptance point: "Forbidding takes effect at once under `WEB-001` and `SHARE-007`."<br>No validated CI-run proof for this acceptance point: "These switches carry no plan, tier or upgrade gate."

#### CONT-008 — Container access profile

Core · published · **partial**

**Requirement.** *Policy: `container.access.v1`; default: `class-led`, following Notion. `class-led` leads with the visibility values in `CONT-001`, each stating who may see and join, and folds the member, group and guest lists behind one manage-access view. `grant-led` leads with tabbed lists of members, groups and guests and an external-access card, and hides the visibility dropdown. Neither value hides the switches in `CONT-007`. Both store visibility and the grant list, so switching relabels the surface and rewrites no grant.*

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "`class-led` leads with the visibility values in `CONT-001`, each stating who may see and join, and folds the member, group and guest lists behind one manage-access view."<br>No validated CI-run proof for this acceptance point: "`grant-led` leads with tabbed lists of members, groups and guests and an external-access card, and hides the visibility dropdown."<br>No validated CI-run proof for this acceptance point: "Neither value hides the switches in `CONT-007`."<br>No validated CI-run proof for this acceptance point: "Both store visibility and the grant list, so switching relabels the surface and rewrites no grant."

#### CONT-009 — Container grants

Core · published · **partial**

**Requirement.** A container's grants use the principals and levels of `SHARE-001` and `SHARE-002`, are the source of every page's inherited access, and are editable only by a container administrator or a workspace owner. Every change is recorded in activity and takes effect under `SHARE-007`.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "A container's grants use the principals and levels of `SHARE-001` and `SHARE-002`, are the source of every page's inherited access, and are editable only by a container administrator or a workspace owner."<br>No validated CI-run proof for this acceptance point: "Every change is recorded in activity and takes effect under `SHARE-007`."

### Structured records

#### DB-001 — A database

Core · published · **partial**

**Requirement.** A database is a node in the page tree with a name, an icon, typed fields and records. It is created, moved, archived and trashed like a page, and its access follows `SHARE-001`.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "A database is a node in the page tree with a name, an icon, typed fields and records."<br>No validated CI-run proof for this acceptance point: "It is created, moved, archived and trashed like a page, and its access follows `SHARE-001`."

#### DB-002 — Field types and evaluation

Core · published · **partial**

**Requirement.** Fields support text, number, checkbox, date, select, multi-select, status, person, file, URL, email, phone, place, relation, rollup, formula, created/updated metadata and identifier. Each defines empty value, sort order and import/export representation. Type changes convert every value or reject with the loss named. Relations resolve actual records. Bounded formulas and rollups evaluate typed expressions with explicit null/error semantics, dependency tracking, cycle rejection and resource limits; no arbitrary code or network execution. Recompute affected dependencies after changes. Evaluation and aggregation use current reader-authorized records and never leak restricted values or counts. Preserve imported configuration and unsupported expressions with visible not-recomputed state, never fabricated current values; export and restore retain definitions and dependencies.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "Fields support text, number, checkbox, date, select, multi-select, status, person, file, URL, email, phone, place, relation, rollup, formula, created/updated metadata and identifier."<br>No validated CI-run proof for this acceptance point: "Each defines empty value, sort order and import/export representation."<br>No validated CI-run proof for this acceptance point: "Type changes convert every value or reject with the loss named."<br>No validated CI-run proof for this acceptance point: "Relations resolve actual records."<br>No validated CI-run proof for this acceptance point: "Bounded formulas and rollups evaluate typed expressions with explicit null/error semantics, dependency tracking, cycle rejection and resource limits; no arbitrary code or network execution."<br>No validated CI-run proof for this acceptance point: "Recompute affected dependencies after changes."<br>No validated CI-run proof for this acceptance point: "Evaluation and aggregation use current reader-authorized records and never leak restricted values or counts."<br>No validated CI-run proof for this acceptance point: "Preserve imported configuration and unsupported expressions with visible not-recomputed state, never fabricated current values; export and restore retain definitions and dependencies."

#### DB-003 — Views

Core · published · **partial**

**Requirement.** A database has several named views over one set of records. A view is saved for everyone who can see the database, is renamed, duplicated and deleted by anyone with edit access, and never changes the records it shows.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "A database has several named views over one set of records."<br>No validated CI-run proof for this acceptance point: "A view is saved for everyone who can see the database, is renamed, duplicated and deleted by anyone with edit access, and never changes the records it shows."

#### DB-004 — Layouts

Core · published · **partial**

**Requirement.** A view is a table, a board, a list, a gallery, a calendar or a timeline. A board or calendar requires the field it groups or dates by, and offers to create it rather than failing when it is missing.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "A view is a table, a board, a list, a gallery, a calendar or a timeline."<br>No validated CI-run proof for this acceptance point: "A board or calendar requires the field it groups or dates by, and offers to create it rather than failing when it is missing."

#### DB-005 — Filter and sort

Core · published · **partial**

**Requirement.** A view carries filter rules over any field, combined with and or or, and an ordered list of sorts. Both are stored on the view, are shown in force above the records, and are cleared in one action.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "A view carries filter rules over any field, combined with and or or, and an ordered list of sorts."<br>No validated CI-run proof for this acceptance point: "Both are stored on the view, are shown in force above the records, and are cleared in one action."

#### DB-006 — Group

Core · published · **partial**

**Requirement.** A view groups its records by a select, status, person, checkbox or date field, shows the count in each group, allows a record to be moved between groups where the field permits it, and hides empty groups on request.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "A view groups its records by a select, status, person, checkbox or date field, shows the count in each group, allows a record to be moved between groups where the field permits it, and hides empty groups on request."

#### DB-007 — Calculations

Core · published · **partial**

**Requirement.** Each column in a table view carries a calculation under it — count, filled, empty, sum, average, minimum, maximum, range or percent — computed over the view's filtered records and updated within 2 seconds of a change.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "Each column in a table view carries a calculation under it — count, filled, empty, sum, average, minimum, maximum, range or percent — computed over the view's filtered records and updated within 2 seconds of a change."

#### DB-008 — Charts

Core · published · **partial**

**Requirement.** A chart is built over one view, showing counts or a numeric field aggregated by a grouping field, and can be embedded in a page (`DB-011`). It reads the same filtered records the view shows and states which view it reads.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "A chart is built over one view, showing counts or a numeric field aggregated by a grouping field, and can be embedded in a page (`DB-011`)."<br>No validated CI-run proof for this acceptance point: "It reads the same filtered records the view shows and states which view it reads."

#### DB-009 — Lock structure

Core · published · **partial**

**Requirement.** A database's structure can be locked, which rejects field, view, filter, sort and layout changes while allowing record edits, names who locked it, and is unlocked by anyone with `full` access.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "A database's structure can be locked, which rejects field, view, filter, sort and layout changes while allowing record edits, names who locked it, and is unlocked by anyone with `full` access."

#### DB-010 — A record is a page

Core · published · **partial**

**Requirement.** Every record has an identifier that is also a page identifier, a field map, an optional body of blocks, an optional icon and an optional position in the tree. *Policy: `record.page-parity.v1`; default: `record-is-page`, following Notion. `record-is-page` shows the per-record icon, opens a record as a side peek, a center peek or a full page, offers its body, and lists it in the tree and in page search. `record-is-row` opens a record as a field list with a print action, and hides the icon, the body area, the tree position and the record from page search. The body is stored under both values and is never dropped, so a workspace can be switched back and an imported record with a body keeps it.*

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "Every record has an identifier that is also a page identifier, a field map, an optional body of blocks, an optional icon and an optional position in the tree."<br>No validated CI-run proof for this acceptance point: "`record-is-page` shows the per-record icon, opens a record as a side peek, a center peek or a full page, offers its body, and lists it in the tree and in page search."<br>No validated CI-run proof for this acceptance point: "`record-is-row` opens a record as a field list with a print action, and hides the icon, the body area, the tree position and the record from page search."<br>No validated CI-run proof for this acceptance point: "The body is stored under both values and is never dropped, so a workspace can be switched back and an imported record with a body keeps it."

#### DB-011 — A view inside a page

Core · published · **partial**

**Requirement.** A view can be embedded in a page body and stays live: it shows each reader only the records that reader may read, reflects a change to the source within 5 seconds, and carries its own filters and sorts without changing the source view.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "A view can be embedded in a page body and stays live: it shows each reader only the records that reader may read, reflects a change to the source within 5 seconds, and carries its own filters and sorts without changing the source view."

#### DB-012 — Record detail

Core · published · **partial**

**Requirement.** Opening a record shows its fields in a defined order with inline editing, its comments and its history (`REV-002`), and, where `DB-010` exposes it, its body. A field a member may not edit is shown and not editable rather than hidden.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "Opening a record shows its fields in a defined order with inline editing, its comments and its history (`REV-002`), and, where `DB-010` exposes it, its body."<br>No validated CI-run proof for this acceptance point: "A field a member may not edit is shown and not editable rather than hidden."

### Automation

#### AUTO-001 — A rule

Core · published · **partial**

**Requirement.** A rule has a name, a scope, a trigger, ordered conditions, an optional branch over related records, ordered actions, and an actor. Triggers are record and page events and a schedule; actions edit fields, create pages and records, move and archive them, add comments, and send a notification through a configured adapter.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "A rule has a name, a scope, a trigger, ordered conditions, an optional branch over related records, ordered actions, and an actor."<br>No validated CI-run proof for this acceptance point: "Triggers are record and page events and a schedule; actions edit fields, create pages and records, move and archive them, add comments, and send a notification through a configured adapter."

#### AUTO-002 — A rule acts as its actor

Core · published · **partial**

**Requirement.** A rule performs only what its actor could perform by hand: every action is checked against that member's access at the moment it runs, and an action that would exceed it is skipped and logged rather than performed. A rule cannot publish or unpublish a page, change grants or external-access switches, verify a page, permanently delete anything, or manage members.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "A rule performs only what its actor could perform by hand: every action is checked against that member's access at the moment it runs, and an action that would exceed it is skipped and logged rather than performed."<br>No validated CI-run proof for this acceptance point: "A rule cannot publish or unpublish a page, change grants or external-access switches, verify a page, permanently delete anything, or manage members."

#### AUTO-003 — Run log

Core · published · **partial**

**Requirement.** Every rule keeps a per-run log with the trigger, the actor, the records touched, the time and one of the states configuration-changed, queued, running, success, no-action, condition-not-met, throttled, error, failure and disabled. A failed run is visible without a search (`BASE-OPS-004`), and a rule that fails repeatedly is disabled and says so.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "Every rule keeps a per-run log with the trigger, the actor, the records touched, the time and one of the states configuration-changed, queued, running, success, no-action, condition-not-met, throttled, error, failure and disabled."<br>No validated CI-run proof for this acceptance point: "A failed run is visible without a search (`BASE-OPS-004`), and a rule that fails repeatedly is disabled and says so."

#### AUTO-004 — Loops are bounded

Core · published · **partial**

**Requirement.** A rule never triggers itself, a chain of rules stops at the depth in `seed.json → limits`, and a run that would exceed the workspace's rate limit is throttled and logged rather than dropped silently.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "A rule never triggers itself, a chain of rules stops at the depth in `seed.json → limits`, and a run that would exceed the workspace's rate limit is throttled and logged rather than dropped silently."

#### AUTO-005 — Automation profile

Core · published · **partial**

**Requirement.** *Policy: `automation.scope.v1`; default: `source`, following Notion. `source` creates rules from a database's own toolbar, scopes them to that database, shows one When-and-Do form, scopes the run log to that database, and hides the scope selector, the site option, the branch rail and the cross-container rule list. `container` and `site` create rules from a rule list, expose the scope selector and the branch rail, and hide nothing from each other. The scope field and the run log are stored under every value, so an imported container or site rule keeps its scope and its history.*

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "`source` creates rules from a database's own toolbar, scopes them to that database, shows one When-and-Do form, scopes the run log to that database, and hides the scope selector, the site option, the branch rail and the cross-container rule list."<br>No validated CI-run proof for this acceptance point: "`container` and `site` create rules from a rule list, expose the scope selector and the branch rail, and hide nothing from each other."<br>No validated CI-run proof for this acceptance point: "The scope field and the run log are stored under every value, so an imported container or site rule keeps its scope and its history."

### Search

#### SEARCH-001 — Global search

Core · published · **partial**

**Requirement.** One search covers page titles and retained body text, record field values, container names and descriptions, comments and templates, and returns the first page of ranked results within 500ms with the total number of matches and an ordering stable across pages.

**Evidence.** `tests/qualification/core/discovery-browser.mjs`
**Gap.** evidence tests are not loaded by any Verify job or named scheduled job: `tests/qualification/core/discovery-browser.mjs`.

#### SEARCH-002 — Results

Core · published · **partial**

**Requirement.** Each result names its kind, shows the matched text in context, and opens the record with the match highlighted. A quoted query matches only records whose retained text contains that exact phrase.

**Evidence.** `tests/qualification/core/discovery.mjs`
**Gap.** evidence tests are not loaded by any Verify job or named scheduled job: `tests/qualification/core/discovery.mjs`.

#### SEARCH-003 — Filters

Core · published · **partial**

**Requirement.** Results are narrowed by kind, container, contributor, status, updated date, and whether archived or trashed records are included, without changing the query text, and the filters in force are shown with the results.

**Evidence.** `tests/qualification/core/discovery.mjs`
**Gap.** evidence tests are not loaded by any Verify job or named scheduled job: `tests/qualification/core/discovery.mjs`.

#### SEARCH-004 — Freshness

Core · published · **partial**

**Requirement.** A committed create, edit, publish, move, archive, restore or delete is reflected in results within 5 seconds. An import is not complete until its records are searchable (`PORT-004`), and content removed under `ARCH-006` stops matching within the cascade deadline in `BASE-DATA-003`.

**Evidence.** `tests/qualification/core/discovery.mjs`
**Gap.** evidence tests are not loaded by any Verify job or named scheduled job: `tests/qualification/core/discovery.mjs`.

#### SEARCH-005 — What search never shows

Core · published · **partial**

**Requirement.** Search returns only what the searching member may read: no page they lack a grant for, no other member's draft (`LIFE-002`), nothing in another member's personal container (`CONT-005`), and no title, snippet, facet count or result total that would reveal the existence of any of them. Access is the only rule that removes a record from search outright; every other exclusion is a default the member can undo (`SEARCH-009`).

**Evidence.** `tests/qualification/core/discovery.mjs`
**Gap.** evidence tests are not loaded by any Verify job or named scheduled job: `tests/qualification/core/discovery.mjs`.

#### SEARCH-006 — Search in one container

Core · published · **partial**

**Requirement.** Search can be scoped to one container from that container's own surface, keeps every filter in `SEARCH-003`, and says which container it is scoped to.

**Evidence.** `tests/qualification/core/discovery-browser.mjs`
**Gap.** evidence tests are not loaded by any Verify job or named scheduled job: `tests/qualification/core/discovery-browser.mjs`.

#### SEARCH-007 — No results

Core · published · **partial**

**Requirement.** When nothing matches, search restates the query and every applied filter, offers one action that clears the filters and one that creates a page with that title, and shows no invented result or answer.

**Evidence.** `tests/qualification/core/discovery-browser.mjs`
**Gap.** evidence tests are not loaded by any Verify job or named scheduled job: `tests/qualification/core/discovery-browser.mjs`.

#### SEARCH-008 — Search without AI

Core · published · **partial**

**Requirement.** With the AI provider unconfigured, disabled, failing or over budget, ranked search and every filter still return within 500ms with no error, and the generated answer (`AI-015`) is absent rather than empty.

**Evidence.** `tests/qualification/core/discovery.mjs`
**Gap.** evidence tests are not loaded by any Verify job or named scheduled job: `tests/qualification/core/discovery.mjs`.

#### SEARCH-009 — Default visibility

Core · published · **partial**

**Requirement.** Search without the archived or trashed filter (`SEARCH-003`) excludes archived and trashed records and nothing else. This is the only rule that hides a record the searching member may read, and every record it hides stays reachable by applying that filter and through every existing link, mention and citation (`LINK-001`, `LINK-003`).

**Evidence.** `tests/qualification/core/discovery.mjs`
**Gap.** evidence tests are not loaded by any Verify job or named scheduled job: `tests/qualification/core/discovery.mjs`.

### Personal surfaces and navigation

#### NAV-001 — Home

Core · published · **partial**

**Requirement.** A member's home shows their recent pages, their favorites and the containers they belong to, each entry opening the record. It shows nothing the member may not read and no workspace-wide activity feed.

**Evidence.** `tests/qualification/backend/emitted.mjs`
**Gap.** evidence tests are not loaded by any Verify job or named scheduled job: `tests/qualification/backend/emitted.mjs`.

#### NAV-002 — Recents

Core · published · **partial**

**Requirement.** Recently opened pages are listed per member, newest first and grouped by day, and a page appears there for no one but the member who opened it.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "Recently opened pages are listed per member, newest first and grouped by day, and a page appears there for no one but the member who opened it."

#### NAV-003 — Favorites

Core · published · **partial**

**Requirement.** Favorited pages and containers (`PAGE-008`) are listed in the navigation, reorderable by the member, and removed from the list in one action.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "Favorited pages and containers (`PAGE-008`) are listed in the navigation, reorderable by the member, and removed from the list in one action."

#### NAV-004 — One navigation

Core · published · **partial**

**Requirement.** The operator app has one sidebar holding the global destinations, the personal sections and the container trees, collapsible to leave the page full width. Its order and which entries appear come from workspace configuration and from the navigation slot (`workspace.navigation.after.v1`); changing any policy value in this contract changes no entry in it and no entry's position. A container's own navigation nests inside it rather than replacing it.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "The operator app has one sidebar holding the global destinations, the personal sections and the container trees, collapsible to leave the page full width."<br>No validated CI-run proof for this acceptance point: "Its order and which entries appear come from workspace configuration and from the navigation slot (`workspace.navigation.after.v1`); changing any policy value in this contract changes no entry in it and no entry's position."<br>No validated CI-run proof for this acceptance point: "A container's own navigation nests inside it rather than replacing it."

#### NAV-005 — Global create

Core · published · **done**

**Requirement.** One create action is available from every operator screen and creates a page, a database, a container or a page from a template, naming the destination before it creates.

**Evidence.** `tests/e2e/navigation/global-create.test.ts`, `tests/qualification/ui-convergence/global-create-journey.mjs`
**Gap.** Global creation is reachable on every configured operator destination; page, database, space and template flows name their destination before creation at 1440/390. Database choices include writable spaces only.

#### NAV-006 — The touch client edits

Core · published · **partial**

**Requirement.** Every operator surface in this contract works at phone width on a touch device, and none of them is read-only there: a member can create and edit a page and its blocks, comment, resolve, publish, share, and use every database layout. Where a gesture cannot carry a desktop interaction, the touch form is named in the same clause — the insert menu from a labeled control above the keyboard (`BLOCK-003`), reordering by a drag handle rather than a hover target (`BLOCK-001`). The responsive application is the baseline; native iOS, Android and desktop apps with offline pages and push notifications are target clauses `MOBILE-001` to `MOBILE-004`.

**Evidence.** `tests/qualification/ui-convergence/touch-page.mjs` — "touchWriteJourney", "touchCommentJourney" and "touchPublishShareJourney"; `tests/qualification/ui-convergence/touch-database.mjs` — "touchDatabaseJourney"; `tests/qualification/ui-convergence/columns-journey.mjs` — "columnsJourney"; `tests/qualification/ui-convergence/touch-operator-journey.mjs` — "touchOperatorJourney" (Search, Inbox, My tasks and requested/health review queues); `tests/qualification/ui-convergence/touch-management-journey.mjs` — "touchManagementJourney" (space settings, Templates, Archive, owner workspace settings); `tests/qualification/ui-convergence/touch-page-tools-journey.mjs` — "touchPageToolsJourney" (history/restore, labels, readable export and presentation); `tests/qualification/ui-convergence/touch-database-tools-journey.mjs` — "touchDatabaseToolsJourney" (charts, record templates, automations and run log). Core-wiki/touch-member launches at 1440px/390px and presentation and starter-template launches at 1440px in `tests/qualification/ui-convergence/journeys.test.mjs` drive touch contexts; controls assert visual-viewport reachability, no overflow, no serious/critical accessibility finding, no browser error and no failed request. `tests/qualification/ui-convergence/synced-journey.mjs` — "syncedJourney" adds touch paragraph conversion, synced-copy insertion/editing and permanent deletion at 1440px in the existing review-request launch. `tests/qualification/ui-convergence/people-journey.mjs` — "peopleJourney" adds directory search, profile edits, hidden expertise and scoped guest people by touch at 1440px.
**Gap.** Touch-only editing remains unproven for block types beyond text, columns and synced paragraphs.

### Notifications

#### NOTIF-001 — Meaningful notifications

Core · published · **partial**

**Requirement.** A member is notified in the app when they are mentioned, when someone comments or replies on a page they watch or authored, when a page they watch is published or republished, when a verification they own lapses (`STAT-004`), when they are granted access to a page or container, and when an AI run they started needs review or failed. Deliver these notices when the triggering event occurs; overdue decision notices go to the decision owner under `DEC-005`. Route an unresolved policy/authority choice to its named owner when the choice blocks action, an actionable paused or failed run to its run owner when it pauses or fails, and a consequential experiment result to its accountable owner when the result is recorded and ready for action. Coalesce related granted maintenance into one concise Today outcome with inspectable changes; routine standing-authorized success and unchanged checks stay quiet and require no fresh approval. Never coalesce away direct mentions, access changes, lapsed human attestations, meaningful failures or required decisions. Own direct actions never notify their actor; delegated events retain the named recipient rules. Recheck recipient access and the authorized output audience at creation, delivery and read; never notify about unreadable records or disclose sources beyond their authorized audience. Preserve `NOTIF-002` inbox behavior, `NOTIF-003` optional link-only chat delivery and `MAIL-001` limited email use.

**Evidence.** `tests/qualification/backend/emitted.mjs`
**Gap.** evidence tests are not loaded by any Verify job or named scheduled job: `tests/qualification/backend/emitted.mjs`.

#### NOTIF-002 — Inbox

Core · published · **partial**

**Requirement.** Notifications are listed newest first, grouped by period, with an unread count and separate views for those addressed to the member and those from watched pages. Opening one marks it read and opens the referenced record at the referenced comment; a member can mark all read and archive read notifications.

**Evidence.** `tests/qualification/core/discovery.mjs`
**Gap.** evidence tests are not loaded by any Verify job or named scheduled job: `tests/qualification/core/discovery.mjs`.

#### NOTIF-003 — Chat notifications

Core · published · **done**

**Requirement.** A workspace owner can connect one chat destination through `chat.notifier.v1` and choose which events reach it. A message carries the event, the actor, the page title and a link, never the page body, and the link still requires access. The connection shows its last delivery and its last failure, retries only transient transport failures, and stops sending the moment it is disconnected; its credential is encrypted with `CONNECTOR_CREDENTIALS_KEY`, returned by no API response, and destroyed on disconnect. A deployment with a chat destination connected and that variable missing fails at startup naming it (`BASE-SECRET-002`) rather than running with the connection off. An expired or revoked authorization marks the connection as needing attention, offers a reconnect action, and stops sending without deleting the connection, its event selection or its delivery history. A Slack destination is one private channel that is not shared with another Slack workspace or organization. Every person in it, apart from deactivated Slack accounts, must have a Slack email that matches an active member of the workspace, and no bot other than the one sending the messages may be in it. Slate refuses to connect a channel that fails this, rechecks it before every send and sends nothing while it fails, and sends a message about an event only when every such person can read what the event links to immediately before sending. In the default `core-wiki` profile the workspace owner can connect a Slack destination by supplying a Slack bot token, with no `CONNECT-001` source connection needed; a destination authorized any other way, such as through a connected Slack source identity, meets every rule in this clause. Target (16 October 2026): `CHAT-001` extends this to any number of Slack, Microsoft Teams and Nook destinations with the same guarantees.

**Evidence.** `tests/e2e/notifications/chat.test.ts` — "NOTIF-003 — chat admission requires fresh authority and keeps link-only delivery inside the current audience"; `tests/qualification/ui-convergence/chat-journey.mjs` (1440/390)
**Gap.** Provider acceptance remains open as stated above.

### Mail

#### MAIL-001 — Outbound only, two kinds

Core · published · **done**

**Requirement.** Slate sends mail only to deliver a sign-in link (`BASE-ACCESS-001`) and an invitation — a member invitation (`WORK-006`) or a guest invitation (`SHARE-006`) — from the configured sender address through `mail.sender.v1`. No product event sends mail, and Slate accepts no inbound mail: a reply to that address creates and changes nothing. Target (16 October 2026): `NOTIF-005` adds notification email and digests that a member opts into, through the same sender; without that opt-in, sign-in and invitation mail remain the only mail Slate sends.

**Evidence.** `tests/flagship/core/mail.test.ts`
**Gap.** None.

#### MAIL-002 — Delivery failure

Core · published · **done**

**Requirement.** A send that fails is retried up to 3 times over 5 minutes when the provider guarantees duplicate suppression for that exact request. With SendGrid, explicit rejection is shown for owner retry; ambiguous transport, expired dispatch ownership, or acceptance without a receipt is durably held for provider review with no automatic or explicit blind resend. A send that still fails or remains uncertain is recorded with a safe provider error and shown to a person — on the sign-in screen for a sign-in link, in settings for an invitation — and is never reported as sent. Managed hosting uses Base’s `rer` adapter with RER-assigned `MAIL_PROVIDER`, `MAIL_FROM`, `MAIL_RELAY_URL` and private `MAIL_API_KEY`; no provider account is needed. Relay HTTP 202 establishes acceptance without a provider message ID. Explicit relay throttling is queued within the existing three-attempt budget, no earlier than Retry-After; other relay rejections are visible failures. Ambiguous relay sends and expired dispatch ownership are held for review without blind resend. A provider receipt establishes acceptance, not inbox delivery.

**Evidence.** `tests/flagship/core/mail.node.test.mts`; `tests/flagship/core/mail.test.ts` ("identity mail preserves durable retry, recovery, authentication and provider custody")
**Gap.** None.

### Activity

#### ACT-001 — Durable timeline

Core · published · **partial**

**Requirement.** Activity is append-only. Each entry records the actor or the feature that acted, the action, the target record, the time, and the operation key, automation run or AI run that caused it. A mutation and its activity entry commit together or not at all.

**Evidence.** `tests/qualification/core/discovery.mjs`
**Gap.** evidence tests are not loaded by any Verify job or named scheduled job: `tests/qualification/core/discovery.mjs`.

#### ACT-002 — Coverage

Core · published · **partial**

**Requirement.** Activity records page creation, body and property changes, publish and unpublish, moves, archive, trash, restore and permanent deletion, version restores and deletions, status and verification changes, grant and external-access changes, comment activity, container and group changes, database structure changes, automation runs, AI runs and their acceptance or rejection, member invitation and removal, import and export.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "Activity records page creation, body and property changes, publish and unpublish, moves, archive, trash, restore and permanent deletion, version restores and deletions, status and verification changes, grant and external-access changes, comment activity, container and group changes, database structure changes, automation runs, AI runs and their acceptance or rejection, member invitation and removal, import and export."

#### ACT-003 — Retrieval

Core · published · **partial**

**Requirement.** Members can filter activity by actor, action, record kind, container and date range, with newest-first pagination that stays stable while new entries arrive, and see only entries about records they may read.

**Evidence.** `tests/qualification/core/discovery.mjs`
**Gap.** evidence tests are not loaded by any Verify job or named scheduled job: `tests/qualification/core/discovery.mjs`.

#### ACT-004 — Context

Core · published · **partial**

**Requirement.** Opening an activity entry opens the record it describes together with the comment thread, revision or grant it references, and changes no entry.

**Evidence.** `tests/qualification/core/discovery-browser.mjs`
**Gap.** evidence tests are not loaded by any Verify job or named scheduled job: `tests/qualification/core/discovery-browser.mjs`.

#### ACT-005 — Retained explanation

Core · published · **partial**

**Requirement.** No member can edit or delete an activity entry. When a described record is erased the entry remains, naming the record kind and time, with personal references anonymized as `BASE-DATA-003` requires.

**Evidence.** `tests/qualification/core/discovery.mjs`
**Gap.** evidence tests are not loaded by any Verify job or named scheduled job: `tests/qualification/core/discovery.mjs`.

### Templates

#### TMPL-001 — Gallery

Core · published · **partial**

**Requirement.** Members can search templates by title and description and filter them by category. A search with no match shows "No templates match this search."

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "Members can search templates by title and description and filter them by category."<br>No validated CI-run proof for this acceptance point: "A search with no match shows "No templates match this search.""

#### TMPL-002 — Preview

Core · published · **partial**

**Requirement.** A template preview shows the page it produces, including its body, properties and any child pages, before it is used. A figure such as a team size or a duration appears only when the template's author wrote one; Slate never estimates, infers, or displays a placeholder for either.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "A template preview shows the page it produces, including its body, properties and any child pages, before it is used."<br>No validated CI-run proof for this acceptance point: "A figure such as a team size or a duration appears only when the template's author wrote one; Slate never estimates, infers, or displays a placeholder for either."

#### TMPL-003 — Snapshot on use

Core · published · **partial**

**Requirement.** Using a template creates a page holding a copy of its body, properties and children in the destination the member chose. Editing, archiving or deleting the template afterwards changes no page already created from it.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "Using a template creates a page holding a copy of its body, properties and children in the destination the member chose."<br>No validated CI-run proof for this acceptance point: "Editing, archiving or deleting the template afterwards changes no page already created from it."

#### TMPL-004 — Custom templates

Core · published · **partial**

**Requirement.** Members can create, edit, archive, restore and delete templates. Templates shipped with Slate cannot be edited or deleted and can be duplicated into an editable copy.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "Members can create, edit, archive, restore and delete templates."<br>No validated CI-run proof for this acceptance point: "Templates shipped with Slate cannot be edited or deleted and can be duplicated into an editable copy."

#### TMPL-005 — Save a page as a template

Core · published · **partial**

**Requirement.** Saving a page as a template copies its body, its properties and, on request, its children. It copies no comment, version, grant, watcher, analytics figure, status or public link.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "Saving a page as a template copies its body, its properties and, on request, its children."<br>No validated CI-run proof for this acceptance point: "It copies no comment, version, grant, watcher, analytics figure, status or public link."

#### TMPL-006 — Where a template lives

Core · published · **partial**

**Requirement.** A template belongs to the workspace or to one container. A container's templates are offered first inside that container and are not offered elsewhere, and moving a template between the two is one action.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "A template belongs to the workspace or to one container."<br>No validated CI-run proof for this acceptance point: "A container's templates are offered first inside that container and are not offered elsewhere, and moving a template between the two is one action."

### Import

#### IMP-001 — Import jobs

Core · published · **done**

**Requirement.** An import is idempotent by operation key (`SAVE-005`), retains its exact supplied original, and names every physical page, database, record, file and version created and every construct it did not map. Notion workspace and Confluence space jobs first show a durable Preview with would-create counts, the complete paged loss report, reviewed principal mappings and measured canonical plan size; Preview creates no target tree. Explicit Apply uses that exact review and commits bounded batches with durable journals. Preparing, Running and Indexing progress survives reload and resumes from its committed checkpoint. Incomplete trees stay inaccessible through all native reads and mutations; the whole native tree becomes visible atomically. Completed requires `PORT-004`. Undo is available after partial or completed Apply: it removes independent unchanged creations, preserves native edits, additions and their required dependencies, and reports each retained conflict as `NATIVE_EDIT_CONFLICT`. Preparation can be canceled without publishing a tree. Failed document imports roll back; interrupted reviewed space imports retain an inaccessible, resumable checkpoint. The original remains downloadable until explicitly deleted or invalidated by privacy erasure. Erasing any imported source under `ARCH-006` invalidates the indivisible retained original and all import recovery custody, makes retry, resume and Undo unavailable with a plain reason, and leaves unaffected native pages in place.

**Evidence.** `tests/e2e/imports/preview-undo.test.ts`
**Gap.** None.

#### IMP-002 — Notion import

Core · published · **done**

**Requirement.** Slate imports a Notion workspace export in its Markdown and CSV form: pages become pages with their tree and titles, icons and covers where the export carries them, page bodies become blocks of the equivalent types, links between exported pages resolve to the imported pages, CSV databases become databases with typed fields and records, and files become media blocks. Every page arrives live, and the report names what did not map. Its test fixture is an export produced by Notion itself, committed with the test; a fixture written by hand does not satisfy this clause, because the construct-by-construct mapping is only tested against what the incumbent actually emits.

**Evidence.** `tests/e2e/imports/real-exports.test.ts`
**Gap.** None.

#### IMP-003 — Confluence import

Core · published · **done**

**Requirement.** Slate imports a Confluence space export in whichever form the product emits — Confluence Cloud's CSV table export, where `content.csv` carries the tree and the version ledger and `bodycontent.csv` carries storage-format bodies, or the single `entities.xml` a Server or Data Center export writes — and single documents in the forms each editor exports: Word's `.docx`, and a Google Docs document downloaded as `.docx` or as zipped HTML, Google Docs having no file form of its own. Pages become pages with their tree, their labels (`PAGE-001`), their versions with their comments and ordinals where the export carries them, their status, and their published state; page and attachment links resolve to the imported records; and named user and group restrictions remain named grants only through explicit reviewed source-principal-ID mappings to existing active same-workspace members or groups. Mapping authority and current membership are validated at Apply and every batch; names and email addresses never activate or implicitly match accounts. Unmapped people remain inactive historical actors. Empty, unknown or unmapped restriction sets preserve restricted inheritance and importing-member recovery access, with unresolved restrictions named in the report. Source edit restrictions conservatively close native inheritance and disclose that conversion. No import publishes an anonymous page. A general grant is container-scoped, never workspace-wide (`SHARE-005`), and a personal container carries no general grant (`SHARE-004`). The report names what did not map, including whiteboards, blogs, calendars and folders, and a folder is imported as a page with an empty body so its tree survives. Its test fixtures are a space export produced by Confluence itself and one document downloaded from each of Word and Google Docs, committed with the test; a fixture written by hand does not satisfy this clause.

**Evidence.** `tests/e2e/imports/real-exports.test.ts`
**Gap.** None.

#### IMP-004 — Import safety

Core · published · **done**

**Requirement.** Imported markup, documents and attachments are validated and sanitized under `BASE-INPUT-001` to `BASE-INPUT-003`. An import fetches nothing from the network: media comes from the archive, and a link to a file the archive does not contain is imported as a link and named in the report.

**Evidence.** `tests/e2e/imports/real-exports.test.ts`
**Gap.** None.

#### IMP-005 — Importing into a page

Core · published · **done**

**Requirement.** A member can import a Markdown, HTML, Word, PDF, EPUB, plain text or CSV document into a page or as a set of pages, mapping its headings to blocks and its tables to tables. The same report and the same safety rules apply.

**Evidence.** `tests/flagship/federation/federation.test.ts`
**Gap.** None.

### Portability

#### PORT-001 — Export contents

Core · published · **done**

**Requirement.** An export contains workspace settings; members, groups and guests; every container, page, database, record, template, comment thread, notification, automation rule, AI run and activity entry as JSON, with each record's revision history and grants; and every uploaded file in its original form.

**Evidence.** `tests/qualification/erasure-metadata/atomic-custody.test.ts` — "Erasure ARCH-006 BASE-DATA-003 PORT-001 PORT-002: atomic page and member custody erasure survives cleanup failure, restore and re-export"
**Gap.** None.

#### PORT-002 — Referential restore

Core · published · **done**

**Requirement.** Importing an archive into an empty deployment restores identifiers, revisions, tree order, grants, links, mentions, comment anchors, public-link slugs and files, so every link from the source deployment resolves to the same record.

**Evidence.** `tests/qualification/erasure-metadata/atomic-custody.test.ts` — "Erasure ARCH-006 BASE-DATA-003 PORT-001 PORT-002: atomic page and member custody erasure survives cleanup failure, restore and re-export"
**Gap.** None.

#### PORT-003 — Visible jobs

Core · published · **partial**

**Requirement.** Export and import show Queued, Running, Completed or Failed with record counts and, on failure, a report naming what failed. A failed job is never shown as complete.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "Export and import show Queued, Running, Completed or Failed with record counts and, on failure, a report naming what failed."<br>No validated CI-run proof for this acceptance point: "A failed job is never shown as complete."

#### PORT-004 — Search rebuild

Core · published · **done**

**Requirement.** An import is not Completed until every imported page and record has its canonical search projection, no imported page has a pending dirty generation, and the records satisfy `SEARCH-001` to `SEARCH-006`. Bounded index rebuilds retain an explicit, resumable Indexing state. Completion is fenced by indexed-ID and dirty-generation readback before any first user search can trigger a lazy refresh.

**Evidence.** `tests/e2e/imports/preview-undo.test.ts`
**Gap.** None.

#### PORT-005 — Access boundary

Core · published · **done**

**Requirement.** An export excludes sessions, sign-in links, pending invitations, stored operation-key responses and provider secrets. An import activates only the member named by `SETUP_OWNER_EMAIL`; every other imported member is an inactive historical actor until invited, and no imported page is published to the anonymous web until a member publishes it.

**Evidence.** `tests/e2e/imports/real-exports.test.ts`
**Gap.** None.

#### PORT-006 — Atomic import

Core · published · **done**

**Requirement.** An import stages records and files outside the live namespace, validates the whole archive, and publishes it in one step. A failed import leaves the deployment empty and can be retried.

**Evidence.** `tests/qualification/authority/atomic-recovery.test.ts`
**Gap.** None.

#### PORT-007 — Exporting a page or a container

Core · published · **done**

**Requirement.** A member can export one page, a page with its descendants, or a whole container as Markdown, HTML or PDF, with records as CSV, in one archive with its media. The export is readable without Slate, and re-importing it under `IMP-005` reproduces the tree. `PORT-010` adds Word `.docx` export of a page or a page with its descendants.

**Evidence.** `tests/flagship/federation/federation.test.ts`
**Gap.** None.

### References and links

#### LINK-001 — Permanent URLs

Core · published · **partial**

**Requirement.** Every page, page revision, container, database, record, comment thread and template has a permanent URL. Renaming a record, moving it, changing its container, archiving it or restoring it never changes that URL, and every existing link, mention, citation, content query and search result continues to resolve to it.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "Every page, page revision, container, database, record, comment thread and template has a permanent URL."<br>No validated CI-run proof for this acceptance point: "Renaming a record, moving it, changing its container, archiving it or restoring it never changes that URL, and every existing link, mention, citation, content query and search result continues to resolve to it."

#### LINK-002 — Tombstones

Core · published · **partial**

**Requirement.** A link to a deleted or erased record resolves to a tombstone naming the record kind and the time it was deleted, not an error page or an empty view, and exposes no erased content or personal metadata.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "A link to a deleted or erased record resolves to a tombstone naming the record kind and the time it was deleted, not an error page or an empty view, and exposes no erased content or personal metadata."

#### LINK-003 — References follow their target

Core · published · **partial**

**Requirement.** A mention or link to another record renders that record's current title and state, follows renames and moves, and is labeled archived, trashed or deleted rather than removed when its target is.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "A mention or link to another record renders that record's current title and state, follows renames and moves, and is labeled archived, trashed or deleted rather than removed when its target is."

#### LINK-004 — Links respect access

Core · published · **partial**

**Requirement.** A mention or link to a record the reader may not open shows that a linked record exists and that access is needed, and shows no title, snippet, icon or author. Requesting access is one action that notifies a member who can grant it.

**Evidence.** `tests/qualification/backend/emitted.mjs`
**Gap.** evidence tests are not loaded by any Verify job or named scheduled job: `tests/qualification/backend/emitted.mjs`.

### AI

#### AI-001 — Enablement

Core · published · **partial**

**Requirement.** AI is off until an AI provider is configured (`ai.provider.v1`) and a workspace owner turns AI on in settings, which is recorded in activity. While AI is off no run can be started and no request reaches a provider.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "AI is off until an AI provider is configured (`ai.provider.v1`) and a workspace owner turns AI on in settings, which is recorded in activity."<br>No validated CI-run proof for this acceptance point: "While AI is off no run can be started and no request reaches a provider."

#### AI-002 — Run lifecycle

Core · published · **partial**

**Requirement.** A member can start selection edits, summaries, workspace answers, agent work and sustained inquiry. Runs move Queued → Running → Needs review or Paused → Running, then Completed, Failed or Canceled. Each Running stage is bounded to ten minutes; exceeding it or encountering an error fails visibly. Scheduled waits and pauses persist their reason and progress and release execution. Any non-terminal run can be canceled. Terminal runs never resume: continued work is a linked new run preserving earlier effects and reconciling ambiguity first. Proposal work completes on explicit acceptance or discard, recording rejection; granted work completes only after every required effect and output check is confirmed. A request created or uncertain effect is not completion.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "A member can start selection edits, summaries, workspace answers, agent work and sustained inquiry."<br>No validated CI-run proof for this acceptance point: "Runs move Queued → Running → Needs review or Paused → Running, then Completed, Failed or Canceled."<br>No validated CI-run proof for this acceptance point: "Each Running stage is bounded to ten minutes; exceeding it or encountering an error fails visibly."<br>No validated CI-run proof for this acceptance point: "Scheduled waits and pauses persist their reason and progress and release execution."<br>No validated CI-run proof for this acceptance point: "Any non-terminal run can be canceled."<br>No validated CI-run proof for this acceptance point: "Terminal runs never resume: continued work is a linked new run preserving earlier effects and reconciling ambiguity first."<br>No validated CI-run proof for this acceptance point: "Proposal work completes on explicit acceptance or discard, recording rejection; granted work completes only after every required effect and output check is confirmed."<br>No validated CI-run proof for this acceptance point: "A request created or uncertain effect is not completion."

#### AI-003 — Proposal or bounded delegation

Core · published · **partial**

**Requirement.** A run produces a proposal unless a current, named, bounded owner grant authorizes the exact effect, target, source scope, audience and conditions. Without that authority no product mutation occurs before member acceptance. Determinate maintenance within that authority commits directly as an attributable revision with sources, checks and receipt; it does not demand repeated ritual approval. Consequential business choices and out-of-grant effects remain pending for the accountable authority. No output approves itself.

**Evidence.** `src/core/features/ai/routes.ts`
**Gap.** flagship opt-in only; no journey

#### AI-004 — Answer provenance

Core · published · **partial**

**Requirement.** Every generated answer, summary and agent output names the pages and revisions it drew on, and each citation opens that revision (`REV-005`). A statement Slate cannot cite is labeled as unsourced and is never presented as drawn from the workspace.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "Every generated answer, summary and agent output names the pages and revisions it drew on, and each citation opens that revision (`REV-005`)."<br>No validated CI-run proof for this acceptance point: "A statement Slate cannot cite is labeled as unsourced and is never presented as drawn from the workspace."

#### AI-005 — Acceptance and granted mutation

Core · published · **partial**

**Requirement.** Accepting a proposal applies only selected changes and records accepting member, changes, input revisions, provider and model. Delegated mutation records the exact grant and issuing owner instead of inventing an accepting person. Local mutations, revisions, receipts and activity commit together or not at all. Remote effects retain durable intent and confirmed receipts, never a claim of cross-provider atomicity. Accepted business decisions stay explicit and immutable under DEC-003.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "Accepting a proposal applies only selected changes and records accepting member, changes, input revisions, provider and model."<br>No validated CI-run proof for this acceptance point: "Delegated mutation records the exact grant and issuing owner instead of inventing an accepting person."<br>No validated CI-run proof for this acceptance point: "Local mutations, revisions, receipts and activity commit together or not at all."<br>No validated CI-run proof for this acceptance point: "Remote effects retain durable intent and confirmed receipts, never a claim of cross-provider atomicity."<br>No validated CI-run proof for this acceptance point: "Accepted business decisions stay explicit and immutable under DEC-003."

#### AI-006 — Current inputs before use

Core · published · **partial**

**Requirement.** Before acceptance, resume or effect, recheck source revisions, current source/requester/audience/destination access, applicability, authority and live operational state. Show material changes and the reason for proceeding. A member may regenerate or explicitly accept against current revisions; an agent may regenerate and rebase a determinate step within its unchanged valid grant. Changed business decisions, applicability, permissions or effect scope require the corresponding authority or review. Never silently commit stale content.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "Before acceptance, resume or effect, recheck source revisions, current source/requester/audience/destination access, applicability, authority and live operational state."<br>No validated CI-run proof for this acceptance point: "Show material changes and the reason for proceeding."<br>No validated CI-run proof for this acceptance point: "A member may regenerate or explicitly accept against current revisions; an agent may regenerate and rebase a determinate step within its unchanged valid grant."<br>No validated CI-run proof for this acceptance point: "Changed business decisions, applicability, permissions or effect scope require the corresponding authority or review."<br>No validated CI-run proof for this acceptance point: "Never silently commit stale content."

#### AI-007 — Untrusted content

Core · published · **partial**

**Requirement.** Text inside pages, blocks, comments, imported documents, link cards and uploaded files is treated as content, never as instructions: it cannot change a run's scope, tools, destination records, agent permissions or the member's selections.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "Text inside pages, blocks, comments, imported documents, link cards and uploaded files is treated as content, never as instructions: it cannot change a run's scope, tools, destination records, agent permissions or the member's selections."

#### AI-008 — Failure preserves confirmed work

Core · published · **partial**

**Requirement.** Provider, budget, schema or output failure leaves a Failed run; cancellation leaves Canceled, with readable reason and manual actions available. The failed or canceled local stage creates no partial proposal or product mutation. Durable intent, audit and earlier completed stages and confirmed external receipts remain. Cancel unsent future work, reconcile dispatched ambiguity, and display completed effects and unresolved state. Compensation is a separate supported operation with its own valid grant; never assert an external rollback.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "Provider, budget, schema or output failure leaves a Failed run; cancellation leaves Canceled, with readable reason and manual actions available."<br>No validated CI-run proof for this acceptance point: "The failed or canceled local stage creates no partial proposal or product mutation."<br>No validated CI-run proof for this acceptance point: "Durable intent, audit and earlier completed stages and confirmed external receipts remain."<br>No validated CI-run proof for this acceptance point: "Cancel unsent future work, reconcile dispatched ambiguity, and display completed effects and unresolved state."<br>No validated CI-run proof for this acceptance point: "Compensation is a separate supported operation with its own valid grant; never assert an external rollback."

#### AI-009 — Retry

Core · published · **partial**

**Requirement.** Only transient transport failures are retried, at most 3 attempts over 5 minutes; invalid or unusable output is never retried automatically. A provider response received twice for one run produces one proposal.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "Only transient transport failures are retried, at most 3 attempts over 5 minutes; invalid or unusable output is never retried automatically."<br>No validated CI-run proof for this acceptance point: "A provider response received twice for one run produces one proposal."

#### AI-010 — Usage record

Core · published · **partial**

**Requirement.** Every run records the provider, model, tokens or provider units, calculated cost, duration, status, and the feature that started it. Totals are shown in settings by day and by feature.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "Every run records the provider, model, tokens or provider units, calculated cost, duration, status, and the feature that started it."<br>No validated CI-run proof for this acceptance point: "Totals are shown in settings by day and by feature."

#### AI-011 — No self-granted authority

Core · published · **partial**

**Requirement.** AI cannot grant itself authority, change membership, access grants, external-access switches or policy values, set or renew human verification, or accept a business decision for an unappointed owner. Publishing, unpublishing, archive, trash, deletion and external effects require either the responsible member action or an explicit bounded, revocable owner grant naming the exact effect, target or named update class, conditions, audience, expiry and budget. Missing, expired, narrowed, changed-target or revoked grants refuse the effect. A general goal, service credential, confidence or source text supplies no grant. Container vetoes, private drafts and source-audience rights cannot be overridden. Other products retain their stricter human-send and consent contracts.

**Evidence.** `src/core/features/ai/routes.ts`
**Gap.** flagship opt-in only; no journey

#### AI-012 — Durable budgets

Core · published · **partial**

**Requirement.** AI enablement requires an owner-set positive workspace calendar-month budget. Before queueing work, durably reserve its maximum estimated provider cost, including bounded input/output, retries and tool units at recorded rates, against that ceiling and all applicable skill, run and provider limits. Count unfinished and paused reservations; persist accounting across restart and concurrent admissions. Recheck changed prices and additional stages before dispatch. Refuse before any provider side effect when any limit is exhausted; record actual units/cost and release unused reservations on settlement. No model, policy, extension or agent raises, waives or defers an owner ceiling.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "AI enablement requires an owner-set positive workspace calendar-month budget."<br>No validated CI-run proof for this acceptance point: "Before queueing work, durably reserve its maximum estimated provider cost, including bounded input/output, retries and tool units at recorded rates, against that ceiling and all applicable skill, run and provider limits."<br>No validated CI-run proof for this acceptance point: "Count unfinished and paused reservations; persist accounting across restart and concurrent admissions."<br>No validated CI-run proof for this acceptance point: "Recheck changed prices and additional stages before dispatch."<br>No validated CI-run proof for this acceptance point: "Refuse before any provider side effect when any limit is exhausted; record actual units/cost and release unused reservations on settlement."<br>No validated CI-run proof for this acceptance point: "No model, policy, extension or agent raises, waives or defers an owner ceiling."

#### AI-013 — Requester and audience boundary

Core · published · **partial**

**Requirement.** Every generated answer, summary, chat reply and agent output uses only sources currently authorized for the asking member, owner policy and task scope. This includes external sources and investigators using broader service credentials. Background work declares an authorized output audience and destination before execution; every source must permit that audience and executing identity. Recheck every contributor before fan-in, generation, write, delivery, resume and later read of persisted output. Changed or uncertain ACLs, source/requester/audience/destination rights withhold or invalidate derived artifacts, including caches, embeddings, transcripts and proposals; no titles, counts, hints or citations disclose restricted facts. Revoked, archived, trashed and another member’s draft content is excluded without reindexing. Credentials supply capability, never disclosure authority. LIFE-002 and source deletion rules remain absolute under every policy.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "Every generated answer, summary, chat reply and agent output uses only sources currently authorized for the asking member, owner policy and task scope."<br>No validated CI-run proof for this acceptance point: "This includes external sources and investigators using broader service credentials."<br>No validated CI-run proof for this acceptance point: "Background work declares an authorized output audience and destination before execution; every source must permit that audience and executing identity."<br>No validated CI-run proof for this acceptance point: "Recheck every contributor before fan-in, generation, write, delivery, resume and later read of persisted output."<br>No validated CI-run proof for this acceptance point: "Changed or uncertain ACLs, source/requester/audience/destination rights withhold or invalidate derived artifacts, including caches, embeddings, transcripts and proposals; no titles, counts, hints or citations disclose restricted facts."<br>No validated CI-run proof for this acceptance point: "Revoked, archived, trashed and another member’s draft content is excluded without reindexing."<br>No validated CI-run proof for this acceptance point: "Credentials supply capability, never disclosure authority."<br>No validated CI-run proof for this acceptance point: "LIFE-002 and source deletion rules remain absolute under every policy."

#### AI-014 — Scoped agents

Core · published · **partial**

**Requirement.** An agent is an auditable named record with instructions, owner, represented identity, exact source and effect scopes, audiences and destinations. Interactive access never exceeds current invoking-member access; background work follows AI-013. Writes follow AI-003 and AI-011. Owner policy bounds providers/models, skill/run/provider budgets and permitted effects; Slate routes automatically by measured task fit within it. Runs name actor, audience, agent, exact skill revision, provider/model and cost. No model selector or agent-management chore is required for ordinary work.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "An agent is an auditable named record with instructions, owner, represented identity, exact source and effect scopes, audiences and destinations."<br>No validated CI-run proof for this acceptance point: "Interactive access never exceeds current invoking-member access; background work follows AI-013."<br>No validated CI-run proof for this acceptance point: "Writes follow AI-003 and AI-011."<br>No validated CI-run proof for this acceptance point: "Owner policy bounds providers/models, skill/run/provider budgets and permitted effects; Slate routes automatically by measured task fit within it."<br>No validated CI-run proof for this acceptance point: "Runs name actor, audience, agent, exact skill revision, provider/model and cost."<br>No validated CI-run proof for this acceptance point: "No model selector or agent-management chore is required for ordinary work."

#### AI-015 — Workspace answers

Core · published · **partial**

**Requirement.** A chat panel answers questions over the workspace, keeps the conversation, cites its sources (`AI-004`), and places the same generated answer above search results with the same citations and the same caveat. It answers "I could not find that in what you can read" rather than answering from the model alone.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "A chat panel answers questions over the workspace, keeps the conversation, cites its sources (`AI-004`), and places the same generated answer above search results with the same citations and the same caveat."<br>No validated CI-run proof for this acceptance point: "It answers "I could not find that in what you can read" rather than answering from the model alone."

#### AI-016 — Summaries

Core · published · **partial**

**Requirement.** A member can summarize a page, its comments or a difference between two revisions. The result names exact revisions and may be copied, proposed for insertion, or inserted directly when the member’s request explicitly authorizes that exact insertion or a valid bounded grant covers it. Current access, destination rights, revisions and atomic receipts still apply; an ordinary request to summarize does not authorize unrelated edits.

**Evidence.** `src/core/features/ai/routes.ts`
**Gap.** flagship opt-in only; no journey

#### AI-017 — Writing with AI

Core · published · **partial**

**Requirement.** With text selected, a member can run a named action — improve, shorten, lengthen, proofread, explain, translate, change tone — or a free-form instruction. The result is shown against the selection with insert below, replace, refine and discard, and nothing changes until one is chosen.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "With text selected, a member can run a named action — improve, shorten, lengthen, proofread, explain, translate, change tone — or a free-form instruction."<br>No validated CI-run proof for this acceptance point: "The result is shown against the selection with insert below, replace, refine and discard, and nothing changes until one is chosen."

### Decisions

#### DEC-001 — A decision is a layer over a page

Core · published · **partial**

**Requirement.** A page can carry one decision record: a question, the options considered, an outcome, a rationale, an owner, a decided date, an optional review date, and citations to page revisions (`REV-005`). The page stays a page: its body, comments, grants, versions and links are unchanged, and removing the decision record leaves the page intact.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "A page can carry one decision record: a question, the options considered, an outcome, a rationale, an owner, a decided date, an optional review date, and citations to page revisions (`REV-005`)."<br>No validated CI-run proof for this acceptance point: "The page stays a page: its body, comments, grants, versions and links are unchanged, and removing the decision record leaves the page intact."

#### DEC-002 — States

Core · published · **partial**

**Requirement.** A decision is Proposed, Accepted or Superseded. Proposed becomes Accepted, an Accepted decision is superseded by another decision, and Superseded is terminal. Every transition records the actor and the time and appears in activity.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "A decision is Proposed, Accepted or Superseded."<br>No validated CI-run proof for this acceptance point: "Proposed becomes Accepted, an Accepted decision is superseded by another decision, and Superseded is terminal."<br>No validated CI-run proof for this acceptance point: "Every transition records the actor and the time and appears in activity."

#### DEC-003 — An accepted decision is immutable

Core · published · **partial**

**Requirement.** Accepting freezes the decision's content together with the revisions it cites. Later edits to a cited page add a warning that the citation is no longer current and never rewrite the accepted rationale; changing an accepted decision is done by superseding it, which links both decisions in both directions.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "Accepting freezes the decision's content together with the revisions it cites."<br>No validated CI-run proof for this acceptance point: "Later edits to a cited page add a warning that the citation is no longer current and never rewrite the accepted rationale; changing an accepted decision is done by superseding it, which links both decisions in both directions."

#### DEC-004 — Decision log

Core · published · **partial**

**Requirement.** Decisions are listed and filtered by state, container, owner, decided date, review date and whether their citations are current, and each result opens the exact accepted revision.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "Decisions are listed and filtered by state, container, owner, decided date, review date and whether their citations are current, and each result opens the exact accepted revision."

#### DEC-005 — Review dates

Core · published · **partial**

**Requirement.** A review date that passes labels the decision overdue and notifies its owner (`NOTIF-001`) until a member records a completed review — a note, an actor, a time and the next review date — or supersedes the decision. An overdue decision stays Accepted.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "A review date that passes labels the decision overdue and notifies its owner (`NOTIF-001`) until a member records a completed review — a note, an actor, a time and the next review date — or supersedes the decision."<br>No validated CI-run proof for this acceptance point: "An overdue decision stays Accepted."

#### DEC-006 — A proposed decision is editable

Core · published · **partial**

**Requirement.** While a decision is Proposed, a member with edit access on its page can change its question, options, outcome, rationale, owner, decided date, review date and citations. Each change writes a revision (`REV-001`) keeping the previous content with its actor and time, resubmitting an unchanged proposal writes no revision, and the history is readable under `REV-002`. Accepting the decision ends this, and `DEC-003` governs from then on.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "While a decision is Proposed, a member with edit access on its page can change its question, options, outcome, rationale, owner, decided date, review date and citations."<br>No validated CI-run proof for this acceptance point: "Each change writes a revision (`REV-001`) keeping the previous content with its actor and time, resubmitting an unchanged proposal writes no revision, and the history is readable under `REV-002`."<br>No validated CI-run proof for this acceptance point: "Accepting the decision ends this, and `DEC-003` governs from then on."

### Full flagship and sustained inquiry

#### SUG-001 — Anchored suggestions

Core · published · **partial**

**Requirement.** Members with comment or edit access can propose a typed change as a separate record anchored to an exact page/block revision, inspect its diff and discuss it. A suggestion changes neither working page/block content nor published content before explicit acceptance under `SUG-002`. Preserve author, time, original text and exact revision; inaccessible anchors disclose no content. Direct granted maintenance remains a separate attributable revision path under `AI-003`/`AI-005`, not suggestion acceptance or a forced review queue.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "Members with comment or edit access can propose a typed change as a separate record anchored to an exact page/block revision, inspect its diff and discuss it."<br>No validated CI-run proof for this acceptance point: "A suggestion changes neither working page/block content nor published content before explicit acceptance under `SUG-002`."<br>No validated CI-run proof for this acceptance point: "Preserve author, time, original text and exact revision; inaccessible anchors disclose no content."<br>No validated CI-run proof for this acceptance point: "Direct granted maintenance remains a separate attributable revision path under `AI-003`/`AI-005`, not suggestion acceptance or a forced review queue."

#### SUG-002 — Resolve explicitly

Core · published · **partial**

**Requirement.** An authorized editor accepts selected suggestions atomically with a new revision/activity/receipt or rejects them with attribution. Recheck current access and revision; conflicting or lost anchors require explicit rebase/review, never silent application. Suggestion history survives reload and export.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "An authorized editor accepts selected suggestions atomically with a new revision/activity/receipt or rejects them with attribution."<br>No validated CI-run proof for this acceptance point: "Recheck current access and revision; conflicting or lost anchors require explicit rebase/review, never silent application."<br>No validated CI-run proof for this acceptance point: "Suggestion history survives reload and export."

#### SOURCE-001 — Connector contract

Core · published · **partial**

**Requirement.** Each connected source declares provider/tenant identity, owner, represented principals, scopes, supported effects, ACL mapping or named service identity, discovery coverage, cursor, last success/error, freshness and lag, deletion/revocation and retention guarantees. Unsupported guarantees are visibly unavailable. Multiple real document, collaboration/evidence and operational connector families are required.

**Evidence.** `tests/flagship/release-clauses/federation/connector-disclosure.test.ts`
**Gap.** flagship opt-in only (FEATURE_DISABLED in core-wiki)

#### SOURCE-002 — Exact passages

Core · published · **partial**

**Requirement.** Retain immutable source-native IDs, revision/hash, observed and source times, permitted originals or restorable references, extraction version and stable passage anchors. Citations open that exact revision or a content-free tombstone, never silently newest content.

**Evidence.** `tests/flagship/release-clauses/federation/exact-passages.test.ts`
**Gap.** flagship opt-in only (FEATURE_DISABLED in core-wiki)

#### SOURCE-003 — Scoped claims and authority

Core · published · **partial**

**Requirement.** Claims retain proposition, exact passages, kind, account/product/plan/audience/jurisdiction scope, effective/expiry interval, owner, verification, conflict and unknown state. Record named approving person or delegated office and applicable authority separately. Recency, popularity, model confidence and conversational evidence cannot create policy authority.

**Evidence.** `tests/qualification/authority/decision-authority.test.ts`
**Gap.** flagship opt-in only (FEATURE_DISABLED in core-wiki)

#### SOURCE-004 — Live observations

Core · published · **partial**

**Requirement.** Operational state is a typed response from its owning system with tenant/account identity, observation time and freshness. Documents cannot substitute for live entitlement or activation. Reconcile contradictions by scope, authority and effective dates; preserve unknown prices, expiry and unsupported facts.

**Evidence.** `tests/qualification/authority/native-boundaries.test.ts`
**Gap.** flagship opt-in only (FEATURE_DISABLED in core-wiki)

#### SOURCE-005 — Revocation and deletion

Core · published · **partial**

**Requirement.** Source changes trace dependent claims, decisions, answers, skills and runs. Revoke access immediately at every use boundary, invalidate derived content and indexes, remove deleted material from exports and retain only permitted tombstones. Uncertain source ACLs fail closed. Partial indexing and lag remain visible.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "Source changes trace dependent claims, decisions, answers, skills and runs."<br>No validated CI-run proof for this acceptance point: "Revoke access immediately at every use boundary, invalidate derived content and indexes, remove deleted material from exports and retain only permitted tombstones."<br>No validated CI-run proof for this acceptance point: "Uncertain source ACLs fail closed."<br>No validated CI-run proof for this acceptance point: "Partial indexing and lag remain visible."

#### SOURCE-006 — Credential lifecycle

Core · published · **partial**

**Requirement.** Credentials name issuer/owner, represented identity, scope/destinations, expiry and revocation. Disconnect blocks new dispatch, suspends queued/paused work, stops active work at a safe boundary and cancels unsent effects. Dispatched uncertainty remains unresolved until authorized read-back. Reconnect verifies identity, scopes, ACLs/deletions/revisions and each run/audience; old authority is never inherited automatically.

**Evidence.** `tests/qualification/authority/disconnect.test.ts` — "SOURCE-006 — OAuth redirects preserve authorization codes and disconnect withdraws executable authority without reactivation"
**Gap.** flagship opt-in only (FEATURE_DISABLED in core-wiki)

#### SKILL-001 — Versioned procedure

Core · published · **partial**

**Requirement.** Skills retain owner, immutable version, instructions, preconditions, context/source scope, allowed semantic tools and exact effects/targets, budgets, expected outputs/checks and escalation conditions. Runs pin exact versions; export SKILL.md and attachments as labeled snapshots, not live synchronization.

**Evidence.** `tests/qualification/authority/skill-disclosure.test.ts` — "SKILL-001 — method disclosure and portable snapshots retain exact source, audience and attachment boundaries"
**Gap.** flagship opt-in only (FEATURE_DISABLED in core-wiki)

#### SKILL-002 — Evaluation and activation

Core · published · **partial**

**Requirement.** Draft → evaluated → active → superseded/retired lifecycle retains domain outcome and forbidden-effect evaluations, contradictions, stale inputs, outages, permission boundaries and prior accepted cases. Failed evaluation cannot activate. Activation requires owner action or exact recorded standing authority for evaluated routine refinement; it cannot widen sources/effects/audiences/budgets or change policy.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "Draft → evaluated → active → superseded/retired lifecycle retains domain outcome and forbidden-effect evaluations, contradictions, stale inputs, outages, permission boundaries and prior accepted cases."<br>No validated CI-run proof for this acceptance point: "Failed evaluation cannot activate."<br>No validated CI-run proof for this acceptance point: "Activation requires owner action or exact recorded standing authority for evaluated routine refinement; it cannot widen sources/effects/audiences/budgets or change policy."

#### SKILL-003 — Version transitions

Core · published · **partial**

**Requirement.** Superseded/retired versions cannot start runs. Suspend queued/paused pinned runs and active work at boundaries by default; direct or applicable standing authority may cancel, continue the exact version or create a linked successor. Recheck all current sources/grants; stop and revocation override continuation. Preserve immutable history and receipts, reconcile ambiguity and never silently substitute versions. Notify subscribed external agents of changes.

**Evidence.** `tests/qualification/authority/skill-disclosure.test.ts`
**Gap.** flagship opt-in only (FEATURE_DISABLED in core-wiki)

#### EFFECT-001 — Durable effects

Core · published · **partial**

**Requirement.** Before external dispatch persist intent, exact semantic operation, principal/account/target, grant, source revisions and idempotency key. Distinguish prepared, dispatched, uncertain, confirmed, failed and canceled. Reconcile lost responses by provider key or read-back; no blind repeat while uncertain and no success without receipt or verified state transition.

**Evidence.** `tests/qualification/release-restore-authority/restored-effects.test.ts`
**Gap.** flagship opt-in only (FEATURE_DISABLED in core-wiki)

#### EFFECT-002 — Consent and product custody

Core · published · **partial**

**Requirement.** An inquiry causes no account/charge effect even if a tool grant exists. Paid SSO activation separately requires account-authorized consent, current price/interval/discount scope/expiry, applicable commercial approval, verified purchase/entitlement and exact activation grant. Distinguish request creation, customer setup pending and confirmed enabled. Article repair has independent publication authority. HappyToHelp owns conversations/replies and Orbit owns CRM/outreach, including their exact-human-send boundaries.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "An inquiry causes no account/charge effect even if a tool grant exists."<br>No validated CI-run proof for this acceptance point: "Paid SSO activation separately requires account-authorized consent, current price/interval/discount scope/expiry, applicable commercial approval, verified purchase/entitlement and exact activation grant."<br>No validated CI-run proof for this acceptance point: "Distinguish request creation, customer setup pending and confirmed enabled."<br>No validated CI-run proof for this acceptance point: "Article repair has independent publication authority."<br>No validated CI-run proof for this acceptance point: "HappyToHelp owns conversations/replies and Orbit owns CRM/outreach, including their exact-human-send boundaries."

#### EFFECT-003 — Impact and maintenance

Core · published · **partial**

**Requirement.** Prepare read-only impact rehearsal before policy acceptance, identifying affected accounts/exceptions and dependent answers, procedures, skills and open work. Preserve immutable decisions; apply only determinate granted repairs, evaluate changed skills, invalidate stale answers and coalesce outcomes. Unaffected scoped exceptions stay scoped. Simulation is labeled read-only/isolated and never proof of live effects.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "Prepare read-only impact rehearsal before policy acceptance, identifying affected accounts/exceptions and dependent answers, procedures, skills and open work."<br>No validated CI-run proof for this acceptance point: "Preserve immutable decisions; apply only determinate granted repairs, evaluate changed skills, invalidate stale answers and coalesce outcomes."<br>No validated CI-run proof for this acceptance point: "Unaffected scoped exceptions stay scoped."<br>No validated CI-run proof for this acceptance point: "Simulation is labeled read-only/isolated and never proof of live effects."

#### AGENT-001 — Semantic parity

Core · published · **partial**

**Requirement.** UI, API and MCP expose the same authorized reads, exact citations, proposals, granted effects, run status, pause/resume, stop and outcomes, with operation keys, current ACL/grant checks and receipts. External identities cannot bypass browser or product consent boundaries. Unsupported operations fail explicitly.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "UI, API and MCP expose the same authorized reads, exact citations, proposals, granted effects, run status, pause/resume, stop and outcomes, with operation keys, current ACL/grant checks and receipts."<br>No validated CI-run proof for this acceptance point: "External identities cannot bypass browser or product consent boundaries."<br>No validated CI-run proof for this acceptance point: "Unsupported operations fail explicitly."

#### AGENT-002 — Portable owner interfaces

Core · published · **partial**

**Requirement.** Task/inquiry/experiment views derive from durable records, skill schemas and grants and preserve the accepted editor/tree/comments/history. Interface definitions are source-controlled or exportable. Owners can customize source/core/schema/UI/providers without losing data, skills, decisions, runs, interface definitions or migration history; no vendor kill switch or required proprietary hosted data account.

**Evidence.** `tests/flagship/release-clauses/portability/owner-views.test.ts`
**Gap.** flagship opt-in only (FEATURE_DISABLED in core-wiki)

#### INQ-001 — Open questions

Core · published · **partial**

**Requirement.** An outcome request prepares an inquiry with decision context, rival hypotheses, discriminating observations, unresolved dependencies and independent investigations. Preserve useful interim findings, falsified hypotheses, uncertainty, next informative step and cost across bounded stages and durable waits. Members inspect/correct scope or stop work without designing schemas or coordinating agents.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "An outcome request prepares an inquiry with decision context, rival hypotheses, discriminating observations, unresolved dependencies and independent investigations."<br>No validated CI-run proof for this acceptance point: "Preserve useful interim findings, falsified hypotheses, uncertainty, next informative step and cost across bounded stages and durable waits."<br>No validated CI-run proof for this acceptance point: "Members inspect/correct scope or stop work without designing schemas or coordinating agents."

#### INQ-002 — Reproducible reasoning

Core · published · **partial**

**Requirement.** Retain observations, assumptions, deductions and business choices separately, with population/applicability, counterexamples, failed hypotheses, executable analysis inputs/code/tool versions and results sufficient for independent replay. No private reasoning transcript is required. Checked logical propositions state bounds and checker versions; exact arithmetic/feasibility is not causal customer evidence.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "Retain observations, assumptions, deductions and business choices separately, with population/applicability, counterexamples, failed hypotheses, executable analysis inputs/code/tool versions and results sufficient for independent replay."<br>No validated CI-run proof for this acceptance point: "No private reasoning transcript is required."<br>No validated CI-run proof for this acceptance point: "Checked logical propositions state bounds and checker versions; exact arithmetic/feasibility is not causal customer evidence."

#### INQ-003 — Bounded planning

Core · published · **partial**

**Requirement.** Prepare objectives, constraints, allocations, sensitivity and counterexamples from current evidence. Code checks arithmetic and invariants; retain assumptions and accepting owner. A feasible allocation is not proof of benefit. Methods and contextual interfaces are prepared from the request rather than assigned as setup chores.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "Prepare objectives, constraints, allocations, sensitivity and counterexamples from current evidence."<br>No validated CI-run proof for this acceptance point: "Code checks arithmetic and invariants; retain assumptions and accepting owner."<br>No validated CI-run proof for this acceptance point: "A feasible allocation is not proof of benefit."<br>No validated CI-run proof for this acceptance point: "Methods and contextual interfaces are prepared from the request rather than assigned as setup chores."

#### INQ-004 — Routing and ambient discovery

Core · published · **partial**

**Requirement.** Typed semantic checks assess relevant permitted events for novelty, contradiction and impact and prepare consequential questions. Owner questions and scheduled frontier sweeps bypass ranking; shadow comparisons and sampled low-score audits measure missed important events. Routing follows measured fit within owner policy, never grants authority or fabricates a fallback after invalid output.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "Typed semantic checks assess relevant permitted events for novelty, contradiction and impact and prepare consequential questions."<br>No validated CI-run proof for this acceptance point: "Owner questions and scheduled frontier sweeps bypass ranking; shadow comparisons and sampled low-score audits measure missed important events."<br>No validated CI-run proof for this acceptance point: "Routing follows measured fit within owner policy, never grants authority or fabricates a fallback after invalid output."

#### INQ-005 — Economical sustained work

Core · published · **partial**

**Requirement.** Deduplicate overlapping work only within an authorized audience and reuse revision-pinned context only after freshness/applicability/access checks. Budget compute and interruptions, keep meaningful progress inspectable and routine checks quiet. Stop branches with no useful information, exhausted budget or inaccessible evidence with reason/restart condition; independent authorized branches may continue.

**Evidence.** `tests/qualification/authority/learned-provenance.test.ts`
**Gap.** flagship opt-in only (FEATURE_DISABLED in core-wiki)

#### TRIAL-001 — Predeclared comparison

Core · published · **partial**

**Requirement.** Before any trial effect, durably record eligibility, treatment/comparison assignment, baseline/instrumentation, forecast, expected and smallest meaningful effect, required precision, observation window, stopping conditions, guardrails, owner authority and exact effects. Prefer defensible randomization when feasible and disclose confounding otherwise. Changing a plan creates a revision, never retroactive predeclaration.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "Before any trial effect, durably record eligibility, treatment/comparison assignment, baseline/instrumentation, forecast, expected and smallest meaningful effect, required precision, observation window, stopping conditions, guardrails, owner authority and exact effects."<br>No validated CI-run proof for this acceptance point: "Prefer defensible randomization when feasible and disclose confounding otherwise."<br>No validated CI-run proof for this acceptance point: "Changing a plan creates a revision, never retroactive predeclaration."

#### TRIAL-002 — Exposure and safety

Core · published · **partial**

**Requirement.** Only owning systems perform granted changes; retain attempted versus confirmed effects, receipts, actual exposure, missing observations and instrumentation changes. Guardrail breaches stop future effects and initiate only separately authorized supported recovery. Prospective windows must actually elapse; fixtures or simulated time are not prospective outcome evidence.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "Only owning systems perform granted changes; retain attempted versus confirmed effects, receipts, actual exposure, missing observations and instrumentation changes."<br>No validated CI-run proof for this acceptance point: "Guardrail breaches stop future effects and initiate only separately authorized supported recovery."<br>No validated CI-run proof for this acceptance point: "Prospective windows must actually elapse; fixtures or simulated time are not prospective outcome evidence."

#### TRIAL-003 — Outcome classification

Core · published · **partial**

**Requirement.** At the declared window classify benefit, null, adverse or inconclusive against the predeclared comparison and guardrails, with uncertainty, applicability, selection bias and measurement quality. Null counts against a mechanism only with enough precision to rule out the meaningful effect; incomplete exposure or changed instrumentation may be inconclusive. Never substitute model agreement for empirical evidence.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "At the declared window classify benefit, null, adverse or inconclusive against the predeclared comparison and guardrails, with uncertainty, applicability, selection bias and measurement quality."<br>No validated CI-run proof for this acceptance point: "Null counts against a mechanism only with enough precision to rule out the meaningful effect; incomplete exposure or changed instrumentation may be inconclusive."<br>No validated CI-run proof for this acceptance point: "Never substitute model agreement for empirical evidence."

#### TRIAL-004 — Reusable learning

Core · published · **partial**

**Requirement.** Every outcome revises explanations and methods while retaining original forecast, decision and failed hypotheses. Learned procedures/prompts/tests/code are versioned and evaluated before owner-authorized activation. No automatic model-weight tuning or cross-deployment sharing. Verify repeated-work savings without invalid assumption reuse.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "Every outcome revises explanations and methods while retaining original forecast, decision and failed hypotheses."<br>No validated CI-run proof for this acceptance point: "Learned procedures/prompts/tests/code are versioned and evaluated before owner-authorized activation."<br>No validated CI-run proof for this acceptance point: "No automatic model-weight tuning or cross-deployment sharing."<br>No validated CI-run proof for this acceptance point: "Verify repeated-work savings without invalid assumption reuse."

#### FLAG-001 — Complete product gate

Core · published · **partial**

**Requirement.** All 191 inherited clauses with only recorded explicit amendments, all 22 baseline obligations, every value of the eight policies, all six USER-JOURNEYS.md journeys, full flagship and complete customer-activation inquiry → experiment → outcome → learning loop are required. No minimum subset, parser/component suite or self-report substitutes for full product acceptance. The core-wiki launch amendment authorizes a separately labeled core-wiki release with the default-disabled surfaces and retained obligations specified in the core-wiki launch amendment. This changes the launch gate only; it does not satisfy or waive full flagship acceptance.

**Evidence.** `tests/flagship/release-clauses/portability/profile-retention.test.ts`
**Gap.** release gate; full flagship and provider evidence pending

#### FLAG-002 — Independent evidence

Core · published · **partial**

**Requirement.** Verify clean install, real browser/Worker journeys, customized owner copy, old-data migrations, restart/failure/revocation, complete export/restore, accessibility and load. Test genuine incumbent exports including Word; use real authorized document, evidence and operational providers for provider acceptance. Separate requirements, local implementation evidence, provider evidence and release/deployment evidence; no claim advances without independent semantic verification.

**Evidence.** `tests/flagship/release-clauses/portability/staged-recovery.test.ts`
**Gap.** release gate; full flagship and provider evidence pending

#### FLAG-003 — Value and held-out evaluation

Core · published · **partial**

**Requirement.** Compare identical accessible sources/tools against expert/current-tools and capable generic-agent baselines and owner-customized Slate. Freeze held-out cases separately from development and prevent future outcomes, later summaries/labels/indexes leaking past decision cutoff. Measure discoveries, falsification, missed-event recall, reproducibility, forecasts/interventions and every attempt’s cost/time/attention, setup, interruptions, failures and repair. Repeated quality-preserving useful outcomes, including null/adverse/inconclusive cases, are required; privacy/authority failures cannot trade for productivity.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "Compare identical accessible sources/tools against expert/current-tools and capable generic-agent baselines and owner-customized Slate."<br>No validated CI-run proof for this acceptance point: "Freeze held-out cases separately from development and prevent future outcomes, later summaries/labels/indexes leaking past decision cutoff."<br>No validated CI-run proof for this acceptance point: "Measure discoveries, falsification, missed-event recall, reproducibility, forecasts/interventions and every attempt’s cost/time/attention, setup, interruptions, failures and repair."<br>No validated CI-run proof for this acceptance point: "Repeated quality-preserving useful outcomes, including null/adverse/inconclusive cases, are required; privacy/authority failures cannot trade for productivity."

#### FLAG-004 — Complete portable knowledge

Core · published · **partial**

**Requirement.** PORT-001/002/005/006 extend to source revisions and passages, claims/authority, skill versions/evaluations/grants, run stages/effect receipts, inquiries/analyses/trials/outcomes/learning and interface definitions with exact lineage. Retain credential metadata but exclude secrets/sessions and require fresh activation/authorization after restore. External state is reported, not recreated by assertion; exact public publishing and imported-actor restrictions remain.

**Evidence.** `tests/qualification/authority/recovery.test.ts`
**Gap.** release gate; full flagship and provider evidence pending

### Writing together

#### COLLAB-001 — Live co-editing by default

Core · target · **partial**

**Requirement.** Two or more members with `edit` access can type in the same page, and in the same block, at the same time. Their characters merge without conflict: there is no 409 and no last-write-wins for concurrent text, and `SAVE-003` conflicts remain only for structural edits that cannot merge, such as editing a block another member deleted, which offers restore. Every accepted operation is durable before it is acknowledged. A member's access is rechecked on every operation. Narrowing or revoking access closes that member's socket within 5 seconds, keeps their unsent text locally as an unsaved draft (`SAVE-004`), and never applies it. Reconnecting replays unacknowledged operations exactly once. Saved means committed (`SAVE-001`).

**Acceptance.**
1. a two-browser journey at 1440 and 390 in which two members type into one paragraph at the same time and both see the same final text within 1 second.
2. It also covers a dropped connection that reconnects with no lost or duplicated characters, and a grant revoked mid-typing that closes the editor within 5 seconds, keeps the draft unsaved and lists no revision for it.
3. A Workers journey sends interleaved operations to the collaboration route and reads back one revision history.

**Evidence.** `src/core/features/collaboration/durable-object.ts`
**Gap.** see the clause

#### COLLAB-002 — Presence, cursors and following

Core · target · **partial**

**Requirement.** A page shows who is viewing and who is editing, with an avatar, a name and a color. Each editor's cursor and selection appear live with their name. Clicking a collaborator follows their viewport, and members idle for more than 5 minutes are shown as idle. Presence reveals only members who can already read the page, and it never appears on the anonymous read view (`WEB-003`).

**Acceptance.**
1. a browser journey with three members in which one sees two named cursors move within 500ms of typing and follows a collaborator to another heading.
2. The anonymous published view of the same page shows no presence.

**Evidence.** `src/core/features/collaboration/service.ts`
**Gap.** see the clause

#### COLLAB-003 — Offline edits that merge

Core · target · **partial**

**Requirement.** Edits made while a client is offline, whether a browser with a cached page (`SAVE-004`) or an offline page in a native app (`MOBILE-003`), merge on reconnect through the same operation path as `COLLAB-001`. They are attributed to their author with their original time. A conflict that cannot merge, such as editing a block another member deleted, is shown with both versions and a restore action, and is never resolved silently.

**Acceptance.**
1. a browser journey takes one client offline, edits three blocks while a second client edits one of them and deletes another, then reconnects.
2. The merged page keeps both edits to the shared block, offers the deleted block for restore, and shows four attributed operations in history.

**Evidence.** `src/core/features/editor/ui/SaveStatus.tsx`
**Gap.** No validated CI-run proof for this acceptance point: "a browser journey takes one client offline, edits three blocks while a second client edits one of them and deletes another, then reconnects."<br>No validated CI-run proof for this acceptance point: "The merged page keeps both edits to the shared block, offers the deleted block for restore, and shows four attributed operations in history."

#### COLLAB-004 — Long pages and heavy tables stay fast

Core · target · **missing**

**Requirement.** A page with 2,000 blocks or a 50 × 500 table opens in under 1.5 seconds at p95 on the reference laptop profile (Chrome with Lighthouse's desktop throttling) and in under 3 seconds on the reference phone profile (Chrome with Lighthouse's mobile throttling: 4× CPU slowdown, 1.6 Mbps and 150ms round trips). With 20 co-editors, typing echoes locally in under 50ms and reaches the others in under 500ms. Table insert, delete, resize and sort complete in under 200ms. The limits are declared in `seed.json → limits`.

**Acceptance.**
1. a scripted load journey against a deployed Worker records keystroke echo and remote-arrival latency with 20 co-editors at the declared limits, and a browser journey under each reference profile records p95 open time for the 2,000-block page and the 50 × 500 table.
2. The runs' raw timings are kept with the release evidence.

**Evidence.** —
**Gap.** not implemented

#### COLLAB-005 — Attributed history from co-editing

Core · target · **partial**

**Requirement.** Co-edited operations become revisions (`REV-001`) that are grouped by time window and list every contributing author. Compare (`REV-004`) colors each change by its author, and restore (`REV-003`) works on any grouped revision.

**Acceptance.**
1. after a two-author session, history lists one revision naming both authors, compare attributes each changed block to its author, and restoring the previous revision brings back the earlier text for both authors.

**Evidence.** `src/core/features/versions/service.ts`
**Gap.** see the clause

#### PAGE-015 — Page lock

Core · target · **done**

**Requirement.** A member with `edit` access can lock a page against accidental edits. Locking is separate from permissions: it changes no grant. A locked page shows a "Locked by name" banner and opens read-only for everyone, and an `edit` member unlocks it in one action. Both acts are recorded in activity. API calls, automations, imports and AI runs respect the lock and refuse with `PAGE_LOCKED`. Comments stay open.

**Acceptance.**
1. a browser journey in which one member locks a page, a second editor sees it read-only with the banner while comments still post, an API update and an automation action on that page refuse with `PAGE_LOCKED`, and unlocking restores editing.
2. Activity shows both acts.

**Evidence.** `tests/profile/page-lock-journey.ts`, `tests/e2e/imports/page-lock.test.ts`, `tests/qualification/ui-convergence/page-lock-journey.mjs`
**Gap.** Native edit, automation and import fences, precise staged-import lock races, unchanged grants, open comments and second-editor unlock proven through Workers and 1440/390 browser journeys.

#### BLOCK-011 — Synced blocks

Core · target · **partial**

**Requirement.** A block can be made synced: its content is defined once and rendered live in many pages, as with Notion synced blocks and Confluence excerpt-include. Editing any copy edits all of them, and each copy names its source page. A reader sees a copy only if they can read the source, and otherwise sees `LINK-004`'s access-needed state. Deleting the source turns each copy into a static block that keeps its last content.

**Acceptance.**
1. a browser journey that syncs a block into two pages, edits one copy and sees the change in the other within 5 seconds.
2. A member without access to the source sees the access-needed state, and deleting the source leaves static copies.

**Evidence.** `tests/e2e/editor/tables.test.ts` — "BLOCK-014 — tables, columns and synced paragraphs preserve structured content through editing, validation, exports and access" calls `tests/e2e/editor/synced-case.ts` (two copies, source edits, stale writes, source edit permission and receipt replay, reader/public/history redaction, static export/re-import and duplication, trash, audience-safe atomic permanent deletion and retained revisions); `tests/qualification/ui-convergence/synced-journey.mjs` — "syncedJourney" in the existing review-request launch at 1440 (make synced, insert two copies, touch edit, other visible copy within five seconds, access-needed state and permanent deletion to static copies; no overflow, serious/critical accessibility finding, browser error or failed request). `tests/qualification/ui-convergence/synced-custody.mjs` — "syncedCustodyJourney", "syncedHistoryJourney" and "syncedMemberErasureJourney" in the existing invitation launch at 1440 prove deletion with unpublished changes, member erasure, source removal/unsync/restore/discard, restricted-reader and trashed-source copy restore, trash labels and live resumption, frozen reader/anonymous audiences, immutable revision-door payloads and content-free deleted-reference restore; `tests/e2e/review/verification-upgrade.test.ts` proves populated c24 synced rows survive migration 0060, and `tests/flagship/release-clauses/portability/profile-retention.test.ts` proves restricted static content and its audience survive native archive restore, refuses a complete archive outside the frozen audience and admits no newly granted reader.
**Gap.** Paragraphs only. Other block kinds and incumbent synced-block imports (Notion synced blocks; Confluence Excerpt, Excerpt Include and Include Page under IMP-010) are not implemented, and the access-needed state offers no LINK-004 access request. Adopted defaults: Copy editing requires edit access to both pages; otherwise the reason is shown. A trashed source shows no content, copies resume on restore, and nothing turns static before permanent deletion. A published copy shows source content anonymously only while the source is published to the same anonymous audience. Export, duplication and templates produce static paragraphs from what the acting reader can read, and re-import stays static.

#### BLOCK-012 — Columns and page layouts

Core · target · **partial**

**Requirement.** A page body can hold 2 to 5 side-by-side columns that blocks can be dragged into. Columns stack in order at phone width. Page export (`PORT-007`) and the Notion and Confluence imports (`IMP-002`, `IMP-003`) preserve the column layout.

**Acceptance.**
1. a browser journey creates a three-column section at 1440 and sees it stack at 390.
2. Importing a Notion export with columns and a Confluence page with a two-column layout reproduces both.

**Evidence.** `tests/e2e/editor/tables.test.ts` — "BLOCK-014 — tables, columns and synced paragraphs preserve structured content through editing, validation, exports and access" calls `tests/e2e/editor/columns-case.ts` (2–5 columns, refused nesting, HTML/Markdown round trips, Notion HTML and Confluence storage layouts, ordered Word content, copies, comments, revisions, public rendering and reader access); `tests/qualification/ui-convergence/columns-journey.mjs` — "columnsJourney" in the existing core-wiki/touch-member launch at 1440px/390px (three columns, native and touch drag into and out of columns, count changes, phone stacking, persistence, overflow and accessibility).
**Gap.** One level only: nested columns are refused. PDF and Word exports flow column content in reading order rather than preserving side-by-side layout.

#### BLOCK-013 — Equations and diagrams as code

Core · target · **missing**

**Requirement.** Inline and block LaTeX equations render with KaTeX, and Mermaid diagram blocks render as SVG. Both are rendered without network access, are sanitized under `BASE-INPUT-002`, are kept as source in Markdown export, and are imported from Notion equation blocks and Confluence code macros. This clause inherits `PORT-010`'s Word obligations when these blocks ship: equations export as OMML or images, and Mermaid diagrams export as images, under the same reader and media access checks.

**Acceptance.**
1. a browser journey that inserts an equation and a Mermaid flowchart, sees both render offline, exports Markdown that contains the source, and re-imports it unchanged.
2. It also exports Word under `PORT-010` and parses the document to verify the equation as OMML or an image and the Mermaid diagram as an image, with no external media relationship.

**Evidence.** —
**Gap.** not implemented

#### BLOCK-014 — Tables that work like tables

Core · target · **done**

**Requirement.** Table blocks support header rows and columns, column widths, merged cells, cell color, and sorting by a column. Rows and columns can be added and removed from the keyboard. Pasting from Excel or Google Sheets keeps rows and columns, and a table converts to a database (`DB-001`) and back without losing cells.

**Acceptance.**
1. a browser journey that pastes a 10 × 20 range copied from a spreadsheet and keeps its shape, merges cells, sorts by a column, converts the table to a database and back, and finds the cells identical.

**Evidence.** `tests/e2e/editor/tables.test.ts`, `tests/qualification/ui-convergence/tables-journey.mjs`
**Gap.** Header rows/columns, widths, colors, rectangular merges, merged-row sorting, keyboard structure edits, quoted 10 × 20 paste and atomic editable database round trips; editor, database, shortcuts and published views at 1440/390.

#### BLOCK-015 — Assigned tasks with due dates

Core · target · **done**

**Requirement.** A task item (`BLOCK-007`) can carry one assignee and a due date. Typing `@` inside a task assigns the member mentioned, and typing `//` or choosing from the date picker sets the due date, which renders in the reader's locale and shows as overdue once it passes. The assignee gets one inbox item when assigned (`NOTIF-001`), by email or push under their delivery settings (`NOTIF-005`, `NOTIF-006`), and one reminder on the due date (`NOTIF-004`). Reassigning notifies the new assignee once and the previous assignee not at all, and an assignee completing their own task notifies no one. Assigning a member who cannot read the page asks the assigner to share the page with them or cancel, and never notifies that member. Completion still records who and when. Tasks are read and changed through the API and MCP (`API-001`, `API-003`) under the same checks. A task item stays a block, and it still never appears in a database view.

**Acceptance.**
1. a browser journey at 1440 and 390 types a task, assigns it with `@` and sets a due date with `//`.
2. The assignee gets exactly one inbox item and, after a Workers journey advances time, exactly one due-date reminder.
3. Reassigning notifies only the new assignee.
4. Assigning a member without access prompts the assigner to share and sends that member nothing.
5. The task shows as overdue after its due date.

**Evidence.** `tests/profile/profile.worker.test.ts`, `tests/qualification/ui-convergence/task-assignment-journey.mjs`
**Gap.** None.

#### BLOCK-016 — Task reports

Core · target · **done**

**Requirement.** A body can hold a task report: a live list of tasks filtered by container, ancestor page, label, assignee (including "the current reader"), creator, due-date range and state, grouped by page, assignee or due date, and ordered and limited by the author. It follows `BLOCK-010`'s rules: it re-runs when the page is opened, shows when it last ran, shows each reader only the tasks on pages that reader can read, never renders a task on a draft (`LIFE-002`), and says so when its source container is deleted. A reader with edit access to a task's page can complete the task from the report. A published page shows a task report as a sign-in notice and never runs it for anonymous readers, so a public view reveals no task, page title or count. Confluence Task Report macros import as task reports with the same filters, carried and proven by `IMP-010`.

**Acceptance.**
1. a browser journey embeds a report filtered to one container and one assignee over tasks on three pages.
2. One reader sees all three tasks.
3. A reader without access to one of the pages sees the other two, with no count, title or placeholder for the third.
4. Completing a task from the report updates its page.
5. Published, the page shows the report as a sign-in notice, and an anonymous reader's view names none of the tasks or pages and makes no API request.

**Evidence.** `tests/profile/work-items-journey.ts`, `tests/qualification/ui-convergence/task-report-journey.mjs`
**Gap.** None.

#### BLOCK-017 — Table of contents block

Core · target · **partial**

**Requirement.** A body can hold a table of contents built from its headings, placed anywhere in the page, with a chosen range of heading levels and a flat or nested style. Like `PAGE-010`'s side outline, it follows the current body within 2 seconds of an edit, and each entry links to its heading. It survives export as a linked list in Markdown, HTML, PDF and Word (`PORT-007`, `PORT-010`), and Confluence's Table of Contents macro imports as this block (`IMP-010`). It is separate from the side outline.

**Acceptance.**
1. a browser journey inserts a table of contents limited to heading levels 1 and 2, adds a heading and sees its entry within 2 seconds, follows an entry to its heading, and exports Markdown that contains the linked list.
2. Importing a Confluence page with a Table of Contents macro produces the block.

**Evidence.** `tests/profile/body-blocks-journey.ts`
**Gap.** Genuine Confluence macro-fixture acceptance remains unproven.

#### BLOCK-018 — Status labels

Core · target · **partial**

**Requirement.** An inline status label is a short colored lozenge with text, in gray, blue, green, yellow, red or purple, inserted from the block menu or by typing `/status`. Screen readers and search read it as text. It survives export, as text with its color name in Markdown and as a styled span in HTML, and Confluence's Status macro imports as this label with its color (`IMP-010`). It is separate from a page's status (`STAT-*`).

**Acceptance.**
1. a browser journey inserts a green "Done" label and a red "Blocked" label, finds the page by searching for "Blocked", and exports and re-imports the page with both labels and colors intact.
2. A Confluence page with Status macros imports with matching labels and colors.

**Evidence.** `tests/profile/body-blocks-journey.ts`
**Gap.** Confluence status color in plain-string table cells is reported as loss; genuine incumbent macro-fixture acceptance remains unproven.

#### BLOCK-019 — Diagrams.net diagrams

Core · target · **missing**

**Requirement.** A diagram block holds a diagrams.net (draw.io) diagram: its `.drawio` source and a rendered SVG preview. A member with edit access opens it in the diagrams.net editor (jgraph/drawio, Apache-2.0), which Slate serves from the deployment's own origin so that diagram content never reaches a third party. Saving writes a new revision of the block (`REV-001`). Readers, including the anonymous read view (`WEB-003`), see the preview sanitized under `BASE-INPUT-002`, and anyone who can read the page can download the source as a `.drawio` file. Confluence draw.io diagrams import as diagram blocks with their source and preview. Gliffy diagrams are converted to diagrams.net, with the original `.gliffy` file attached to the block (`IMP-010`). A diagram that cannot be converted keeps its preview image and its source attachment and is named in the loss report. This clause inherits `PORT-010`'s Word obligation when diagram blocks ship: the readable preview exports as an embedded image under the same reader and media access checks.

**Acceptance.**
1. a browser journey inserts a diagram, edits it in the editor while the request log shows no request leaving the deployment's origin, saves it, sees a new revision, and downloads the `.drawio` file.
2. The published page shows the SVG and loads no third-party resource.
3. Importing the `IMP-010` fixture's draw.io and Gliffy diagrams produces editable diagram blocks whose previews match their sources, with the original files attached.
4. Exporting Word under `PORT-010` embeds each readable preview as an image, with no external media relationship.

**Evidence.** —
**Gap.** not implemented

#### BLOCK-020 — Group mentions

Core · target · **partial**

**Requirement.** A mention can name a group (`WORK-009`). It renders the group's name and notifies, once each, the members of that group who can read the page, never a member who cannot. Before the comment or edit is saved, the composer shows how many people will be notified. Owners can limit mentions of groups larger than the size in `seed.json → limits` to container administrators. Confluence team mentions import as group mentions where the team is mapped through `IMP-003`'s reviewed principal mapping, and as plain text otherwise.

**Acceptance.**
1. a Workers journey mentions a four-member group on a page one of its members cannot read and finds exactly three inbox items.
2. A browser journey shows "3 people will be notified" before saving, and a member without permission who mentions a group above the size limit is refused with a reason.

**Evidence.** `tests/flagship/discovery/group-mentions.test.ts`, `tests/qualification/ui-convergence/group-mentions-journey.mjs`
**Gap.** Native mentions implemented; Confluence team import remains unproven.

#### BLOCK-021 — Attachment previews

Core · target · **missing**

**Requirement.** Every file attachment (`BLOCK-008`) of a supported preview type opens in an in-page viewer inside its file block and in a full-screen viewer. Both viewers offer page or sheet navigation, zoom, find-in-file and a download button. The supported preview types are:

- PDF;
- Word `.docx` and `.doc`, Excel `.xlsx`, `.xls` and `.csv`, and PowerPoint `.pptx` and `.ppt`;
- OpenDocument `.odt`, `.ods` and `.odp`;
- plain text, Markdown, JSON and source code;
- every image, video and audio type `BLOCK-008` already displays.

Slate renders each preview itself after upload, as a sanitized rendition stored beside the file. PDF pages render through a PDF renderer served from the deployment's own origin, and Office and OpenDocument files convert to sanitized HTML or page images. Sheets keep their tabs, and slides keep their order and speaker notes. A rendition runs no script or macro from the file and fetches no external reference (linked images, remote templates, OLE links). It is served same-origin in a sandboxed frame under a content security policy that allows no third-party request. The raw file keeps `BLOCK-008`'s download disposition with its declared type and `nosniff`; only the rendition is served inline, with exactly the page's access, or through its public link (`WEB-003`).

Some files get no preview: an unsupported type, a password-protected or corrupt file, a file larger than `seed.json → limits.attachmentPreviewBytes`, or a file with more pages than `seed.json → limits.attachmentPreviewPages`. Each shows its name, type, size, a download button and the reason. A preview always shows the attachment version its block shows (`BLOCK-022`).

**Acceptance.**
1. - A browser journey at 1440 and 390 attaches a PDF, a `.docx`, an `.xlsx`, a `.pptx`, a `.doc`, an `.xls`, a `.ppt` and an `.odt`.
2. It opens each in the in-page and the full-screen viewer, moves to its second page, sheet or slide, and finds a word in it.
3. Throughout, the request log shows no request leaving the deployment's origin (the `BLOCK-019` pattern). - A `.docx` with a remote image and a remote template, and a PDF with embedded JavaScript, produce no outbound request and run no script. - Downloading each raw file still returns a download disposition and `nosniff`. - A member without page access gets 404 for both the rendition and the file.
4. The anonymous view of a published page shows the preview. - A file over the size limit and a password-protected PDF show the no-preview state with its reason. - The `IMP-010` fixture's Attachments and View File macros import as file blocks that preview.

**Evidence.** —
**Gap.** No validated CI-run proof for this acceptance point: "A browser journey at 1440 and 390 attaches a PDF, a `.docx`, an `.xlsx`, a `.pptx`, a `.doc`, an `.xls`, a `.ppt` and an `.odt`."<br>No validated CI-run proof for this acceptance point: "It opens each in the in-page and the full-screen viewer, moves to its second page, sheet or slide, and finds a word in it."<br>No validated CI-run proof for this acceptance point: "Throughout, the request log shows no request leaving the deployment's origin (the `BLOCK-019` pattern)."<br>No validated CI-run proof for this acceptance point: "A `.docx` with a remote image and a remote template, and a PDF with embedded JavaScript, produce no outbound request and run no script."<br>No validated CI-run proof for this acceptance point: "Downloading each raw file still returns a download disposition and `nosniff`."<br>No validated CI-run proof for this acceptance point: "A member without page access gets 404 for both the rendition and the file."<br>No validated CI-run proof for this acceptance point: "The anonymous view of a published page shows the preview."<br>No validated CI-run proof for this acceptance point: "A file over the size limit and a password-protected PDF show the no-preview state with its reason."<br>No validated CI-run proof for this acceptance point: "The `IMP-010` fixture's Attachments and View File macros import as file blocks that preview."

#### BLOCK-022 — Attachment versions

Core · target · **missing**

**Requirement.** Uploading a file to a page that already has an attachment of the same name creates the next version of that attachment, not a second file. This holds for a drop, the file picker, `API-001` and every import. A "Replace file" action on a file block does the same under any file name.

- **Each version** keeps its uploader, time, size, content hash and an optional note.
- **The attachment's history** lists every version. Each version previews (`BLOCK-021`) and downloads. Restoring a version makes it the new latest version and deletes none.
- **File blocks and links** show the latest version unless they are pinned to one. A page revision (`REV-001`) opened from history shows the attachment version that was current at that revision.
- **Versions follow the page.** They inherit its access, move with it, count towards `seed.json → limits.attachmentStorageBytesPerDeployment`, are included in exports with their history (`PORT-001`), and are erased with the attachment under `BASE-DATA-003`.
- **Deleting one version** needs edit access, is recorded in activity and leaves the other versions.

**Acceptance.**
1. - A Workers journey uploads `policy.pdf` to a page and then a different `policy.pdf` to the same page.
2. It finds one attachment with versions 1 and 2, each downloadable with its own bytes and hash, uploader and time, and the file block shows version 2. - Restoring version 1 creates version 3 with version 1's bytes.
3. The page revision from before the second upload shows version 1. - A browser journey at 1440 and 390 does the same through the file block's history. - A member without page access gets no version. - Exporting and re-importing the workspace keeps all three versions in order. - The `IMP-007` fixture's attachment with two versions imports with both.

**Evidence.** —
**Gap.** not implemented

### Organizing and finding

#### CONT-010 — Space blog and announcements

Core · target · **partial**

**Requirement.** A container has a blog: dated posts with an author, a cover and comments that appear in a feed in the container and on followers' home pages (`NAV-001`). Following a container notifies its followers of new posts (`NOTIF-001`). Posts are pages and keep every page clause. Confluence blogs import as posts (`IMP-003`), not as folders.

**Acceptance.**
1. a browser journey in which one member publishes a post, a follower gets the notification and sees the post on Home, and importing a Confluence space with blog posts creates posts that keep their dates and authors.

**Evidence.** `tests/qualification/ui-convergence/blog-journey.mjs`
**Gap.** Native posts, permission-aware feeds, follower notices and Home are proven at 1440/390; Cloud blog import is proven only on a derived export, Server/DC XML blog posts remain unmapped, and email delivery waits on NOTIF-005.

#### CONT-011 — Space home and company hub

Core · target · **done**

**Requirement.** Each container has an editable home page that its index opens first. Workspace owners curate a company hub: one page that every member sees from Home, made of chosen links, a news feed of announcement posts and verified key pages.

**Acceptance.**
1. a browser journey in which an owner builds a hub, a new member's first Home shows it, and the hub's links show each reader only pages that reader can read.

**Evidence.** `tests/flagship/discovery/space-hub.test.ts`, `tests/qualification/ui-convergence/hub-journey.mjs`
**Gap.** Editable homes and permission-aware curated hub proven at 1440 and 390.

#### CONT-012 — Watch a container

Core · target · **done**

**Requirement.** A member can watch a whole container. For each page in it the member can read, a watched container delivers page creation, edits, moves in or out, archiving or trashing, and comments and replies, as one inbox item each (`NOTIF-002`) or as one line each in a digest under `NOTIF-005`. Edits are coalesced into one item per page, per author, per editing session (`COLLAB-005`'s window). A page the member cannot read, and every draft (`LIFE-002`), produces nothing. A member who watches both a page and its container gets one item, not two. Blog posts (`CONT-010`) arrive the same way. Home shows a Following section with the same events for the member's watched pages and containers; it is personal, not a workspace-wide feed (`NAV-001`). A container's administrators can see its watchers.

**Acceptance.**
1. a Workers journey has a member watch a container.
2. Another member then creates a page, edits it in two sessions, comments on it, and creates a restricted page the watcher cannot read.
3. The watcher gets exactly four items (the creation, two edit sessions and the comment) and nothing for the restricted page, and a comment on a page they also watch directly arrives once.
4. A variant with a daily digest preference finds the same four events as digest lines, and a browser journey sees them in Home's Following section.

**Evidence.** `tests/flagship/discovery/following.test.ts`, `tests/qualification/ui-convergence/following-journey.mjs`
**Gap.** None.

#### PAGE-016 — Autowatch on create and edit

Core · target · **done**

**Requirement.** Creating a page, or saving an edit to it, watches it for that member, as commenting already does (`PAGE-009`), until they unwatch it. Unwatching stops autowatch for that page, so a later edit by the same member does not watch it again. A member can turn autowatch off for themselves, and `NOTIF-006` sets the workspace default. An implicit watch delivers the same events as an explicit one.

**Acceptance.**
1. a Workers journey has one member create a page and a second member edit another page, then a third member comments on both, and the creator and the editor each get exactly one notification.
2. After the editor unwatches their page and edits it again, a further comment notifies them of nothing.
3. A member with autowatch off creates a page and is not watching it.

**Evidence.** `tests/flagship/discovery/following.test.ts`
**Gap.** None.

#### WORK-016 — People directory and expertise

Core · target · **partial**

**Requirement.** Each member has a profile with their name, title, team, manager, time zone and the pages they own, verify and frequently edit. Expertise tags are derived from that work, and the member can edit or hide them. The directory is searchable, guests see only the people on pages shared with them, and expertise is used to route reviews and questions (`STAT-006`, `KEEP-003`).

**Acceptance.**
1. a browser journey that finds the expert for a topic from the directory, sees the pages they own and verify, hides a derived tag, and confirms a guest cannot list members beyond their shared pages.

**Evidence.** `tests/e2e/review/review-access.test.ts` — "Needs review and the people directory expose only readable work, with live access, expertise choices and explicit review routing" calls `tests/e2e/review/people-case.ts` (search, per-viewer owned/verified/frequently edited pages, hidden tags and review suggestions, guest scope, self/owner field authority and member erasure); `tests/e2e/review/verification-upgrade.test.ts` — "Existing verifications and member profiles upgrade in place without losing populated work or lapse notices" proves the populated prior-schema upgrade; `tests/flagship/release-clauses/portability/profile-retention.test.ts` — "FLAG-001 — core profile gates preserve pages, portable history and disabled restored execution" retains profile fields and hidden tags across a native archive restore; `tests/qualification/ui-convergence/people-journey.mjs` — "peopleJourney" in the existing review-request launch at 1440 (find an expert, owned/verified pages, hide a derived tag, another member sees neither hidden expertise nor private work, native guest acceptance and page-scoped people).
**Gap.** Question routing, this clause's own obligation, waits on KEEP-003 (missing). Adopted defaults: members edit only their own title, time zone and expertise; team and manager are workspace-owner-only in the current two-role model. Expertise derives only from readable page labels on owned, currently verified or repeatedly edited work; no performance assessment. Frequently edited lists for read-only viewers and guest editor lists use published work. Guests use shared-page people lists and cannot browse the directory; hidden choices are visible and restorable only to their member.

#### SHARE-009 — Share with a message

Core · target · **partial**

**Requirement.** The share panel can send a page to members, groups or email addresses with an optional plain-text message no longer than the limit in `seed.json → limits`. A recipient who can already read the page gets one inbox item, and an email under their delivery settings (`NOTIF-005`, `NOTIF-006`), carrying the sender, the page title, the message and a link. A recipient without access is offered to the sender as a grant to add (`SHARE-001`, or a guest invitation under `SHARE-006`) and receives nothing until it is added. The message is never the page body, and it is kept in the sender's activity.

**Acceptance.**
1. a browser journey shares a page with a message to one member who can read it and one who cannot.
2. The first gets one inbox item and one email with the message.
3. The second is offered to the sender as a grant and receives nothing until it is added, then gets one item.

**Evidence.** `tests/qualification/backend/emitted.mjs`
**Gap.** see the clause

#### TMPL-007 — Starter templates

Core · target · **done**

**Requirement.** Slate ships starter templates that work from the first sign-in: meeting notes (attendees, agenda and assigned tasks under `BLOCK-015`), retrospective, decision (`DEC-*`), how-to, troubleshooting, product requirements (with a task report and issue embeds), project plan, runbook (`KEEP-006`), onboarding page, team home (`CONT-011`) and policy page (with an owner and a review date). Each is a shipped template under `TMPL-004`: it can be duplicated into an editable copy and is never edited itself. Each is categorized in the gallery (`TMPL-001`) and previews under `TMPL-002`.

**Acceptance.**
1. a browser journey finds each named starter template in the gallery by category, previews it, creates a page from meeting notes and assigns a task in it, and duplicates the retrospective into an editable copy while the shipped template stays unchanged.

**Evidence.** `tests/e2e/pages/starter-templates.test.ts`, `tests/qualification/ui-convergence/starter-templates-journey.mjs`
**Gap.** None.

#### NAV-007 — My tasks

Core · target · **done**

**Requirement.** Every member has a My tasks view, reachable from Home and the sidebar. It lists the tasks assigned to them and, in a second tab, the tasks they created, across every page they can read. It filters by open, completed and overdue, by container and by due-date range, sorts by due date (undated tasks last), page or container, and paginates stably while tasks change. Completing a task in the list completes it on its page under the page's edit check (`BLOCK-007`). A task leaves the list when its page becomes unreadable to the member, is a draft they cannot read (`LIFE-002`) or is in the trash. Guests see only tasks on pages shared with them.

**Acceptance.**
1. a browser journey assigns one member three tasks on two pages with different due dates.
2. Their My tasks view, filtered to open and sorted by due date, lists exactly those three in that order.
3. Completing one from the list marks it done on its page, and revoking the member's access to one page removes its task from the list on the next load.

**Evidence.** `tests/profile/work-items-journey.ts`, `tests/qualification/ui-convergence/my-tasks-journey.mjs`
**Gap.** None.

#### SEARCH-010 — Labels and advanced search

Core · target · **done**

**Requirement.** Search and container views filter by label. Queries accept the operators `title:`, `label:`, `in:` (container), `by:` (contributor), `owner:`, `status:`, `verified:`, `before:`, `after:`, `type:` and quoted phrases, combined with `AND`, `OR` and `-`. A member can save a search, and a saved search can feed a content query (`BLOCK-010`). Operators never widen access (`SEARCH-005`).

**Acceptance.**
1. a Workers journey over seeded pages checks each operator and each combination against expected result IDs for two members with different grants.
2. A browser journey saves a search and embeds it in a page.

**Evidence.** `tests/e2e/search/discovery-journey.ts`
**Gap.** None.

#### SEARCH-011 — Verified-first ranking and trust badges

Core · target · **done**

**Requirement.** Search results, link cards, content queries and answers show each page's verification state (verified with its owner and expiry, lapsed, or unverified) and its last-updated time. Among equally relevant results, ranking puts current verified pages ahead of unverified ones and lapsed or archived pages last, and collapses near-duplicates into one result with a "similar pages" control. Anonymous published views of link cards and content queries carry no verification owner, expiry or lapse state; they show titles only. Answers carry this trust under `ANSWER-002`, which proves it. Two pages are near-duplicates when the Jaccard similarity of their current revisions' 5-word shingles, estimated by MinHash, is at least `seed.json → limits.nearDuplicateSimilarity` (0.8 by default); the same definition drives `KEEP-004`. A member can sort by relevance, last updated or most viewed.

**Acceptance.**
1. a Workers journey over a seeded corpus of a verified, a lapsed and an unverified page with equal text matches asserts their order and badges.
2. A seeded pair at a measured similarity of 0.85 collapses into one result and a pair at 0.7 does not; lowering the limit to 0.65 collapses the second pair too.
3. A browser journey sees the badges and the collapsed near-duplicates, and an anonymous reader of the published pages and of a published content query over them sees their titles with no verification owner, expiry or lapse state.

**Evidence.** `tests/e2e/search/discovery-journey.ts`, `tests/qualification/ui-convergence/trust-ranking-journey.mjs`
**Gap.** None.

#### SEARCH-012 — Connected results in search

Core · target · **partial**

**Requirement.** When connectors are attached (`CONNECT-001`), one search covers Slate content and connected items, which are labeled with their source and opened in their source. Each connected result is shown only if the asking member's mapped identity can read it in the source now (`CONNECT-002`). Connected results never change Slate result ranking for members without that source.

**Acceptance.**
1. a Workers journey with a provider fake at the network edge returns a Drive file to a member mapped to its reader and hides it from an unmapped member, with identical Slate results for both.
2. Provider acceptance repeats this against a real authorized Google Drive.

**Evidence.** `src/core/features/source-memory/service.ts`
**Gap.** see the clause

#### SEARCH-013 — Search inside attached files

Core · target · **missing**

**Requirement.** Slate extracts the text of every attachment of a type `BLOCK-021` previews and indexes it with the page. That covers PDF text layers, Office and OpenDocument text, slide text and speaker notes, sheet cell values, plain text, Markdown and code. Extraction reads the latest version (`BLOCK-022`), up to `seed.json → limits.attachmentTextBytes` per file. When AI is on (`AI-001`), image-only PDFs and images are read by the owner's configured provider and indexed the same way.

- **Results.** Global search (`SEARCH-001`) matches attachment text within its 500ms bound. A match is returned as the file, naming its page, with a snippet from the file and the match highlighted. Opening it opens the viewer at the matching page, sheet or slide. Search can be filtered to attachments, and by file type (`SEARCH-010`).
- **Access.** `SEARCH-005` applies unchanged: a member without access to the page gets no result, snippet, facet or total from its files.
- **Freshness.** A new version is re-indexed through the page's dirty generation (`PORT-004`), and text from an older version stops matching.
- **Limits.** A file whose text exceeds the limit shows "partially indexed". A file with no extractable text shows "no searchable text" while AI is off.
- **Answers.** Cited answers (`ANSWER-001`) may cite attachment text. The citation opens the viewer at the cited version and page.

**Acceptance.**
1. - A Workers journey attaches a PDF and a `.docx` whose bodies each contain a phrase found nowhere else, plus an `.xlsx` and a `.pptx` with their own phrases.
2. Searching each phrase returns that file and its page with a snippet from the file.
3. A browser journey opens the viewer at the matching page. - A member without access to the page gets no result, snippet, facet or total for any of the phrases. - Uploading version 2 without the phrase makes the phrase stop matching once indexing settles. - A file larger than the text limit shows "partially indexed". - With AI on and a provider fake at the network edge, a scanned PDF's phrase becomes searchable. - An import of the `IMP-007` fixture has its attachment text searchable before the import is Completed (`PORT-004`).

**Evidence.** —
**Gap.** not implemented

#### SEARCH-014 — Old Confluence URLs find their Slate record

Core · target · **missing**

**Requirement.** Wherever a member can paste a URL, an old Confluence URL that `IMP-013` recognizes resolves to its imported record:

- **Search.** Pasting the URL into global search (`SEARCH-001`) returns the record as the first result. A record the member cannot read is returned as `LINK-004`'s access-needed result, with no title, snippet or author, and an unmapped URL returns one "Not migrated" result naming the source space key.
- **Link field.** Pasting the URL into the editor's link field links to the record's permanent URL and shows its current title (`LINK-003`).
- **Page body.** Pasting the URL into a page body inserts a link to the record, not a link card to the old site. One undo restores the URL as pasted.
- **API and MCP.** `GET /api/v1/resolve?url=` and the MCP `resolve` tool (`API-001`, `API-003`) return the record's ID and URL to a token or client acting as a member who can read it, the access-needed result otherwise, and `not_migrated` for an unmapped URL.

**Acceptance.**
1. over the `IMP-013` fixture's tiny link, page-ID URL, `/display/` URL and blog URL, a Workers journey searches each one and gets its record first, and calls the resolve endpoint with tokens for a reader and a non-reader: the reader gets the record, the non-reader gets the access-needed result with no title.
2. A browser journey at 1440 and 390 pastes the tiny link into the link field and sees the record's current title, pastes the page-ID URL into a paragraph and gets a link to the record, undoes once and gets the URL as pasted, and pastes an unmapped URL into search and sees "Not migrated" with its space key.

**Evidence.** —
**Gap.** not implemented

### Keeping knowledge true

#### STAT-006 — Review requests and expert queues

Core · target · **done**

**Requirement.** A page owner or editor can request review from a named member or group, with a due date and a note. The reviewer gets an inbox item (`NOTIF-002`) and a queue of pages awaiting their review, and can verify (`STAT-003`), request changes as a comment, or reassign. An overdue review reminds the reviewer once and then the container owner. Owners can re-verify in bulk from the queue, opening each exact revision (`STAT-003` still requires a human to open the revision being attested).

**Acceptance.**
1. a browser journey in which one member requests review, the reviewer sees the queue item, opens the revision and verifies it, and an overdue request reminds the reviewer and then the container owner exactly once each.

**Evidence.** `tests/qualification/ui-convergence/review-request-journey.mjs`
**Gap.** None.

#### STAT-007 — Verification rules

Core · target · **done**

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

**Acceptance.**
1. a Workers journey runs a rule over seeded pages and asserts exactly the expected unverifications, flags, activity entries and one coalesced notice per owner.
2. An attempted rule action of "verify" is rejected.
3. `SOURCE-003` and `SOURCE-004` each extend this journey with a cited source that changes.

**Evidence.** `tests/e2e/review/verification-rules.test.ts`, `tests/qualification/ui-convergence/review-request-journey.mjs`
**Gap.** None.

#### CARD-001 — Knowledge cards and collections

Core · target · **partial**

**Requirement.** A card is a short page kind with a soft length limit (`seed.json → limits`, 500 words by default: past it the editor warns and suggests a page, and nothing is truncated), a question-style title, an owner, verification required by default, and placement in a collection (a container with card-friendly views). Cards render compactly in search, answers, chat (`CHAT-002`) and the browser extension (`CARD-002`). Guru cards import as cards (`IMP-008`).

**Acceptance.**
1. a browser journey creates a card and finds it as a compact result with its verification badge, and a 600-word card shows the length warning and saves intact.
2. A Guru import creates cards in collections that keep their owners and their verification intervals as imported metadata.

**Evidence.** `src/core/features/containers/service.ts`
**Gap.** see the clause

#### CARD-002 — Browser extension

Core · target · **missing**

**Requirement.** A Chrome and Edge extension signs in as the member and searches and asks Slate from any tab. On sites the owner allowlists, such as Salesforce, Zendesk, HappyToHelp, Orbit and GitHub, it suggests cards relevant to the open record. It reads page text only after the member opens the extension on that tab, sends only the query and the record title, and shows only what the member can read.

After a Confluence cutover, a workspace owner lists the old Confluence hostnames (`IMP-013`). The extension then redirects the member's navigation to a Confluence path on those hosts (`/wiki/*`, and `/display/*`, `/x/*`, `/pages/*`, `/spaces/*` and `/download/*` on a Server or Data Center hostname) to Slate's resolver, using a browser redirect rule. It holds no map, reads nothing from the old page and leaves every other path on the host, such as Jira's `/browse/*` on the same `atlassian.net` site, untouched. A member can switch the redirect off. IT can force-install the extension, with the old hostnames preset, on managed Chrome and Edge browsers through enterprise policy.

**Acceptance.**
1. an automated Chromium journey loads the packed extension, signs in, opens an allowlisted fixture page, sees a relevant verified card, and confirms through a request log that no page text left the tab before the member opened the extension.
2. With `ourcompany.atlassian.net` listed as an old hostname and served by a fixture host, navigating to the `IMP-013` fixture's tiny link and page-ID URL lands on their Slate records, `/browse/ENG-1` on the same host is not redirected, and with the member's switch off the tiny link is not redirected.

**Evidence.** —
**Gap.** not implemented

#### CARD-003 — Required reading and announcements

Core · target · **missing**

**Requirement.** An owner can send a page or card to a group as required reading. Each member gets an inbox item and a reminder after a set number of days, and their acknowledgment is recorded. The sender sees who has acknowledged. Slate records no reading time and no scroll depth, and acknowledgments are visible only to the sender and workspace owners.

**Acceptance.**
1. a browser journey sends a page to a group, two members acknowledge, one is reminded once, and the sender's report lists exactly those states with no reading-time data.

**Evidence.** —
**Gap.** not implemented

### Structured knowledge

#### DB-013 — Database forms

Core · target · **missing**

**Requirement.** A database can publish a form whose questions map to its fields, with required fields, help text and simple conditional questions. A form is open to members, to named guests or, if the container allows public links (`CONT-007`), to an anonymous link with rate limits and a spam check (a honeypot field, a per-address rate limit, and Cloudflare Turnstile when the owner configures it). Each submission creates a record and can trigger automations (`AUTO-001`). Standalone survey and quiz products belong to [Pencil](https://github.com/just-every/run-pencil).

**Acceptance.**
1. a browser journey publishes a form with a conditional question, submits it as a guest and anonymously, sees two records with mapped values, and sees an automation fire on each submission.
2. The conditional question appears only when its condition is met, and a submission that fills the honeypot or exceeds the rate limit creates no record.
3. Forbidding public links makes the anonymous form stop resolving at once.

**Evidence.** —
**Gap.** not implemented

#### DB-014 — Dashboards

Core · target · **partial**

**Requirement.** A page can hold a dashboard: several charts (`DB-008`) and views (`DB-011`) arranged in a grid, with dashboard-wide filters such as a date range or a person that apply to every tile. Each tile computes over the reader's authorized records only (`DB-002`).

**Acceptance.**
1. a browser journey builds a dashboard of three charts and a view, applies a date filter that changes every tile, and confirms a member with fewer grants sees lower counts and no restricted values.

**Evidence.** `src/core/features/databases/ui/workspace/DatabaseChart.tsx`
**Gap.** No validated CI-run proof for this acceptance point: "a browser journey builds a dashboard of three charts and a view, applies a date filter that changes every tile, and confirms a member with fewer grants sees lower counts and no restricted values."

#### DB-015 — Record templates and recurring records

Core · target · **done**

**Requirement.** A database has record templates (default fields and a body), and a template can repeat on a schedule (daily, weekly on given days, monthly or yearly), creating a record at the set time in the time zone of the member who last saved it. A schedule runs as the template's last saver (a re-save hands it to that saver, and the Templates tab shows who it runs as), exactly once per occurrence, even after restarts, and pauses with a visible reason if that saver loses access.

**Acceptance.**
1. a Workers journey advances a scheduled trigger across two occurrences and a restart and finds exactly two records.
2. Revoking the last saver's access pauses the schedule with its reason shown.
3. A browser journey at 1440 and 390 shows the Templates tab saying the schedule runs as the member who last saved it, and a second member's re-save changing that name for both.

**Evidence.** `tests/e2e/databases/record-templates.test.ts`
**Gap.** None.

#### DB-016 — AI autofill fields

Core · target · **missing**

**Requirement.** A field can be an AI field (summary, extraction, classification or translation) computed from the record's own content. It re-runs when its inputs change, cites the record revision it read, is labeled AI-generated, counts against AI budgets (`AI-012`), and never reads records the field's owner cannot read. A member can override a value, and an override is kept until it is cleared.

**Acceptance.**
1. a Workers journey with a provider fake at the network edge fills a classification field for 20 records, re-runs only the 3 records that changed, keeps a manual override, and records usage against the budget.

**Evidence.** —
**Gap.** not implemented

### Notifications and follow-up

#### NOTIF-004 — Reminders

Core · target · **done**

**Requirement.** A date mention (`BLOCK-005`) can carry a reminder at the date or at a chosen offset. A member can set a reminder on any page or task item (`BLOCK-007`), and a task with a due date reminds its assignee on that date (`BLOCK-015`). Reminders arrive in the inbox, and by email or push where the member opted in (`NOTIF-005`), at the member's local time, exactly once, and are rechecked against access at delivery.

**Acceptance.**
1. a Workers journey sets reminders in two time zones, advances time, and finds exactly one inbox item each at the right local time.
2. A reminder on a page whose access was revoked is not delivered.

**Evidence.** `tests/profile/profile.worker.test.ts`, `tests/profile/work-items-journey.ts`
**Gap.** None.

#### NOTIF-005 — Email, push and digest delivery

Core · target · **missing**

**Requirement.** Each member chooses, per event kind, between in-app only, immediate email, a daily or weekly digest, push on their devices (`MOBILE-004`), and a chat direct message (`CHAT-004`), or keeps the workspace default for that kind (`NOTIF-006`). The inbox item is created whatever the choice. Email goes through `mail.sender.v1` from the configured sender and carries the event, the actor, the page title and a link, never a page body. Recipient access is rechecked at send, and an unsubscribe link changes that member's preference without sign-in. Reminders and due tasks (`NOTIF-004`, `BLOCK-015`) sent by email or in a digest keep `NOTIF-004`'s rules: each arrives at the member's local time, exactly once however many sends race or retry, and only while the member can still read its page. Task assignments (`BLOCK-015`) by email keep its rules: one per assignment to an assignee who can read the page, none to a previous assignee on reassignment, and none when an assignee completes their own task. Digests coalesce watched page and container changes (`CONT-012`, under its rules: one line per creation, editing session, move, archive or trash, and comment, nothing for a page the member cannot read or a draft, and one line for an event also covered by a page watch), mentions, task assignments and due tasks, review requests and lapsed verifications. A watched change carries a change summary: the counts of blocks added, changed and removed and of comments added since the member's last notice. When a workspace owner turns on "section names in notifications", the summary also names the headings the changed blocks sit under, for example "3 blocks changed in Rollout plan". It never carries block or comment text.

**Acceptance.**
1. a Workers journey with a mail provider fake at the network edge opts a member into a daily digest, generates eight events including one on a page the member later loses access to, and receives exactly one digest with seven items and no body text.
2. The unsubscribe link changes the preference.
3. An edit that changes 3 blocks under the heading "Rollout plan" appears as "3 blocks changed" with the owner switch off and "3 blocks changed in Rollout plan" with it on, and no text from those blocks appears in either email.
4. A reminder set for 09:00 in the member's time zone with immediate email produces exactly one email at that local time after two concurrent sends, and a reminder on a page the member lost access to produces none.
5. Assigning a task to a member opted into immediate email sends them exactly one email; reassigning it sends the new assignee one and the previous assignee none.
6. A member who watches a container with a daily digest finds another member's page creation, two edit sessions and a comment as exactly four digest lines, and nothing for a restricted page in it.

**Evidence.** —
**Gap.** not implemented

#### NOTIF-006 — Workspace notification defaults

Core · target · **missing**

**Requirement.** A workspace owner sets the default delivery for each event kind: mentions, comments and replies on watched or authored pages, task assignments and due tasks, reminders (`NOTIF-004`, under its local-time, exactly-once and access-at-delivery rules), review requests, access grants, shares with a message, watched changes, lapsed verifications and required reading. Each default is one of in-app only, immediate email, a daily or weekly digest, push, or a chat direct message (`CHAT-004`), and the owner also sets the default for autowatch (`PAGE-016`). A member who has not chosen for an event kind receives it exactly as the default says, and a change to the default reaches them from the next event. A member's own choice, including an unsubscribe, survives later changes to the default and is shown as theirs. A new workspace starts with Confluence's defaults: mentions, replies, task assignments, review requests and access grants by immediate email, watched changes as a daily digest, and autowatch on. A workspace upgraded from a version without this setting keeps in-app delivery only until an owner sets a default, and its owners are asked once. Every email keeps `NOTIF-005`'s rules: a title and a link only, access rechecked at send, and a one-click unsubscribe that works without signing in.

**Acceptance.**
1. a Workers journey with a mail provider fake at the network edge sets a default of immediate email for mentions and a daily digest for watched changes, invites a member who sets nothing, and finds one immediate email for a mention and one digest with the watched changes.
2. A second member who unsubscribed from mention email before the default changed gets no mention email.
3. Changing the default to in-app only stops the first member's mail from the next event.
4. A new workspace's first mention produces an immediate email with no owner action, a member who set nothing for reminders receives a due reminder once, at their local time, by the default's delivery, a new workspace's first task assignment emails its assignee once and a reassignment emails only the new assignee, and no email contains a page body.

**Evidence.** —
**Gap.** not implemented

#### AUTO-006 — Outbound automation actions

Core · target · **partial**

**Requirement.** Rule actions (`AUTO-001`) can also:

- post to a Slack, Microsoft Teams or Nook channel;
- call a signed webhook (`API-002`);
- send an email from a member's own connected Gmail or Outlook mailbox under that member's OAuth grant, never from Slate's sender (`MAIL-001`);
- create a Vector or Jira issue, with a backlink to the page (`EMBED-005`).

Each action acts as the rule's actor (`AUTO-002`), sends only titles, links and fields the actor can read, uses an operation key so retries never duplicate, and records its receipt in the run log (`AUTO-003`).

**Acceptance.**
1. a Workers journey with provider fakes at the network edge fires one rule four times and finds one message, one webhook, one email and one issue per firing.
2. A retried firing produces no duplicate, and every receipt appears in the run log.

**Evidence.** `src/core/features/automation/actions.ts`
**Gap.** see the clause

#### AUTO-007 — Triggers from connected tools

Core · target · **missing**

**Requirement.** Rules can trigger on events from connected tools: a GitHub or GitLab pull request merged or released, a Vector or Jira issue changing state, a Drive file changing, or an inbound signed webhook. They can then flag a page, request review, create a record or start a `KEEP-001` check. Event payloads are untrusted content (`AI-007`).

**Acceptance.**
1. a Workers journey posts a signed GitHub-shaped webhook and sees the matching rule run once and request review on the linked page.
2. An unsigned or replayed delivery is rejected and logged.

**Evidence.** —
**Gap.** not implemented

#### AUTO-008 — Accountable follow-through

Core · target · **partial**

**Requirement.** Every background action is a durable job with an accountable owner, a due condition, visible progress, a visible failure and an explicit stop or resolution state. This covers rules, schedules, reminders, review escalations, connector syncs, verification rules and agent work. A failed or stuck job appears on the owner's Home without a search. Re-running a job never duplicates a message, record or issue, and stopping a job cancels its unsent work.

**Acceptance.**
1. a Workers journey kills a job mid-run and finds it resumed once with no duplicate effect.
2. A forced failure appears on the owner's Home, and stopping a queued job cancels its pending sends.

**Evidence.** `src/core/features/automation/jobs.ts`
**Gap.** No validated CI-run proof for this acceptance point: "a Workers journey kills a job mid-run and finds it resumed once with no duplicate effect."<br>No validated CI-run proof for this acceptance point: "A forced failure appears on the owner's Home, and stopping a queued job cancels its pending sends."

### Moving in and out

#### IMP-006 — Notion import with comments and live databases

Core · target · **partial**

**Requirement.** Slate imports Notion's HTML export, including page and block comments, which become threads anchored to the matching blocks with their authors and times. It also imports through the Notion API, keeping databases with their relations, rollups, formulas, views and filters, with page-level sharing mapped through reviewed principal mappings (`IMP-003`'s rules). An API import can re-sync changed pages until cutover, and the loss report names every unsupported block, formula function and permission.

**Acceptance.**
1. imports of a real Notion HTML export with comments and of a real Notion workspace over the API with a provider-recorded fixture.
2. Threads land on the right blocks, rollups recompute to Notion's values or are marked not-recomputed, and a re-sync updates only changed pages.
3. A provider acceptance run repeats this against a real workspace.

**Evidence.** `src/core/features/imports/service.ts`
**Gap.** see the clause

#### IMP-007 — Confluence Cloud live migration

Core · target · **missing**

**Requirement.** Through the Confluence Cloud REST API (OAuth), Slate imports one or more spaces using `IMP-003`'s reviewed principal mapping. It carries:

- pages with every version, each with its mapped author and time;
- blog posts as posts with their original dates and authors (`CONT-010`);
- footer comments with their replies, and inline comments anchored to the same text, each with its author, time and open or resolved state;
- attachments with every version (`BLOCK-022`), with their text searchable (`SEARCH-013`);
- labels (`PAGE-001`, `SEARCH-010`);
- page restrictions, space permissions (`IMP-011`) and personal spaces (`IMP-012`).

Macros, diagrams and tasks with their assignees and due dates map as `IMP-010` names. It can re-sync deltas until cutover. A delta adds exactly what changed since the last pass, keyed by source ID and version, and never duplicates a page, version, comment or attachment. Its redirect map, from every old Confluence URL to its Slate record, is kept in Slate and served by Slate itself (`IMP-013`), so a buyer whose site lives on `atlassian.net`, where only Confluence Premium offers a custom domain, needs no host of its own. Links into spaces imported in later passes are back-filled (`IMP-014`). The cutover report lists what changed since the first pass, every link in Slate that still points at the old site (`IMP-014`), the old URLs requested since cutover that map to nothing (`IMP-013`), and the changes made by the Jira re-pointing step (`EMBED-006`).

**Acceptance.**
1. the recorded Confluence Cloud API fixture holds: - a page with 3 versions by 2 authors; - one open and one resolved inline comment anchored to text; - a footer comment with a reply; - an attachment with 2 versions; - two labels; - a blog post; - a personal space.
2. After import, a Workers journey asserts block by block that: - the page's history lists 3 revisions with their mapped authors and times; - both inline threads sit on the same text with their authors and resolved states, and the footer comment keeps its reply; - the attachment has both versions; - both labels are searchable and filterable; - the blog post is a post with its original date and author; - the personal space lands as `IMP-012` requires.
3. A delta that adds one comment and one page version adds exactly those two and duplicates nothing.
4. Every old page and blog URL in the fixture, in each `IMP-013` form, resolves through Slate's own resolver route to its imported record with no host other than the deployment, and the cutover report lists the fixture's links into a space that was not imported.
5. The same fixture's macros, diagrams, tasks and space permissions arrive as `IMP-010` and `IMP-011` require.
6. A provider acceptance run repeats this against a real Confluence Cloud site.

**Evidence.** —
**Gap.** not implemented

#### IMP-008 — Guru import

Core · target · **missing**

**Requirement.** Slate imports a Guru export or reads the Guru API, turning collections into containers, folders into tree pages and cards into cards (`CARD-001`), with their owners, verifiers and verification intervals. Guru verification arrives as imported metadata that reads "Verified in Guru by name on date". It never counts as Slate verification until a member verifies the exact revision (`STAT-003`).

**Acceptance.**
1. an import of a real Guru export fixture creates the expected collections, cards and owners, every imported card shows the Guru verification line and Slate status "unverified", and verifying one card produces a normal `STAT-003` record.

**Evidence.** —
**Gap.** not implemented

#### IMP-009 — Folder imports from Google Drive and SharePoint

Core · target · **partial**

**Requirement.** A member can import a Google Drive folder or a SharePoint/OneDrive folder of Google Docs, Word and PDF files as a page tree, keeping folder hierarchy, titles, headings, tables, images and links between imported documents. Each source document keeps a link back to the original, and the report names every file it did not import.

**Acceptance.**
1. a Workers journey with recorded provider fixtures imports a nested folder of 12 documents into a tree with resolved cross-links.
2. Provider acceptance repeats this with a real Drive and a real SharePoint site.
3. *Semantics:* A workspace owner enables a provider; each full member supplies a delegated credential whose provider account matches their verified Slate email.
4. Credentials are encrypted, omitted from responses and exports, and destroyed on disconnect or member erasure.
5. Preview binds the exact source tree and destination revision before atomic publication.
6. Every new folder and document page is restricted to the importing member, including beneath a shared destination; source sharing grants are never copied.
7. An unreadable folder is not enumerated.
8. A file whose structure cannot be preserved is wholly omitted and named in the report; supported tagged PDFs preserve headings, tables, images and document links.

**Evidence.** `tests/e2e/imports/drive-sharepoint-import.test.ts` — "IMP-009 — Member folder imports preserve a nested twelve-document tree, resolving links and actor-only access with a per-file omission report" (Verify Slate: workers); `tests/qualification/ui-convergence/folder-journey.mjs` — "folderJourney", loaded by the existing readable-export journey (Verify Slate: ui-content-desktop shards, 1440)
**Gap.** Real Google Drive and SharePoint provider acceptance, the Google console redirect step and consent are NOT RUN.

#### IMP-010 — Confluence macros, tasks and diagrams map to Slate blocks

Core · target · **partial**

**Requirement.** The file import (`IMP-003`) and the API migration (`IMP-007`) map each Confluence macro to a named Slate equivalent, which is live wherever the Slate equivalent is live:

| Confluence | Slate |
| --- | --- |
| Jira Issues (single issue or JQL table), Jira Smart Links | Live issue card or query table (`EMBED-001`) with a backlink on each issue (`EMBED-005`) |
| Jira Chart (pie, two-dimensional and created-versus-resolved charts over JQL) | Live Jira query embed shown as the same chart type over the same JQL (`EMBED-001`) |
| Excerpt, Excerpt Include, Include Page | Synced block from the source page (`BLOCK-011`) |
| Children Display, Content by Label, Page Tree, Recently Updated | Content query with the same scope, labels, depth and order (`BLOCK-010`) |
| Table of Contents | Table-of-contents block (`BLOCK-017`) |
| Page Properties, Page Properties Report | Pages that carry a Page Properties macro with the same label become records of one database for that label, keeping their bodies and tree positions (`DB-010`), with typed fields; the report becomes an embedded view with its columns and sort (`DB-011`) |
| Task list, Task Report | Tasks with their assignee (through the reviewed principal mapping), due date and completion (`BLOCK-015`); task report with the same filters (`BLOCK-016`) |
| Status | Status label with its color (`BLOCK-018`) |
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

A Task Report macro becomes a task report block (`BLOCK-016`) with the macro's space, ancestor page, label, assignee, creator, due-date range and state filters, its grouping, order and limit, and it then shows each reader only the tasks they can read; this mapping is proven here, by the genuine export below, not by `BLOCK-016`'s acceptance. The loss report lists only the unsupported rows and macros Slate does not recognize. A mapped macro whose target lies outside the import, such as an excerpt from a space not imported or a Jira site not connected, imports as its mapped block in its access-needed or "Connect to view" state and is listed as unresolved, never dropped.

**Acceptance.**
1. a real Confluence Cloud space, captured both as a file export produced by Confluence (`IMP-003`) and as a recorded API fixture (`IMP-007`), contains at least one of every mapped macro, a draw.io and a Gliffy diagram, a whiteboard and a Roadmap Planner.
2. After each import a Workers journey checks every macro block by block against the fixture's expected map: the Jira macros render as live embeds under recorded Jira fixtures, the Jira Chart as a chart of the same type, the View File macros as file blocks that preview (`BLOCK-021`), the excerpt as a synced block, the children display as a content query, the table of contents as its block, Page Properties as records with a view, tasks with their assignee, due date and state, the Task Report as a task report with the same filters, grouping and order, and the panels, expand, code and status labels as their blocks.
3. Both diagrams render as diagram blocks with their sources.
4. The loss report lists exactly the whiteboard and the Roadmap Planner.

**Evidence.** `src/core/features/imports/confluence/storage.ts`
**Gap.** see the clause

#### IMP-011 — Confluence space permissions become container grants

Core · target · **missing**

**Requirement.** Both Confluence imports carry each space's permissions, not only its page restrictions. Where the source supplies them (the Confluence Cloud REST API's space permissions and space role assignments under `IMP-007`, and the `SpacePermission` objects in a Server or Data Center `entities.xml` under `IMP-003`), the Preview (`IMP-001`) lists every principal (user, group, team, all licensed users and anonymous) with its source role and the proposed Slate grant:

- view only becomes `view`, view and comment becomes `comment`, add or edit pages (with or without delete) becomes `edit`, and space admin becomes `full` and a container administrator (`CONT-009`);
- a group or team maps only through a reviewed source-ID mapping to a Slate group, and a user only to an existing active member, under `IMP-003`'s rules; all licensed users, or the default users group, maps to the container's general grant at that level, scoped to the container (`SHARE-005`);
- anonymous access is reported and never published (`PORT-005`, `WEB-001`);
- finer permissions with no Slate level (export, delete own, set restrictions) collapse to the nearest level that does not widen access, and each collapse is named.

After Apply, the container's grants match the reviewed mapping, page restrictions still narrow access inside it as `IMP-003` requires, and a member covered by no mapped grant cannot open any imported page. A Confluence Cloud CSV export carries no space permissions, so it imports with the container closed to everyone except the importing member and the workspace owners until the reviewed grants are set, and the report says so.

**Acceptance.**
1. an `IMP-007` recorded fixture space grants view to group A and edit to group B, makes one user space admin, and has anonymous access on; an `entities.xml` fixture repeats the same permissions.
2. After the reviewed mapping, the container's grants are group A `view`, group B `edit`, and the user `full` and container administrator.
3. The anonymous access appears in the report and no page is published.
4. A member in neither group cannot open any page, a member of group A can read but not edit, and a page restriction inside the space still narrows access.

**Evidence.** —
**Gap.** not implemented

#### IMP-012 — Confluence personal spaces become personal containers

Core · target · **partial**

**Requirement.** Both Confluence imports recognize a personal space: `spacetype=personal` in a Cloud CSV export, the personal space type in `entities.xml`, and the API's `personal` space type (`IMP-007`). The outcome depends on the space's owner and on who else could read it:

- **Owner mapped, space private to them.** When the owner maps through the reviewed principal mapping to an existing active member, the space's pages land in that member's personal container (`CONT-005`) with their tree, and only that member can open them afterwards.
- **Space shared with others.** A personal container allows no grants (`CONT-005`), so a personal space that granted access to anyone other than its owner imports as a `private` container owned by the mapped member. It carries the mapped grants (`IMP-011`), and the report says why.
- **Owner unmapped.** The space imports as a `private` container that only the importing member and the workspace owners can open, and it is flagged for reassignment to a member.

No page from a personal space ever carries a general grant (`SHARE-004`).

**Acceptance.**
1. an `IMP-007` recorded fixture and an `IMP-003` CSV export each hold three personal spaces: one private to a mapped owner, one shared with a group, and one whose owner is unmapped.
2. After the reviewed mapping: - the first space's pages are in the mapped member's personal container, which no other member, the importing member included, can open; - the second is a `private` container with the group's grant and a report line; - the third is a `private` container that only the importing member and the owners can open, flagged for reassignment.
3. No imported page carries a general grant.

**Evidence.** `src/core/features/imports/confluence/space.ts`
**Gap.** see the clause

#### IMP-013 — Old Confluence links resolve in Slate

Core · target · **partial**

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

**Acceptance.**
1. the `IMP-007` fixture and an `IMP-003` CSV export of the same space each import a page, a renamed page, a blog post, an attachment and an inline comment.
2. A Workers journey then requests `/go/confluence?url=` with: - the page's tiny link, its page-ID URL and its `viewpage.action` URL; - the renamed page's old `/display/` title URL; - the blog URL and the attachment download URL; - the comment's `focusedCommentId` URL.
3. Each redirects to its imported record.
4. A member without access to the page follows the redirect and gets the access-needed state with no title.
5. A signed-out request reaches sign-in and reveals nothing else.
6. A URL from a space that was not imported shows "Not migrated" with its space key.
7. A request to a configured legacy hostname for the tiny link redirects to the resolver on the main origin and sets no cookie.
8. With a chat provider fake at the network edge, a posted page-ID URL unfurls as the Slate page for a reader and as "Restricted Slate page" for a non-reader. The downloaded CSV lists every mapped URL, and after export and restore into an empty deployment the tiny link still resolves. Exceeding the lookup limit returns 429.

**Evidence.** `src/core/platform/db/knowledge-operations-schema.ts`
**Gap.** see the clause

#### IMP-014 — Links between spaces imported in separate passes

Core · target · **missing**

**Requirement.** A link in an imported body whose target lies outside that import is kept as a pending link. The target can be a Confluence page, blog post or attachment, named by a Confluence URL in any `IMP-013` form or by a storage-format reference with its space key and title or content ID. A pending link renders as the original URL with a "not yet migrated" marker, and Slate records its page, block and target. When a later pass imports the target, by file (`IMP-003`) or by API (`IMP-007`) and in either order:

- each pending link becomes a link to the imported record, in one revision per page attributed to that import run, and only the link target changes;
- a native edit made since the earlier pass is kept, and a pending link whose block was deleted leaves the list with no change;
- an `IMP-010` block whose target lay outside the earlier import, such as an excerpt from a space not yet imported, becomes live;
- a link rewritten once never changes again, so re-running a pass or a delta changes nothing;
- Undo of the later pass (`IMP-001`) restores the original URLs and keeps native edits.

The cutover report (`IMP-007`) lists, by page, every link in Slate content that still points at an old Confluence hostname, pending links and plain URLs in text alike, grouped by target space with counts. It shows titles only of pages its viewer can read, counts the rest, and downloads as CSV.

**Acceptance.**
1. the fixture holds two spaces.
2. In space A, page A1 links to space B's page B1 by a page-ID URL, a tiny link and a storage-format page reference, and includes an excerpt from B's page B2.
3. A Workers journey imports A from its CSV file export.
4. A1's three links render as pending, the excerpt shows its access-needed state, and the cutover report lists A1 with three links to space B.
5. A member then edits another paragraph of A1.
6. Importing B by API turns all three links into links to B1's record and the excerpt into a live synced block.
7. The native edit is intact, and A1's history shows exactly one import revision.
8. A delta pass of B changes nothing, and the cutover report lists no link to space B. Undo of B's import restores the three original URLs and keeps the native edit. A member without access to A1 sees neither its title nor its links in the report.

**Evidence.** —
**Gap.** not implemented

#### PORT-008 — Exports carry comments

Core · target · **done**

**Requirement.** Workspace, container and page exports in HTML include page and inline comment threads with their authors, times and resolved state, anchored to their blocks. Markdown exports carry the same threads in a sidecar JSON file, and re-importing a Slate export restores the threads.

**Acceptance.**
1. a round trip of export to HTML and Markdown and re-import into a fresh deployment restores every thread on the same block with the same authors and resolved states.

**Evidence.** `tests/e2e/imports/readable-comments.test.ts`, `tests/qualification/ui-convergence/export-comments-journey.mjs`
**Gap.** HTML threads with block links and Markdown sidecars; page/container/workspace round trips retain authors, times, replies, resolution, tombstones and anchors without notifications; first-run and repeated exports, access and tamper checks; 1440/390 product journeys.

#### PORT-009 — Scheduled backups to the buyer's storage

Core · target · **partial**

**Requirement.** An owner can schedule a nightly or weekly complete export (`PORT-001`) to the buyer's own S3-compatible bucket or Cloudflare R2, with a retention count, failure notices to owners, and a restore drill that restores the latest backup into an empty deployment (`PORT-002`). [Chest](https://github.com/just-every/run-chest) inherits this destination contract when it publishes an intake; it is not a destination kind today. Failure notices are in-app; email notices inherit `NOTIF-005`.

Only an owner with a fresh sign-in proof configures or removes a destination. The same proof gates credential replacement, which keeps the schedule and run history. Credentials are encrypted with `CONNECTOR_CREDENTIALS_KEY`, returned by no API and excluded from archives; removal destroys them. Nightly and weekly schedules use UTC. A durable destination/period receipt admits one run even under concurrent invocation or restart; an interrupted run is recorded as a failure rather than uploaded twice. A complete ZIP is streamed in bounded parts, then uploaded and checked by size and SHA-256 readback before retention removes any exact key written by this feature. An incomplete export scope produces a recorded failure and no partial external object. A failed run sends each active owner one in-app notice; a later success clears the current failure while preserving history. Restore requires an empty separate deployment and renewed credentials. The source action validates the latest archive and supplies a report and instructions; it does not claim that the separate restore has already completed.

**Acceptance.**
1. a scheduled run writes a backup to a test bucket, a forced failure notifies owners, and the restore drill restores into an empty deployment where links resolve to the same records.
2. Chest inherits the same destination contract when an intake exists; email failure notices inherit `NOTIF-005`.

**Evidence.** `tests/flagship/federation/federation.test.ts` — "PORT-009 — Scheduled backup writes to the destination, applies retention, notifies owners on failure and restores into an empty deployment" (Verify Slate: workers); `tests/qualification/ui-convergence/backups-journey.mjs` — "backupsJourney", loaded by "readable exports retain discussions through HTML and Markdown re-import" (Verify Slate: ui-content-desktop shards, 1440)
**Gap.** Committed live R2 receipt pending. A local held-key run passed connection, multipart readback, exact-key retention, real 403 owner notices and recovery, incomplete-scope refusal, empty-target restore and credential removal; all test objects and buckets were removed. Chest inherits this destination contract when it publishes an intake; no Chest destination is claimed. Email failure notices inherit NOTIF-005. No live provider acceptance is claimed without the committed receipt; no other provider was used.

#### PORT-010 — Word export of a page

Core · target · **done**

**Requirement.** A member can export one page, or a page with its descendants, as one Word `.docx` file. It carries headings, bulleted, numbered and toggle lists, tasks with their checked state, assignee and due date, tables with horizontal and vertical merged cells, code, callouts, images with their alt text, equations, diagrams as images and links: links to other exported pages resolve inside the document, and other links point to their Slate URLs. A table of contents (`BLOCK-017`) exports as a linked list. Comments can be included as Word comments, retaining authors, times, replies and resolved state under `PORT-008`'s authorization rules. The file carries only what the exporting member can read: an unreadable descendant contributes no content, title, count or placeholder. Access is rechecked before the export is returned. Re-importing under `IMP-005` reproduces headings, tables including merged cells, and images with their alt text.

Every string is XML-escaped. The document contains no macros and no external relationships except hyperlinks to Slate URLs; image bytes come only from files the exporting member can read. The not-yet-implemented equation and diagram blocks inherit these Word obligations in their own clauses and acceptance: `BLOCK-013` carries equations as OMML or images and Mermaid diagrams as images; `BLOCK-019` carries diagrams.net previews as images. Their absence does not invent an export representation or establish those clauses as implemented.

**Acceptance.**
1. a default-profile Workers journey exports a seeded page containing every implemented block kind listed above as `.docx`, parses the document, comments and relationships, and checks formatting, merged cells, task metadata, image alt text, linked contents, internal page anchors and optional comments.
2. It verifies escaped XML, no macros and no external relationships except hyperlinks to Slate URLs, then re-imports under `IMP-005` with the same headings, merged tables and images with alt text.
3. A member without access to one child exports the parent with descendants, and the file names nothing from that child; inaccessible media is never embedded and a concurrent access change prevents a stale export.
4. `BLOCK-013` and `BLOCK-019` add their inherited equation and diagram checks when those blocks ship.
5. A browser journey at 1440 and 390 selects Word, includes or excludes comments, downloads the file and verifies the comments choice.

**Evidence.** `tests/e2e/imports/word-export.test.ts`, `tests/qualification/ui-convergence/export-comments-journey.mjs`
**Gap.** Equations and diagram images are inherited by `BLOCK-013` and `BLOCK-019`.

### Integrations

#### EMBED-001 — Live issue embeds from Vector and Jira

Core · target · **missing**

**Requirement.** Pasting a [Vector](https://github.com/just-every/run-vector) or Jira issue URL, or a Vector or JQL query, renders a live card or table showing status, assignee, priority and sprint, refreshed on open and every 5 minutes. A query embed can also display as a pie chart by one field, a two-dimensional table of counts by two fields, or a created-versus-resolved chart over a period. Each reader sees issue details only through their own linked account. A reader without a linked account sees "Connect to view", never the details Slate fetched for someone else. Selecting text offers "Create issue", which files the issue under the member's account and links it in both directions: the page shows the issue, and the issue carries a backlink to the page (`EMBED-005`).

**Acceptance.**
1. a browser journey with recorded Jira and Vector API fixtures renders a card, a query table and the same query as a pie chart and a two-dimensional chart whose counts match the fixture, refreshes a changed status, creates an issue from selected text with a backlink, and shows "Connect to view" to an unlinked member.
2. Provider acceptance repeats this against a real Jira Cloud site.

**Evidence.** —
**Gap.** not implemented

#### EMBED-002 — GitHub and GitLab embeds

Core · target · **missing**

**Requirement.** Pull request, issue, commit and release links render live cards with their state and checks. A file-range permalink renders the code pinned to its commit, with a notice when the default branch has changed those lines since. Reader access follows `EMBED-001`'s per-member rule.

**Acceptance.**
1. a browser journey with recorded GitHub and GitLab fixtures renders a PR card, a pinned code range with a "changed since" notice after the fixture's branch moves, and the unlinked-member state.

**Evidence.** `src/core/features/connectors/github.ts`
**Gap.** not implemented

#### EMBED-003 — Design, video and document embeds

Core · target · **partial**

**Requirement.** Allowlisted embeds render inline through oEmbed or provider iframes: Figma, Miro, Lucid, Loom, YouTube, Vimeo, Google Docs, Sheets and Slides, and Microsoft 365 files. Each sets a sandbox and a content security policy per provider, loads nothing before the reader interacts on a published page (`BASE-PUBLIC-001`), and falls back to a link card (`BLOCK-009`) when the provider refuses.

**Acceptance.**
1. a browser journey embeds one item per provider using recorded fixtures, checks the sandbox and CSP attributes, and confirms that a published page loads no third-party request before a click.

**Evidence.** `tests/e2e/editor/provider-embeds.test.ts` — existing EMBED-003 registration via embedRefusalsJourney (`tests/e2e/editor/embed-refusals-journey.ts`) proves paired allowed/refused origins, zero visitor provider reads, expired-verdict rejection and member refresh, private/loopback/link-local literals and redirect-hop rejection, observation values free of member identity and credentials, and closed-target refusal of decimal, hex and IPv4-mapped literals, userinfo, non-443 ports and non-https schemes, plus stopped non-allowlisted redirects and arbitrary-host published link cards with zero probes, Verify Slate: workers (1/6); `tests/e2e/review/verification-upgrade.test.ts` — populated prior-schema upgrade, Verify Slate: workers; `tests/qualification/ui-convergence/provider-embeds-journey.mjs` via embedTimeoutJourney, Verify Slate: ui-content-desktop shards (1440)
**Gap.** Unrecognized HTTP-200 error documents; provider-specific authenticated/consent refusals; live provider acceptance NOT RUN; arbitrary-host embeds are not probed.

#### EMBED-004 — Live file cards from Drive, SharePoint and Chest

Core · target · **partial**

**Requirement.** A file picker inserts Google Drive, SharePoint/OneDrive or [Chest](https://github.com/just-every/run-chest) files by reference. Each card shows the file's current title, owner, last modified time and type, and whether the reader can open it. Slate never copies the file unless the member chooses "attach a copy" (`BLOCK-008`).


Drive and SharePoint references use the inserting member's own provider connection. Metadata is resolved afresh with each reader's own provider authority: when it cannot open the file, the card exposes no title, owner, type or time, only the provider, request-access action and provider link; an unconnected reader also sees the existing connect path. This conservative default grants no provider permission. Unmapped or ambiguous provider identity and ACL refresh failure disclose no metadata (`CONNECT-002`). Deleted files show unavailable without retained metadata. Disconnect destroys the member token and retains page references. A reference stores and exports only provider, file ID and stable link; existing page revisions, archive/restore and erasure carry it without file bytes, tokens or cached metadata. Public pages and readable exports show the provider link without fetching metadata. [Chest](https://github.com/just-every/run-chest), the RunEditRun file-storage product, remains a named source gap while it publishes no metadata door.

**Acceptance.**
1. a browser journey with recorded provider fixtures inserts one file from each source, sees a renamed file's new title after refresh, and sees "request access" for a reader without access.

**Evidence.** `tests/e2e/editor/provider-embeds.test.ts` — EMBED-003 registration with [EMBED-004], fileCardsHttpJourney (`tests/e2e/editor/file-cards-journey.ts`); `tests/qualification/ui-convergence/provider-embeds-journey.mjs` — fileCardsJourney (`tests/qualification/ui-convergence/file-cards-journey.mjs`) at 1440 (`evidence/file-cards/`), Verify Slate: workers, ui-content-desktop shards
**Gap.** Chest card needs Chest's file-metadata door, not published. Real Google Drive and SharePoint acceptance NOT RUN: recorded provider fixtures only; no real provider call or consent was used. Conservative default: no metadata unless the reader’s own provider authority can open the file; request access and “Connect to view” when unconnected (ct, 22 October 23:00Z).

#### EMBED-005 — Backlinks on Jira and Vector issues

Core · target · **missing**

**Requirement.** When a page embeds, mentions or links a Jira or Vector issue (`EMBED-001`), or a member or a rule creates an issue from it (`EMBED-001`, `AUTO-006`), Slate writes exactly one link to the page on the issue, so the issue lists the Slate pages that reference it. In Jira Cloud this is a remote issue link (`POST /rest/api/3/issue/{key}/remotelink`) with a stable global ID for each page and issue, written under the acting member's linked account. In [Vector](https://github.com/just-every/run-vector) it is Vector's own page link. Embedding the same issue again on the same page writes nothing new. Renaming the page updates the link's title. Removing the page's last reference to the issue, or trashing or erasing the page, removes the link, and restoring the page writes it again. A page in a `private` or `personal` container, a draft (`LIFE-002`), or a page under a Confidential classification (`ADMIN-006`) gets a link titled "Slate page" with no page title, and opening any backlink still requires Slate access. A failed write is retried under its operation key and shown on the embed, never dropped silently. Links that people add to the page from the Jira or Vector side are listed on the page (`EMBED-007`), and the links Jira already holds to Confluence pages that Slate migrated are re-pointed at cutover (`EMBED-006`).

**Acceptance.**
1. a Workers journey against recorded Jira Cloud and Vector API fixtures embeds one issue, mentions a second and creates a third from selected text, and finds exactly one remote link to the page URL on each issue.
2. Embedding the first issue again writes no second link, renaming the page updates the link titles, removing the embed deletes its link, and a draft's link carries the neutral title.
3. Provider acceptance repeats this against a real Jira Cloud site.

**Evidence.** —
**Gap.** not implemented

#### EMBED-006 — Jira links to migrated Confluence pages are re-pointed at cutover

Core · target · **missing**

**Requirement.** An optional cutover step re-points the Jira issue links that point at Confluence pages Slate has migrated (`IMP-007`, `IMP-003`). A workspace owner runs it under their own linked Jira Cloud account. It finds the links in two ways:

- Jira's `issuesWithRemoteLinksByGlobalId` query for the application-link global ID of every migrated page, which finds the links Confluence wrote when a page embedded an issue;
- a scan of the remote links on issues in the Jira projects the owner selects, matching each web link's URL against the `IMP-013` map in any of its forms.

A preview lists every proposed change by issue: the old link, the Slate link to be written and the action for the old link. Issues the account cannot edit and links to pages that were not migrated are listed separately and left alone. On apply:

- each issue gets exactly one Slate backlink to the migrated page, with `EMBED-005`'s semantics: a stable global ID, the neutral title "Slate page" for a page in a `private` or `personal` container, a draft or a Confidential page, and no second link where an `EMBED-005` backlink already exists;
- the old Confluence link is removed, or relabeled "Confluence (retired): title", as the owner chose for the run. A relabeled link keeps its URL, so the resolver and the extension still route it;
- each change is recorded in the run log with its issue, old link, new link and action, and appears in the cutover report;
- re-running the step changes nothing, and reverting a run restores each old link and removes each Slate link it wrote.

[Vector](https://github.com/just-every/run-vector) issues that carry Confluence links, for example from a Jira import into Vector, are re-pointed the same way through Vector's API.

**Acceptance.**
1. a Workers journey runs against a recorded Jira Cloud fixture: - issue J1 has an application-linked remote link to migrated page P1; - J2 has a web link to P1's tiny link; - J3 has a web link to the page-ID URL of P2, in a `private` container; - J4 links to a page that was not migrated; - J5 is in a project the owner's account cannot edit.
2. The preview lists changes for J1, J2 and J3, lists J4 as not migrated and J5 as skipped.
3. Applying in relabel mode leaves J1, J2 and J3 each with exactly one Slate remote link carrying the stable global ID, beside the relabeled Confluence link, and J3's Slate link is titled "Slate page".
4. J4 and J5 are unchanged, and the run log has three entries.
5. Re-running writes nothing.
6. A second run on a fresh fixture in remove mode removes the Confluence links, and reverting it restores them.
7. A variant in which J1 already carries an `EMBED-005` backlink writes no second link.
8. The same journey runs against a recorded Vector fixture, and provider acceptance repeats it against a real Jira Cloud site.

**Evidence.** —
**Gap.** not implemented

#### EMBED-007 — Issues that link here

Core · target · **missing**

**Requirement.** Each page has an Issues panel, like Confluence's Jira links button, listing the Jira and Vector issues that link to the page. That includes the backlinks `EMBED-005` and `EMBED-006` wrote, and remote links people added from the Jira or Vector side to the page's Slate URL or to an old Confluence URL that `IMP-013` maps to it. Slate finds the links three ways: Jira's `issuesWithRemoteLinksByGlobalId` query for its own global IDs, a periodic scan of the remote links on issues in the connected projects within `seed.json → limits`, and Vector's page-link query. Each reader sees an issue's key, title and status only through their own linked account (`EMBED-001`). An issue their account cannot read is neither shown nor counted, and a reader with no linked account sees "Connect to view". The page header shows the panel's count, and each issue opens in its tracker.

**Acceptance.**
1. a Workers journey against recorded Jira Cloud and Vector fixtures links four issues to one page: one by a Slate backlink from an embed, one by a web link to the page's Slate URL added from the Jira side, one by a web link to the page's old Confluence URL, and one in a project that a second reader's account cannot read.
2. A browser journey shows a reader with full Jira access all four, the second reader three with no trace or count of the fourth, and an unlinked member "Connect to view".
3. A link added from the Jira side after the first scan appears after the next scan interval with no Slate edit.
4. Provider acceptance repeats this on a real Jira Cloud site.

**Evidence.** —
**Gap.** not implemented

#### EMBED-008 — Slate for Jira: smart links and project pages

Core · target · **missing**

**Requirement.** Slate ships an Atlassian Forge app that gives Jira what Confluence's own integration gave it. The buyer installs it on their Jira Cloud site from a distribution link, with no Marketplace listing.

- **Smart Links.** A Slate URL pasted into a Jira issue description or comment renders as a Smart Link with the page's title, verification state and last update. Slate reads it as the viewing Jira user's linked Slate identity, linked once like `CHAT-002`'s chat identity. A page that identity cannot read renders as "Restricted Slate page", and an unlinked viewer gets a "Connect Slate" prompt.
- **Project pages.** A Jira project admin links the project to one or more Slate containers. The project sidebar then shows a "Slate" page listing the pages of those containers that the viewer's linked identity can read, with search, recently updated pages and a "Create page" action that opens Slate.

[Vector](https://github.com/just-every/run-vector) projects get the same through Vector's own project link: a linked container's readable pages appear in the project, and Slate URLs render with their titles.

**Acceptance.**
1. a Workers journey sends the app's recorded Forge invocations, link resolution and project-page requests, to Slate's app endpoint for a reader, a non-reader and an unlinked Jira user.
2. The reader gets the title, verification state and last update, the non-reader gets "Restricted Slate page", and the unlinked user gets the connect prompt.
3. The project page lists only each user's readable pages of the linked container.
4. A browser journey does the same through Vector's project view.
5. Provider acceptance deploys the app to a real Jira Cloud development site, pastes a Slate URL into an issue and sees the Smart Link, and opens the project's Slate page.

**Evidence.** —
**Gap.** not implemented

#### CHAT-001 — Chat notifications to Slack, Microsoft Teams and Nook

Core · target · **partial**

**Requirement.** Workspace and container owners connect any number of channels in Slack, Microsoft Teams or [Nook](https://github.com/just-every/run-nook), each with its own event selection: published or updated pages, new comments, blog posts, review requests and lapsed verifications in the container. `NOTIF-003`'s guarantees apply to every destination: link-only messages, access-checked links, encrypted credentials returned by no API response and destroyed on disconnect, startup refusal naming `CONNECTOR_CREDENTIALS_KEY` when any destination is connected and that key is missing, delivery and failure state, transient-only retry, and stopping on disconnect. Expired or revoked authorization marks that destination as needing attention, offers reconnect and stops sending to it while retaining the destination, its event selection and its delivery history. Every Slack destination, however it is authorized, also meets `NOTIF-003`'s Slack channel and audience rules. Every Teams and Nook destination meets the same rule in its provider's terms: a channel whose full roster Slate can read and only admitted members change (Teams private team or private channel, Nook private channel), not shared with another organization (`NOOK-031`), with no guest, external account or bot but Slate's, and every person an active Slate member by verified email who can read the linked record immediately before sending; Slate refuses it at connect, rechecks before every send and sends nothing while it fails. Slack connects as an OAuth app a workspace admin installs; Teams as an app package an Entra admin consents to with resource-specific channel permissions; Nook through `NOOK-080`. Slate honours each provider's rate limit and `Retry-After` without loss, and coalesces more than five events per destination per minute into one message. Later events on the same page within 24 hours reply in its first message's thread. Each destination chooses immediate or daily digest. When a page is deleted, moves beyond the channel's audience or its actor is erased (`WORK-007`), Slate edits every message it sent about it to "Restricted Slate page".

**Acceptance.**
1. a Workers journey with provider fakes at the network edge connects one channel per provider, fires each event kind and finds exactly one link-only message per destination.
2. Disconnecting one destination stops only that destination.
3. Provider acceptance repeats this with real Slack and Teams workspaces.
4. The fixture journey also proves the inherited `NOTIF-003` guarantees for every destination: its links still require access; it shows its own last delivery and last failure; only transient transport failures are retried; its credential is encrypted, absent from every API response and destroyed on disconnect; a deployment with a destination connected and `CONNECTOR_CREDENTIALS_KEY` missing refuses at startup naming it; an expired or revoked authorization marks only that destination as needing attention and stops it while keeping it, its event selection and its delivery history for reconnect; and every Slack destination is shown to meet `NOTIF-003`'s Slack channel and audience rules, including their refusal and no-send cases.
5. The fixture journey refuses a Teams and a Nook channel holding a guest, external share or other bot; coalesces 20 events; threads an update; survives a 429; sends a digest; and rewrites sent messages after deletion, narrowing and erasure.
6. Provider acceptance installs both apps through admin consent.
7. *Semantics:* Requested Nook replies refuse, uncertain sends stay held, and unresolved withdrawals remain recorded.
8. A held send shows as "Needs attention" to owners with a resolve action and is never silently dropped or re-sent (no double post). Until Nook offers client-key lookup, the owner acknowledges without resending; acknowledgment preserves uncertainty and unresolved withdrawal records. Retry is permitted only once Nook offers client-key lookup.

**Evidence.** `tests/e2e/notifications/destinations.test.ts` — "CHAT-001 — Owners connect several chat destinations, each with its own event selection, and every destination sends one link-only message, fails and disconnects on its own"; same file — "CHAT-001 — Nook channel changes are refused before custody changes while rotation and independent destinations work" (Verify Slate: workers; NOOK-080/089 thread, same-key receipt and replacement-approval HTTP assertions in `tests/e2e/notifications/nook-http-journey.ts`); `tests/qualification/ui-convergence/chat-journey.mjs` — "chatJourney" (1440/390); `tests/e2e/notifications/chat.test.ts` — "NOTIF-003 — chat admission requires fresh authority and keeps link-only delivery inside the current audience" (inherited admission and audience assertions)
**Gap.** The NOOK-080 HTTP door with NOOK-089 exists on Nook main 7dd6d142; Slate maps its documented thread field and client-key receipt lookup through the deployment's NOOK_NOTIFICATION_ORIGIN. Recorded network-edge fixtures prove replies in the page's first-message thread within 24 hours, same-key acceptance receipts without another post, and replacement-approval edits of earlier posts after deletion, audience narrowing and actor erasure under the current exact approved (app name, channel) authority. Missing, tombstoned, malformed or unavailable lookup never authorizes a resend; unresolved withdrawals remain recorded. Live Nook acceptance against a real deployment remains open: fixture-only, synthetic-slate-<n>. Slack workspace-admin OAuth installation and Teams Entra-admin app-package consent with resource-specific permissions remain open; the shipped Teams path uses a delegated token, and refuses destinations unless Graph can enumerate the complete private roster, tenant, user and installed-bot facts. Graph directory mail does not independently prove mailbox verification. Withdrawal cannot edit remote messages after disconnect, revoked authorization or connection-owner erasure destroys the credential; those receipts retain unresolved withdrawal state. Live Slack acceptance needs a private unshared channel; live Teams acceptance needs a licensed Teams user. No live-provider acceptance is claimed. Chest as a destination remains open.

#### CHAT-002 — Ask and unfurl in chat

Core · target · **missing**

**Requirement.** In Slack, Teams and Nook:

- a Slate page link unfurls with its title, status and verification, owner and last update, but only when the unfurling user's linked Slate identity can read the page; otherwise it shows "Restricted Slate page";
- `/slate` or a mention asks a question and gets a cited answer (`ANSWER-001`) computed for the asker alone, posted only to the asker when the channel's audience is broader than the sources' readers.

A member links their chat identity to Slate once, from Slate or from the app's first prompt in chat. The same link delivers their personal notifications (`CHAT-004`).

**Acceptance.**
1. a Workers journey with chat provider fakes unfurls a readable and a restricted link for two linked users.
2. An in-channel question citing a restricted page is answered privately to the asker, and an unlinked user is asked to link their account first.
3. Provider acceptance repeats this in a real Slack workspace.

**Evidence.** `src/core/features/connectors/slack.ts`
**Gap.** not implemented

#### CHAT-003 — Capture chat into pages

Core · target · **missing**

**Requirement.** A message shortcut in Slack, Teams or Nook creates a Slate page or card, or appends to an existing one, from a message or thread. It quotes the messages with their authors and a link back to the thread, and opens as a draft for the member to edit. When the same question recurs in a channel, Slate suggests to the member who answered that their answer become a card.

**Acceptance.**
1. a Workers journey with chat provider fakes captures a five-message thread into a new page with attributed quotes and a source link, and appends a second thread to the same page.

**Evidence.** —
**Gap.** not implemented

#### CHAT-004 — Personal notifications as chat direct messages

Core · target · **missing**

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

**Acceptance.**
1. a Workers journey with a chat provider fake at the network edge: - links a member's Slack identity and sets mentions and task assignments to chat; - finds that one mention and one assignment each produce exactly one direct message, carrying the actor, the page title and a link and no body; - finds that reassigning the task sends the new assignee one direct message and the previous assignee none; - finds that an event on a page the member lost access to before send produces nothing; - finds that a reminder set to chat arrives as exactly one direct message at the member's local time, and none when the member lost access to its page before it was due; - finds that "Mark as read" in the message clears the inbox item; - finds that unlinking stops direct messages from the next event; - has an owner set chat as the workspace default for mentions (`NOTIF-006`), and finds that a member who chose nothing receives a direct message; - finds that a member with no linked identity receives the mention by immediate email instead, never nothing, and sees the "Connect chat" prompt; - finds that a forced transient failure and retry deliver once.
2. The same journey runs against Teams and Nook provider fakes.
3. Provider acceptance repeats it in a real Slack workspace and a real Microsoft Teams tenant.

**Evidence.** —
**Gap.** not implemented

#### CONNECT-001 — Named connectors

Core · target · **partial**

**Requirement.** Slate connects to Google Drive, SharePoint/OneDrive, Confluence Cloud, Notion, Slack, Microsoft Teams, [Nook](https://github.com/just-every/run-nook), Jira, [Vector](https://github.com/just-every/run-vector), GitHub, GitLab, Salesforce, Zendesk, [HappyToHelp](https://github.com/just-every/run-happytohelp) and [Chest](https://github.com/just-every/run-chest), and to a member's own Gmail or Outlook mailbox when that member opts in. Each connector meets `SOURCE-001`: it declares its scopes, identity mapping, discovery coverage, an incremental sync target of 15 minutes, deletion and revocation propagation within 1 hour, and retention. Each is turned on per workspace by an owner.

**Acceptance.**
1. each connector has a Workers journey against a recorded provider fixture covering first sync, an incremental change, a deletion and a revoked user, and provider acceptance against a real authorized account for at least Drive, SharePoint, Slack, Teams, Jira and GitHub.

**Evidence.** `src/core/features/connectors/slack.ts`
**Gap.** see the clause

#### CONNECT-002 — Source permissions are mirrored

Core · target · **partial**

**Requirement.** Every connected item carries its source ACL, refreshed with the item. A member sees a connected item in search, answers, embeds or agent work only when their mapped source identity can read it now. An unmapped or ambiguous identity sees nothing from that source, a source ACL that fails to refresh fails closed, and a revocation in the source removes the item from that member's results within the connector's propagation target.

**Acceptance.**
1. a Workers journey with provider fakes runs a matrix of three members against items shared to a user, a group, a domain and nobody, revokes one share in the source, and asserts results before and after propagation, including that answers stop citing the revoked item.

**Evidence.** `src/core/features/connectors/authority.ts`
**Gap.** see the clause

#### CONNECT-003 — Connector health

Core · target · **partial**

**Requirement.** Owners see per connector: last sync, lag, items indexed and excluded with reasons, errors, identity-mapping coverage, and the next scheduled run. An owner can pause a connector, re-sync it, or disconnect and purge it, which removes its indexed content and derived answers within 1 hour (`SOURCE-005`, `SOURCE-006`).

**Acceptance.**
1. a browser journey shows a lagging connector's health, pauses and resumes it, and purges it, after which a search finds none of its items and an answer that cited them is marked invalidated.

**Evidence.** `src/core/features/connectors/service.ts`
**Gap.** see the clause

### Answers

#### ANSWER-001 — Cited answers in the default product

Core · target · **partial**

**Requirement.** Once an owner configures a provider and turns AI on (`AI-001`), every member gets Ask: a box above search results and a side panel on any page. It answers from pages, records, comments and connected items the asker can read, with inline citations that open the exact revision (`AI-004`, `REV-005`). It keeps the conversation: a follow-up question is answered in the context of the earlier turns, each answer offers up to three suggested follow-ups, and the member's past conversations are listed privately to them, can be reopened and continued, and can be deleted. Every turn recomputes access, so a follow-up never cites a page the asker has since lost. This needs no `SLATE_PROFILE=flagship` opt-in, and every `AI-*` guarantee applies.

**Acceptance.**
1. in the default profile with AI on and a provider fake at the network edge, a browser journey asks a question in search and in a page panel and gets an answer whose every citation opens its exact revision.
2. A follow-up that refers to the first answer only by pronoun ("who owns it?") is answered about the same page.
3. Clicking a suggested follow-up asks it.
4. The conversation reopens from the member's history after a reload, another member cannot list or open it, and deleting it removes it.
5. After the asker loses access to a cited page, the next follow-up does not cite it.
6. With AI off, Ask is absent and search is unchanged (`SEARCH-008`).

**Evidence.** `src/core/features/ai/integration.ts`
**Gap.** No validated CI-run proof for this acceptance point: "in the default profile with AI on and a provider fake at the network edge, a browser journey asks a question in search and in a page panel and gets an answer whose every citation opens its exact revision."<br>No validated CI-run proof for this acceptance point: "A follow-up that refers to the first answer only by pronoun ("who owns it?") is answered about the same page."<br>No validated CI-run proof for this acceptance point: "Clicking a suggested follow-up asks it."<br>No validated CI-run proof for this acceptance point: "The conversation reopens from the member's history after a reload, another member cannot list or open it, and deleting it removes it."<br>No validated CI-run proof for this acceptance point: "After the asker loses access to a cited page, the next follow-up does not cite it."<br>No validated CI-run proof for this acceptance point: "With AI off, Ask is absent and search is unchanged (`SEARCH-008`)."

#### ANSWER-002 — Answers state their trust

Core · target · **partial**

**Requirement.** Each answer shows, for every cited source, its verification state, owner and last update. It flags disagreement between sources, separates what the sources state from what the model inferred, and gives its uncertainty in words. When the only evidence is lapsed or conflicting, it says so and names the owner to ask, with a one-click review request (`STAT-006`). It prefers current verified sources, using `SEARCH-011`'s verification states and ordering; answer trust is proven by this clause's acceptance, not by `SEARCH-011`'s.

**Acceptance.**
1. a Workers journey with a provider fake asks over a corpus with a verified, a lapsed and a conflicting page, and asserts that the response's structured fields mark each citation's state, the conflict and the named owner, that among equally relevant sources the current verified page is cited ahead of the lapsed one (`SEARCH-011`), and that the review request is created once.

**Evidence.** `tests/flagship/intelligence/authority.test.ts`
**Gap.** see the clause

#### ANSWER-003 — Answers never leak restricted knowledge

Core · target · **partial**

**Requirement.** No answer, citation, follow-up suggestion, "no answer" wording, latency pattern, cache entry, embedding neighbor or count reveals a page, record, comment or connected item the asker cannot read. Caches and embeddings are keyed to the access state they were computed under and invalidated when it changes (`AI-013`).

**Acceptance.**
1. an adversarial Workers suite asks 50 probing questions as a member without access to a seeded secret page, including paraphrases, title guesses, "does a page exist" questions and prompt injection inside readable pages.
2. It asserts no secret token, title or count appears and that "no answer" responses are identical with and without the secret page present.
3. The suite then revokes a grant and repeats.

**Evidence.** `tests/qualification/authority/skill-disclosure.test.ts`
**Gap.** see the clause

#### ANSWER-004 — Feedback and unanswered questions

Core · target · **missing**

**Requirement.** Members rate answers as helpful or not helpful and can report a wrong answer with a note. Unanswered and low-rated questions are logged with their timestamps but without the asker's identity, unless the asker chooses to follow up. They are clustered weekly into a report for container owners showing frequency, the sources tried and suggested experts. This report feeds `KEEP-003`.

**Acceptance.**
1. a Workers journey records 30 questions with ratings, runs clustering, and asserts the report's clusters, counts and anonymity, and that a "wrong answer" report notifies the cited page's owner once.

**Evidence.** —
**Gap.** not implemented

#### ANSWER-005 — Summaries and catch-up

Core · target · **partial**

**Requirement.** A member can summarize a page, a comment thread, the changes to a page since their last visit, or a container's week. Each summary cites exact revisions and can be posted to chat (`CHAT-001`) or inserted under `AI-016`.

**Acceptance.**
1. a Workers journey with a provider fake summarizes "changes since last visit" for a member and finds that the summary cites exactly the revisions after that member's last view.

**Evidence.** `src/core/features/ai/routes.ts`
**Gap.** see the clause

#### ANSWER-006 — Owner-chosen models and data controls

Core · target · **partial**

**Requirement.** The owner picks the provider (Anthropic, OpenAI, Azure OpenAI, Amazon Bedrock, Google Vertex AI or a local model), sets a monthly budget in USD (`AI-012`), and can exclude containers or labels from AI entirely. Excluded content is never sent to a provider or embedded. Settings show what each provider retains under the owner's agreement with it.

**Acceptance.**
1. a Workers journey configures two providers with fakes at the network edge, excludes a container and asserts that no request body ever contains its content, and stops at the USD budget with a visible reason.

**Evidence.** `src/core/features/ai/integration.ts`
**Gap.** see the clause

### Platform

#### API-001 — Public REST API

Core · target · **partial**

**Requirement.** A versioned `/api/v1` covers pages, blocks, databases, records, comments, search, members, groups and files, described by a published OpenAPI document. It uses cursor pagination, operation keys (`SAVE-005`), declared rate limits and a stable error shape. Authentication is a personal access token or an OAuth 2.0 app with scopes (read or write, per container). Every call acts as exactly one member and passes the same checks as the UI (`SHARE-002`, `LIFE-002`, `SEARCH-005`). Tasks (`BLOCK-015`) are read and changed through it, with their assignee, due date and completion, under the same checks and notifications as the UI: assigning a member who cannot read the page is refused until it is shared, and completion records who and when.

**Acceptance.**
1. a contract suite generated from the OpenAPI document runs every operation over HTTP with a token for each of two members, asserting the schemas and that every access difference matches the UI's.
2. Expired, revoked and under-scoped tokens are refused.
3. The suite assigns, dates, reassigns and completes a task and finds the same refusals, notifications and completion record as the UI.

**Evidence.** `tests/e2e/public-api/contract.test.ts` — personal API tokens run the published HTTP contract with member parity, task effects and immediate authority loss
**Gap.** OAuth applications; databases, records, comments, search, members, groups, files and URL resolution. Conservative token custody defaults in the clause Status await ct; no Admin role exists.

#### API-002 — Webhooks

Core · target · **partial**

**Requirement.** Owners and OAuth apps subscribe to page, record, comment, status, verification and member events by container. Deliveries are HMAC-signed with a timestamp, retried with backoff for 24 hours, logged with their responses, replayable, and disabled with a notice after repeated failure. Payloads carry IDs and titles only when the subscription's acting member can read the record.

**Acceptance.**
1. a Workers journey subscribes a test endpoint, produces events, verifies the signatures, forces failures and sees the backoff and the disable notice, replays one delivery, and confirms that a record the subscriber cannot read produces no payload.

**Evidence.** `tests/e2e/webhooks/deliveries.test.ts` — owner webhook subscriptions sign current readable events, persist backoff, replay and disable once without following refused destinations; `tests/qualification/ui-convergence/webhook-access-journey.mjs` — webhookAccessJourney (1440)
**Gap.** OAuth application subscribers and address-pinned resolved-address egress. Default ADOPTED: owner-entered public HTTPS 443, no redirects, ten-second exchanges; ct confirmation and real receiver acceptance pending.

#### API-003 — MCP server

Core · target · **partial**

**Requirement.** A remote MCP endpoint (Streamable HTTP with OAuth 2.1) exposes search, fetch page with citations, list and query databases, ask (`ANSWER-001`), comment, and create or update a page. Claude, ChatGPT, Cursor and other MCP clients can use it. Every tool acts as the signed-in member. Write tools create suggestions (`SUG-001`) unless the member has granted direct writes to that client for named containers (`AI-011`), and page text returned to the client is marked as untrusted content. Tools read a member's tasks and change their assignee, due date and completion (`BLOCK-015`) under the same checks and notifications as the UI.

**Acceptance.**
1. an MCP client conformance run lists the tools, calls each one as two members and asserts access parity with the UI, confirms that a write without a grant becomes a suggestion, and confirms that revoking the client ends its session at once.
2. With a direct-write grant, it assigns, reassigns and completes a task and finds the same notifications and completion record as the UI.

**Evidence.** `src/core/features/external-agent/routes.ts`
**Gap.** No validated CI-run proof for this acceptance point: "an MCP client conformance run lists the tools, calls each one as two members and asserts access parity with the UI, confirms that a write without a grant becomes a suggestion, and confirms that revoking the client ends its session at once."<br>No validated CI-run proof for this acceptance point: "With a direct-write grant, it assigns, reassigns and completes a task and finds the same notifications and completion record as the UI."

#### API-004 — App and token administration

Core · target · **partial**

**Requirement.** Owners see every personal access token, OAuth app, MCP client and webhook, with its member, scopes, creation time and last use, and can revoke any of them. Members see and revoke their own. Tokens expire after a default of 90 days. Revocation takes effect on the next request, and every grant and revocation is recorded in activity.

**Acceptance.**
1. a browser journey creates a token and an OAuth app, sees both with last use after an API call, revokes each and gets 401 on the next request, and finds the activity entries.

**Evidence.** `tests/e2e/public-api/contract.test.ts`; `tests/qualification/ui-convergence/developer-access-journey.mjs` — developerAccessJourney, existing readership journey at 1440
**Gap.** OAuth applications and MCP clients. Default ADOPTED: PARTIAL; carve awaits ct.

#### API-005 — Zapier, Make and Crank apps

Core · target · **missing**

**Requirement.** Slate publishes an app in the Zapier app directory and one in Make's app directory, and ships a [Crank](https://github.com/just-every/run-crank) connector. Each one connects to the buyer's own deployment by URL through `API-001`'s OAuth app flow and acts as the connecting member.

- **Triggers** use `API-002` webhooks (REST hooks), never polling where a webhook exists. They cover a page published or updated, a comment added, a record created or updated, a verification lapsed, a review requested and a form submitted (`DB-013`).
- **Actions** create a page from a template, append to a page, create or update a record, add a comment, request review and search.
- **Access.** A trigger never fires for a record the connecting member cannot read, and an action passes the same checks as the UI.
- **Revocation.** Revoking the app under `API-004` stops its triggers and actions on the next request.

**Acceptance.**
1. - The Zapier Platform CLI's validation and the app's integration tests run against a test deployment.
2. Each trigger fires once from a real event through a REST hook, and each action creates its record as the connecting member. - A page the member cannot read fires no trigger. - Revoking the app returns 401 on the next action. - Make's app validation and the Crank connector's tests run the same journey. - The published listings are recorded with the release evidence.

**Evidence.** —
**Gap.** not implemented

#### ADMIN-001 — SAML single sign-on

Core · target · **partial**

**Requirement.** Slate is a SAML 2.0 service provider for Okta, Microsoft Entra ID, Google Workspace, JumpCloud and [Auth](https://github.com/just-every/run-auth). It supports both SP- and IdP-initiated sign-in, signed assertions, an email domain verified by a DNS TXT record the owner publishes (rechecked daily; a failed check stops new just-in-time creation and notifies owners) and just-in-time creation of invited or allow-listed members. When an owner enforces SSO, members sign in only through the provider, guests keep magic links, and one designated owner keeps a magic-link break-glass path. Slate's OIDC identity-provider function (WORK-015) stays available to members who have signed in through the enforced method.

**Acceptance.**
1. a browser journey against a SAML test IdP verifies a domain through a TXT record served by a DNS fake at the network edge, refuses just-in-time creation for an unverified domain, signs in through SP and IdP flows, rejects an unsigned assertion and one with the wrong audience, enforces SSO for a member while a guest uses a magic link, and confirms break-glass access for the designated owner.
2. Provider acceptance repeats this with real Okta and Entra tenants.
3. *Semantics:* Owners configure one pinned SAML issuer and certificate, verify one email domain through its TXT challenge, and explicitly enable enforcement.
4. Assertions require a verified XML signature over the exact assertion, current issuer/audience/recipient/time checks and a durable replay fence; SP flows also require the issued browser-bound request.
5. New members require a current verified domain and an unused invitation or an exact allow-listed email.
6. Failed daily domain verification stops new JIT admission and notifies owners in-app.
7. While enforcement is on, full members sign in only through the configured SAML provider (every other member sign-in route, OIDC-based included, is off); guests keep magic links; exactly the designated active owner keeps the mailbox break-glass; previously issued native proofs and sessions do not bypass enforcement; an unauthenticated person can never obtain OIDC-provider tokens by a route that skips enforcement.
8. SP AuthnRequests are unsigned; assertions must be signed. Migration `0049_saml_single_sign_on.sql` extends the native session ledger and adds deployment-only SAML configuration, requests and replay fences. Provider trust, pending requests and sessions do not cross backup/restore.

**Evidence.** `tests/flagship/core/identity-upgrade.test.ts` — "ADMIN-001 — signed SP and IdP SAML, DNS-gated invited or allow-listed JIT, enforced member SSO and one owner mailbox escape" (Verify Slate: workers); `tests/qualification/ui-convergence/saml-journey.mjs` — "samlJourney", loaded by "SAML sign-in verifies the domain and signatures while preserving guest and designated-owner access" (Verify Slate: ui-content-desktop shards, 1440)
**Gap.** Real Okta and Microsoft Entra ID SAML provider acceptance is NOT RUN. Google Workspace, JumpCloud and Auth SAML provider acceptance is also NOT RUN. Pre-enforcement Managed preview owner sessions lack provenance distinguishing them from mailbox sessions; that prior-session case is not proven. WORK-015 currently implements sign-in through an external OIDC provider; Slate exposes no OIDC identity-provider token-issuance door, so the identity-provider-function sentence remains unproven.

#### ADMIN-002 — SCIM provisioning

Core · target · **partial**

**Requirement.** A SCIM 2.0 endpoint provisions users and groups from Okta, Entra ID, JumpCloud and Auth. Create invites the member. Update changes the name, email and groups (`WORK-009`). Deactivate runs `WORK-007` removal within 60 seconds, revoking sessions, tokens and devices. The bearer token is owner-generated, rotatable and stored hashed.

**Acceptance.**
1. a SCIM compliance run (Okta's SCIM test suite shape) creates, updates, pushes groups to and deactivates users, and asserts the resulting members, groups, revoked sessions and activity entries.
2. *Status:* **partial** — A dedicated hashed owner credential authenticates the SCIM users/groups endpoint.
3. Native invitations, Member identity changes, group writes and removal provide provisioning and immediate session/token revocation.
4. Credentials rotate and revoke on the next request; activity identifies the directory credential.
5. Default ADOPTED: Member only, name/email/groups only, protected Owners and guests, and the configured member capacity estimate enforced for SCIM admission.
6. Provider acceptance is not run, and native invitations outside SCIM do not yet share this capacity guard.

**Evidence.** `tests/e2e/scim/contract.test.ts` — SCIM RFC7643/7644 HTTP sequence uses native invitations, Members, groups and revocation authority; populated upgrade, revoked restore and erasure; `tests/qualification/ui-convergence/scim-access-journey.mjs` (1440)
**Gap.** Real Okta, Entra ID, JumpCloud and Auth acceptance is not run. Default ADOPTED: Member role and name/email/groups only, Owner/guest/break-glass protection, hashed owner credentials; scoped admission cap applies to SCIM, while native invitation admission has no shared capacity guard.

#### ADMIN-003 — Guest management

Core · target · **done**

**Requirement.** Owners list every guest with what they can access, who invited them, when they were last active, and their expiry. They can set a default guest expiry, keep allow and deny lists of email domains, and revoke guests in bulk. A guest's access never outlives their expiry (`SHARE-008`).

**Acceptance.**
1. a browser journey lists three guests with their access, bulk-revokes two (their open sessions end under `SHARE-007`), and rejects an invite to a denied domain.

**Evidence.** `tests/qualification/policies/invitations.test.ts`, `tests/qualification/ui-convergence/guest-console-journey.mjs`
**Gap.** None.

#### ADMIN-004 — Workspace analytics

Core · target · **done**

**Requirement.** Owners and container owners get reports on views and unique viewers (`PAGE-013`), stale pages (unedited and unverified for a chosen period), pages without an owner, lapsed verifications by owner, most-viewed unverified pages, searches with no results, and container growth. Reports export as CSV. They never show an individual's reading history beyond what `PAGE-013` already shows on a page.

**Acceptance.**
1. a Workers journey over a seeded workspace asserts each report's rows, the CSV export, and that a container owner sees only their own container's figures.

**Evidence.** `tests/e2e/pages/analytics.test.ts`, `tests/qualification/ui-convergence/analytics-journey.mjs`
**Gap.** None.

#### ADMIN-005 — Audit export and SIEM streaming

Core · target · **partial**

**Requirement.** Owners filter the workspace audit trail (`ACT-*`, including sign-ins, permission and sharing changes, exports, token use and admin settings) and export it as CSV or JSON. They can stream it to Splunk, Datadog or Microsoft Sentinel through a signed webhook (`API-002`), with a retention setting no shorter than one year.

**Acceptance.**
1. a Workers journey produces each audited action kind, exports it and finds every action with its actor, time and target, and streams it to a test receiver with valid signatures and no gaps after a receiver outage.
2. *Status:* **partial** — Owners export a bounded, filtered metadata-only audit trail as CSV or JSON, with formula neutralization and an audited export.
3. Native sign-ins, permission/sharing, token use and admin settings are covered.
4. Server-enforced retention is at least 365 days.
5. Ordered signed audit destinations persist an outage backlog and resume by stable event ID.
6. The stream inherits API-002’s adopted destination rule and address-pinning Gap; real vendor receiver acceptance remains open.

**Evidence.** `tests/qualification/core/audit-content.test.ts` — auditExportProof: audited action families, filtered CSV/JSON, neutralized formulas, retention floor, signed ordered outage recovery; `tests/qualification/ui-convergence/audit-access-journey.mjs` (1440)
**Gap.** Signed generic webhooks inherit API-002’s unresolved address pinning and adopted destination rule; real vendor receivers and vendor-specific formats are not claimed.

#### ADMIN-006 — Content governance

Core · target · **partial**

**Requirement.** Owners decide who may create containers, publish publicly, invite guests, export and use AI. A container may carry a classification label, such as Confidential, that by default forbids public links and AI for its pages, and only a workspace owner can lift those defaults. Every governance change is recorded in activity.

**Acceptance.**
1. a browser journey restricts public publishing to owners, labels a container Confidential, and confirms that a member's publish attempt, an AI request over a confidential page and an export by a non-permitted member are each refused with a reason.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "a browser journey restricts public publishing to owners, labels a container Confidential, and confirms that a member's publish attempt, an AI request over a confidential page and an export by a non-permitted member are each refused with a reason."

#### ADMIN-007 — Every target surface ships in the default product

Core · target · **partial**

**Requirement.** Every surface that a target or push-further clause describes is part of the default product, and an owner turns it on in workspace settings with nothing else needed. Ask, AI writing and AI fields turn on once a provider is configured and AI is on (`AI-001`, `ANSWER-006`). Suggestions and agent maintenance (`SUG-*`, `KEEP-*`) turn on with AI. Each connector turns on once it is connected (`CONNECT-001`), and chat ask and unfurl once the chat app is installed (`CHAT-002`). MCP and OAuth clients work once a member grants them (`API-003`, `API-004`), and live co-editing is on from the start (`COLLAB-001`). No target surface requires `SLATE_PROFILE=flagship`. Settings show each switch's state and who changed it when, and every change is recorded in activity. Turning a switch off refuses its surface with `FEATURE_DISABLED` from the next request and stops its scheduled jobs, and it erases nothing. A surface also stays refused until its clause's own safety acceptance has passed: `ANSWER-003` for answers, `CONNECT-002` for connected items and `COLLAB-001`'s revocation test for co-editing. `SLATE_PROFILE=flagship` remains only for the inquiry, experiment, trial and production-effect extension (`INQ-*`, `TRIAL-*`, `EFFECT-002`).

**Acceptance.**
1. a Workers journey in the default profile, with `SLATE_PROFILE` unset, first finds every target surface (Ask, AI writing, AI fields, suggestions, MCP, each connector, chat ask and agent jobs) refusing with `FEATURE_DISABLED`.
2. It turns each owner switch on and finds its surface serving, then turns it off and finds it refusing again on the next request with its stored records intact.
3. A release check fails any target-clause journey that sets `SLATE_PROFILE=flagship`.

**Evidence.** `src/core/platform/config/launch-profile.ts`
**Gap.** see the clause

#### MOBILE-001 — Native iOS and Android apps

Core · target · **missing**

**Requirement.** App Store and Google Play apps let a member sign in (magic link, OIDC or SAML), read, search, ask, edit pages and blocks, comment, use the inbox, verify, and take photos straight into pages. They support share-sheet capture into Slate, deep links that open slate URLs in the app, and an optional biometric lock. They use the same API as the web (`API-001`) and the same access rules.

**Acceptance.**
1. automated device-farm journeys on current iOS and Android sign in, edit and comment on a page, verify it, take a photo into a page through the device camera, lock and unlock the app with the platform biometric prompt, receive a mention push, and open a deep link.
2. App Store and Play review builds are recorded with the release evidence.

**Evidence.** `tests/qualification/interface/routed.browser.mjs`
**Gap.** not implemented

#### MOBILE-002 — Desktop app

Core · target · **missing**

**Requirement.** A macOS and Windows desktop app opens Slate links natively, keeps several windows open on different pages and restores them on relaunch, supports offline pages (`MOBILE-003`) and system notifications, and updates itself through signed releases.

**Acceptance.**
1. automated journeys on macOS and Windows open a deep link, open a second window on another page and edit in both, quit and relaunch to find both windows restored on their pages, edit offline and sync, and receive a system notification.
2. The signed installers are recorded with the release evidence.

**Evidence.** —
**Gap.** not implemented

#### MOBILE-003 — Offline pages

Core · target · **partial**

**Requirement.** A member marks pages or containers as available offline on a device. Those pages, with their media and comments, stay readable and editable without a connection and merge on reconnect (`COLLAB-003`). A revoked grant, a removed member or a remote sign-out erases the offline copies at the next connection, and an owner can require that sessions on lost devices be signed out remotely.

**Acceptance.**
1. a device journey marks a container offline, edits in airplane mode and merges on reconnect, then has its access revoked and finds the offline copy erased on the next connection.

**Evidence.** `src/core/features/editor/ui/SaveStatus.tsx`
**Gap.** No validated CI-run proof for this acceptance point: "a device journey marks a container offline, edits in airplane mode and merges on reconnect, then has its access revoked and finds the offline copy erased on the next connection."

#### MOBILE-004 — Push notifications

Core · target · **missing**

**Requirement.** Mentions, replies, review requests, task assignments and due tasks (`BLOCK-015`), reminders and lapsed verifications can be pushed to a member's devices through APNs and FCM according to `NOTIF-005` preferences. A push payload carries the event and the page title only, and access is rechecked at send. A reminder push keeps `NOTIF-004`'s rules: it arrives at the member's local time and exactly once per reminder, even when a send is retried.

**Acceptance.**
1. a Workers journey with APNs and FCM fakes at the network edge sends exactly one push per eligible event, none for a page whose access was revoked before send, and payloads with no body text.
2. Reminders set in two time zones push once each at their members' local times, and a retried send does not push a reminder twice.
3. A task assignment pushes once to its assignee, a reassignment pushes only to the new assignee, and an assignee completing their own task pushes nothing.

**Evidence.** —
**Gap.** not implemented

### Agents that maintain knowledge

#### KEEP-001 — Contradiction watch

Core · target · **partial**

**Requirement.** *What the agent does:* watches authoritative change and checks which pages it contradicts. Authoritative change means merged pull requests and releases (GitHub, GitLab), resolved issues (Vector, Jira), revised policy and decision pages (`DEC-*`), changed connected documents, and newly verified pages. The agent maps each change to the specific statements in dependent pages, cards and recent answers. Where a statement is now contradicted, it places a "possibly outdated" flag on the exact block revision, citing the change, the evidence and its confidence.

*Data:* page revisions the agent's declared audience may read, connector events (`CONNECT-*`) and decisions.

*Human control:* flags are read-only. They notify the page owner once, in a coalesced notice, and appear to editors and in answers (`ANSWER-002`). An owner dismisses a flag with a reason, which suppresses identical future flags. The agent never edits.

**Acceptance.**
1. a Workers journey with a provider fake merges a fixture pull request that renames a configuration flag.
2. Exactly the two dependent blocks are flagged, with citations to the pull request, and the unrelated page that mentions the old name only historically is not flagged.
3. Dismissing a flag suppresses its re-flag.
4. Precision and recall on a held-out set of 100 labeled change and page pairs are recorded under `FLAG-003`.

**Evidence.** `src/core/features/impact/routes.ts`
**Gap.** see the clause

#### KEEP-002 — Revision-specific fix proposals

Core · target · **partial**

**Requirement.** *What the agent does:* for each flag, drafts a suggestion (`SUG-001`) against the exact block revision. The suggestion carries a diff, the sources, the readers who will see the change, and the answers and runbooks it affects, and is routed to the page owner.

*Data:* the flagged page revision, the cited change and the pages that depend on it.

*Human control:* nothing changes until the owner accepts (`SUG-002`). The exception is a change within a named routine update class that the owner granted in advance (`AI-011`), such as renaming a configuration key across pages. Such a change commits as an attributed revision that `REV-003` can roll back in one action. Verification never carries over: an edited verified page shows that its verified revision is not current (`STAT-003`).

**Acceptance.**
1. a browser journey in which the owner receives a fix suggestion, inspects the diff and sources, and accepts it, producing one revision.
2. A second case applies a granted rename across three pages and rolls one back.
3. A suggestion whose anchor changed in the meantime requires a rebase and never applies silently.

**Evidence.** `src/core/features/suggestions/routes.ts`
**Gap.** see the clause

#### KEEP-003 — Close knowledge gaps as work

Core · target · **missing**

**Requirement.** *What the agent does:* takes clusters of unanswered questions and low-rated answers (`ANSWER-004`) and repeated questions in chat (`CHAT-003`), finds the best expert (page owners, frequent editors, verifiers and `WORK-016` expertise), and sends that expert a short evidence request with the question, what was found and what is missing. From the expert's reply it drafts a card or page, and after the expert verifies it, re-asks the original questions to confirm they now retrieve it.

*Data:* questions without asker identity, expertise signals and the expert's reply.

*Human control:* the expert decides whether the draft is correct and sets its verification expiry. The agent cannot verify its own draft, and the draft is visible only to its eventual audience.

**Acceptance.**
1. a Workers journey with a provider fake clusters seeded unanswered questions and sends one evidence request to the right expert.
2. The expert's reply produces a draft, the expert verifies it, and re-asking the cluster's questions returns the new card as a top citation.
3. The gap report then shows the cluster closed.

**Evidence.** —
**Gap.** not implemented

#### KEEP-004 — Duplicates and conflicts

Core · target · **partial**

**Requirement.** *What the agent does:* finds near-duplicate pages, by `SEARCH-011`'s definition and its `seed.json → limits.nearDuplicateSimilarity` threshold, and statements that conflict across pages, and proposes a merge (one canonical page, with the others redirecting through `LINK-003` tombstone links) or a reconciliation for the owners to choose.

*Data:* page revisions within one audience; it never compares across an access boundary for a reader who lacks either side.

*Human control:* owners of both pages must accept a merge, which is reversible through restore.

**Acceptance.**
1. a Workers journey over a seeded corpus with a pair of pages at a measured similarity of 0.9, a pair at 0.7 and one conflict proposes exactly one merge and one reconciliation, and nothing for the pair at 0.7.
2. Accepting the merge leaves the old URL resolving to the canonical page, and search collapses the pair (`SEARCH-011`).

**Evidence.** `src/core/features/claims/service.ts`
**Gap.** see the clause

#### KEEP-005 — Answers with current evidence and stated uncertainty

Core · target · **partial**

**Requirement.** *What the agent does:* before answering, checks each candidate source's verification, lapse, open flags (`KEEP-001`) and the freshness of connected sources. It answers with what is verified, what is inferred and what is uncertain, gives the date each fact was last confirmed, and names the owner to ask when the evidence is stale.

*Data:* the asker's readable pages and connected items.

*Human control:* "Ask the owner" creates a review request (`STAT-006`) only when the asker clicks it.

**Acceptance.**
1. a Workers journey asks about a fact whose only page carries an open outdated flag.
2. The answer states the flag and names the owner, and clicking "Ask the owner" creates exactly one review request.

**Evidence.** `tests/flagship/intelligence/authority.test.ts`
**Gap.** see the clause

#### KEEP-006 — Checked runbooks

Core · target · **partial**

**Requirement.** *What the agent does:* converts a procedure page into steps. On a schedule or on demand, it dry-runs them against current tool schemas and owner-approved test accounts (read-only calls to GitHub, Vector, Jira or connected admin APIs), and checks links, screenshots against the current UI where possible, and command syntax. It reports each broken step on the exact block.

*Data:* the runbook page, tool schemas and responses from test accounts.

*Human control:* runs are read-only by default. Any effect requires an exact grant for an isolated test resource (`EFFECT-001`, `AI-011`). The agent stops on ambiguity and never touches production without owner approval for that run.

**Acceptance.**
1. a Workers journey with recorded tool fixtures dry-runs a runbook whose third step references a removed API field, flags exactly that step with the schema evidence, and makes no write call.

**Evidence.** `src/core/features/skills/routes.ts`
**Gap.** see the clause

#### KEEP-007 — Onboarding paths

Core · target · **missing**

**Requirement.** *What the agent does:* for a new member, assembles a reading path for their group or role from current verified pages (`CARD-003` can make it required). It asks short comprehension questions, answers follow-ups with citations, and routes confusion ("this step no longer matches") to the page owner as a flag.

*Data:* verified pages readable by the new member and their questions.

*Human control:* the member controls whether their progress is shared. Their manager sees only the progress they agree to share, and nothing is inferred about performance. Formal courses and certifications belong to [Beam](https://github.com/just-every/run-beam).

**Acceptance.**
1. a browser journey assigns a path to a new member, who answers questions and reports one confusing step.
2. That step becomes a flag for its owner, and the manager's view shows only the shared completion.

**Evidence.** —
**Gap.** not implemented

#### KEEP-008 — Stale-knowledge sweeps

Core · target · **partial**

**Requirement.** *What the agent does:* once a week, prepares each owner one digest of their lapsed verifications, open flags, ownerless pages in their containers and pages nobody has opened in 180 days. Each item comes with a prepared action: re-verify (which opens the revision), accept a fix, reassign, or archive.

*Data:* status, analytics (`PAGE-013`), flags and ownership.

*Human control:* every action is the owner's own click. The sweep never verifies, archives or reassigns by itself.

**Acceptance.**
1. a Workers journey advances a week over a seeded workspace and delivers exactly one digest per owner with the expected items.
2. Acting on two items applies the actions and leaves no duplicate notices.

**Evidence.** `src/core/features/notifications/events.ts`
**Gap.** No validated CI-run proof for this acceptance point: "a Workers journey advances a week over a seeded workspace and delivers exactly one digest per owner with the expected items."<br>No validated CI-run proof for this acceptance point: "Acting on two items applies the actions and leaves no duplicate notices."

#### KEEP-009 — Measured knowledge health

Core · target · **partial**

**Requirement.** *What the agent does:* maintains a workspace knowledge-health report: the share of views landing on current verified pages, the median time from flag to fix, the flag false-positive rate from dismissals, and answer accuracy on an owner-curated held-out question set re-run monthly.

*Data:* analytics, flags and answer runs.

*Human control:* owners curate the question set and its expected answers, and the report never ranks individual people.

**Acceptance.**
1. a Workers journey seeds a month of events and checks every report figure against hand-computed values.
2. A held-out re-run records its accuracy and cost under `FLAG-003`'s rules.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "a Workers journey seeds a month of events and checks every report figure against hand-computed values."<br>No validated CI-run proof for this acceptance point: "A held-out re-run records its accuracy and cost under `FLAG-003`'s rules."

#### KEEP-010 — Team-built agents

Core · target · **partial**

**Requirement.** *What the agent does:* a member whom an owner allows builds an agent for their team without code. The agent has a name, instructions, a knowledge scope (containers, labels, cards and connected sources), the tools it may use, and when it runs:

- **Tools:** search and cited answers (`ANSWER-001`), drafting pages and cards, proposing edits as suggestions (`SUG-001`), filing issues (`EMBED-001`) and posting to a chat channel (`CHAT-001`).
- **Triggers:** asked in Slate, in chat (`CHAT-002`) or over MCP (`API-003`), on a schedule, or on an automation event (`AUTO-*`).

Each agent is an `AI-014` agent record. Its builder can test it against sample questions before sharing it with groups.

*Data:* the intersection of the agent's declared scope and what the member it runs for may read. A scheduled or event run reads as the agent's owner, and its output reaches only an audience that may read every source it used (`AI-013`).

*Human control:* the agent can never verify, publish, archive, delete or change access. Its edits are suggestions and its pages are drafts until a member accepts them. Every run records its actor, scope, tools, sources and cost against the owner's budget (`AI-010`, `AI-012`). Owners can see, pause or delete any agent, and removing an agent's owner pauses it (`WORK-007`).

**Acceptance.**
1. a Workers journey with a provider fake at the network edge builds an agent scoped to one container with the answer and propose-edit tools, and shares it with a group.
2. A group member who can read only half the container asks it a question, and the answer cites only pages that member can read.
3. The agent's proposed edit lands as a suggestion and changes nothing until it is accepted.
4. A page in scope that instructs the agent to publish itself or grant access produces a refusal and no change.
5. A scheduled run posts once to a channel fake, citing only sources its audience can read.
6. Pausing the agent stops its next scheduled run, and exhausting its budget stops it with a notice to its owner.
7. A browser journey at 1440 and 390 builds, tests and shares the agent.

**Evidence.** `CONTRACT.md` — requirement text only; no validated CI-run proof.
**Gap.** No validated CI-run proof for this acceptance point: "a Workers journey with a provider fake at the network edge builds an agent scoped to one container with the answer and propose-edit tools, and shares it with a group."<br>No validated CI-run proof for this acceptance point: "A group member who can read only half the container asks it a question, and the answer cites only pages that member can read."<br>No validated CI-run proof for this acceptance point: "The agent's proposed edit lands as a suggestion and changes nothing until it is accepted."<br>No validated CI-run proof for this acceptance point: "A page in scope that instructs the agent to publish itself or grant access produces a refusal and no change."<br>No validated CI-run proof for this acceptance point: "A scheduled run posts once to a channel fake, citing only sources its audience can read."<br>No validated CI-run proof for this acceptance point: "Pausing the agent stops its next scheduled run, and exhausting its budget stops it with a notice to its owner."<br>No validated CI-run proof for this acceptance point: "A browser journey at 1440 and 390 builds, tests and shares the agent."

## Agent surface

None.

## Later

None.

## Field proof register

No field proof is recorded yet.
