# Changelog

## 0.4.0 — 21 October 2026

Slate 0.4.0 is a minor release over 0.3.0. It adds Word export and nightly verification rules, and keeps the first words typed into a new page. The product screenshot for this release is `.github/assets/release/slate-0.4.0-page-1440.png`.

**Upgrade from 0.3.0.** Back up with `rer export` first. Keep `@runeditrun/rer` pinned at 0.2.73, as `package.json` does. Apply migration 0044 (verification rules); it is additive, so every member, role, group, guest, page, comment and live session is kept as it is. A backup made by 0.3.0 restores into 0.4.0 through `rer import` or Settings' workspace restore.

**Word export (PORT-010).** A page, or a page with everything beneath it, exports from the page's Export as one Word `.docx` file. The file has headings, lists, tasks with their assignee and due date, tables with merged cells, code, callouts, images with their alt text, and links. Links to other exported pages jump inside the document. Comments can be included as Word comments with their authors, times, replies and resolved state. The file holds only what the person exporting can read, and access is checked again before it is returned. Re-importing the file with Word import brings back its headings, merged tables and images with their alt text.

**Verification rules (STAT-007).** Each space has three nightly rules, all off until its owner turns one on: unverify a page when a page or source it cites changes, flag pages with no owner, and flag verified pages nobody has viewed for a set number of days. A rule can be previewed before it is turned on. Each run records what it changed and why in activity and sends affected owners one combined notice. No rule ever verifies a page. Migration 0044 adds the rules, their run receipts and page flags.

**First words on a new page are kept.** Words typed into a new page before its scripts finished loading appeared in the editor but were never saved, so they were gone after a reload, most often on a slow connection or phone. The editor now picks up text already typed when it starts and saves it like any other keystroke.

**Listing summary.** Slate's catalogue summary now reads "One home for everything your team knows: pages, databases and search.", from the homepage's lead.

**Known issues.**
- Word export covers a page or a page with its descendants. Workspace and space exports stay HTML or Markdown archives.
- Equations and diagram blocks are not part of Slate yet, so Word export has nothing to carry for them (`BLOCK-013`, `BLOCK-019`).
- A first `rer deploy` of a new environment claims the hosted owner and then exits 1 with `POST /auth/signout returned HTTP 404`: rer 0.2.73 signs out its unused claim session at `/auth/signout`, and Slate signs out at `/api/auth/logout`. The app is live and the owner is claimed; run `rer deploy --environment <name> --unset-secret SETUP_TOKEN`, as the message says, to remove the one-time setup token.
- Hosted mail through SendGrid has no provider duplicate suppression, so a refused send waits for the owner's retry instead of retrying itself (MAIL-002).
- Slate's flagship systems (AI, runs, inquiries, connectors) remain a development opt-in outside this release's acceptance.

## 0.3.0 — 20 October 2026

Slate 0.3.0 is a minor release over 0.2.0. It adds assigned page tasks with due dates and inbox reminders, page and space following, accountable review requests and page locks, space blogs, editable space homes and a permission-aware company hub, owner guest management with expiry and domain rules, workspace analytics with CSV reports, record templates and recurring records, a starter template set, search operators and click-to-load embeds. The product screenshot for this release is `.github/assets/release/slate-0.3.0-page-1440.png`.

**Upgrade from 0.2.0.** Back up with `rer export` first. Pin `@runeditrun/rer` 0.2.73, as `package.json` does, and apply migrations 0031 to 0043 in order; all are additive and keep members, roles, groups, guests, pages and live sessions.

**A backup made by the previous version now restores.** A backup taken with Slate 0.2.0, by `rer export` or by Settings' workspace export, restores into 0.3.0. The restore admits an archive from an earlier Slate when later migrations only added tables or columns: tables it lacks stay empty and columns it lacks take their declared default; a table or column that was dropped or renamed, or an archive from a newer Slate, is still refused. `rer import` replays the target's applied migrations with each file's SHA-256, and Slate pins `@runeditrun/rer` 0.2.73, whose restore places an archive by Platform's `rer_migrations` ledger and judges each migration statement at SQLite's own statement boundaries; every vendored Base copy is refreshed to `rer-v0.2.73`, and the restore's bootstrap commit check follows the engine's import-lease fence. Migration 0043 installs that lease table, so erasing a page never creates a table mid-request. On rer 0.2.73, local development also keeps the owner signed in when Slack's connection flow sends the browser back.

The hosted demo at demo.run-slate.com moves from a container to rer's native Worker Loader host: each visitor gets their own isolate with SQLite facets for the database and collaboration rooms, files in their own storage, a durable job queue and the cron by alarm. Every vendored Base copy is refreshed together from `rer-v0.2.40`, and the Run demo workflow is Base's template; `deploy-demo.json` drops the retired container size.

A Managed change preview that copied the live app's data now opens with the owner signed in: Slate accepts RER's single-use owner grant (Base's `oa_owner_signins` shape) at `/auth/owner-signin`, only on a preview Worker, once, within 15 minutes, for the active owner. Migration 0034 adds the grant table and a read-only `oa_operators` view of the workspace's members, which RER uses to find the owner.

An owner link that cannot be used (missing, used, expired, or opened where the app is not a preview) now lands on Slate's sign-in page, saying the link no longer works and with the owner's email filled in when the link names one, instead of an error body. Slate recognises a preview by RER's `RER_PREVIEW_OWNER_SIGNIN` binding (the declared owner sign-in path) instead of `RER_PREVIEW_TOKEN`, which RER keeps on the preview gateway. On Managed hosting the front page no longer tells the customer to run `rer signin`. The sidebar names each space by its name alone ("General", not "Space · General"), and the developer-only Company sign-in setting no longer points to an address field that setup does not show.

A Managed preview no longer adds a "Personal" space when its owner signs in: it shows exactly the spaces it copied from the live app. Live still creates each member's personal space on first use.

Sign-in and invitation mail name the app the same way in the sender name and the subject: the new optional `APP_NAME` setting (`SLATE_APP_NAME` for `rer deploy`), else Slate. Managed mail's relay names the sender from the installation itself.

Setup labels and help read in plain words, and developer-only settings say "for developers"; values and behaviour are unchanged.

The workers test config no longer starts miniflare's real queue consumer (`SLATE_TEST_QUEUE_CONSUMERS=1` opts in), so a job a test leaves on the local queue cannot hang the suite.

RER’s Open app action now opens Slate’s sign-in page with the claimed owner’s email filled in. The generated deployment spec declares `/signin` and its `login_hint` support; opening the page does not send an email.

## 0.2.0 — 16 October 2026

Slate 0.2.0 is a minor release over 0.1.0. It signs in through Base operator-auth over Slate's own accounts, sends mail through RER's Managed relay without customer provider setup, serves its documentation at `/docs`, adds reviewed imports and installation backup and restore through `rer export` and `rer import`, and refines the signed-in app. The product screenshot for this release is `.github/assets/release/slate-0.2.0-page-1440.png`.

**Upgrade from 0.1.0.** Back up with `rer export` first. Pin `@runeditrun/rer` 0.2.25, as `package.json` does, and apply migrations 0018 to 0031 in order; all are additive and keep members, roles, groups, guests and live sessions. Email links sent before the upgrade show the request-new-link page. Hosted mail needs `MAIL_PROVIDER` (`sendgrid`, `resend`, or `rer` for the Managed relay) and its credential; `MAIL_PROVIDER=development` runs only on a loopback local install and sends nothing.

An installation archive names the workspace's current active owner, and a removed member stays removed through `rer import` and the web restore. Removing a member ends their setup-owner standing, and an archive taken while several people owned the workspace asks for `rer setup --owner-email <address>` before `rer import` restores it (PORT-005). The web restore refuses a signed-in owner who was removed from, or was a guest in, the archived workspace. A local install exports the workspace from Settings without an email confirmation; hosted exports still need one. Typing straight after choosing a person, page or date mention is kept. Markdown, Notion and Word imports keep more of their links, nesting and titles, and the import and export settings are styled. Enter in a page title moves into the body, database records nest beneath their database in the sidebar, and database view settings, Status choices, Name sorting and the standalone chart are fixed.

Test credentials are explicitly synthetic so hosted source checks accept Slate-owned fixtures while preserving security assertions.

The checkout pins `@runeditrun/rer` exactly to 0.2.25 (0.2.23 brought Base's Managed mail transport fix; 0.2.25 refreshes the import-kit copies) and adopts Base's Managed mail transport fix. Sign-in passes Base's Auto-Submitted header to the relay adapter; requests use Workers-supported manual redirects and reject relay redirects without following them. Retry-After scheduling and safe owner-visible errors remain. `/signin?login_hint=<email>` prefills the Email field using Base's email validation without sending a request. Emitted-Worker checks establish relay acceptance, redirect refusal, rate-limit recovery and credential rejection locally; they do not establish inbox delivery.

A page mention names its target only as each reader may see it at every door that returns page text, now including AI evidence and Ask packets (labelled for everyone in their audience), suggestions, template previews and retained claims (LINK-004). `rer import` sets every imported row to what export writes, so a changed archive cannot bring back a live agent credential or chat or federation connection, and a member removed before the export stays removed: any grant or group membership the archive gives them is left out with a warning (PORT-005). A structure change whose page read does not answer within 15 seconds fails with a message instead of leaving the editor waiting with its refreshes paused.

Two people editing one page no longer lose each other's text when one of them moves, adds, deletes or converts a block, or anchors a comment, right after their own save: the editor rebases the change on a fresh read, and the server refuses any block whose stored text changed since the editor's copy with the block's Compare, Reload and Overwrite choices (SAVE-003, SAVE-006). A page mention names its target only to readers who may open it, in the page, history, comments, readable export and public page, and search no longer indexes mentioned titles; migration 0027 rebuilds the search rows (LINK-004). Restoring an earlier revision keeps live inline comments anchored by their quote and orphans only those whose text is gone (COMM-004). `rer import` refuses a guest's address as the new owner and an archive naming more than one setup owner, and imports any archive's rows as export would have written them, so a public link restores revoked (PORT-005).

The signed-in app is refined to the owner-picked design. The sidebar collapses with an icon button beside the workspace name and its icons, labels, Create button, space rows and account button share one inset. Every destination, page, database and record mounts one top bar (location left, actions right) and one page title, and the settings, space, archive and database tabs share one style. A page's top bar keeps Share as the one primary action with Comments, History and Details as named icon buttons and More as a compact keyboard-operable menu whose items act at once or open the existing dialogs and side panels (status, readership and contributors, display settings, public access) only when chosen, and a database keeps its view tabs, a compact find field, two option menus and one New record button, with its favourite and About controls as named icon buttons. Every control remains reachable.

Slate serves its own documentation at `/docs`, built from the repository's Markdown when the app is built. It adds guides for installing and deploying, moving in from other tools, and backup and restore, and the operator notes on email delivery and the Cloudflare footprint (DOCS-001). The landing page's guide and setup links now open these pages, and Slate's two-card mark is now the favicon and the mark beside the owner's name on the landing, sign-in and app pages (HOME-001).

## 0.1.0 — 7 October 2026

Slate's first public source release provides a core wiki with pages and containers, rich-text editing, sharing and permissions, comments, search, revision history, imports, and portable backup and restore. It includes email sign-in and first-owner setup, edition metadata, deployment commands, and corrections to page relocation and erasure. Advanced federation and inquiry remain development features outside this release's acceptance.

### MAIL-002 amendment — 7 October 2026

Base Mail adds SendGrid alongside Resend. Automatic retry is allowed only when the provider suppresses duplicate requests. SendGrid rejections permit an owner retry; ambiguous transport, expired dispatch ownership or missing acceptance receipts are held durably for provider review without a blind resend. Resend's bounded idempotent retry remains. A provider receipt means acceptance, not inbox delivery. CONTRACT.md and RELEASE.json retain this amendment.

### Local setup and identity — 8 October 2026

The owner-approved identity override keeps Slate's native magic-link, OIDC, session, role, group and guest model, preserving existing identity and grant data. Local installation uses private owner-only `.dev.vars` and creates no sample workspace. The 15 October 2026 owner decision supersedes the former development mailbox: local mail is silently suppressed and `rer dev` prints an `RER_OPEN` link for native local owner entry. Owner-account deployment uses `node scripts/rer.mjs deploy --environment production`, with explicit `SLATE_MAIL_PROVIDER`, matching key and verified sender. Assisted and Managed installations are unavailable. This records operating guidance in the existing source line and claims no provider or release acceptance.

Incumbent import fixtures use synthetic identities while retaining archive and parser edge cases. Source documentation describes reproducible setup and verification; historical private execution logs are excluded.
