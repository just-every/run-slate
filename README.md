<p align="center">
  <a href="https://run-slate.com">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset=".github/assets/banner-dark.webp">
      <source media="(prefers-color-scheme: light)" srcset=".github/assets/banner-light.webp">
      <img src=".github/assets/banner-light.webp" width="100%" alt="Slate: One home for everything your team knows. 100% free, open source alternative to Notion, Confluence and Guru.">
    </picture>
  </a>
</p>

<p align="center"><a href="https://run-slate.com">run-slate.com</a> · <a href="https://justevery.com">Part of Just Every</a> · <a href="LICENSE">MIT licensed</a></p>

<p align="center">
  <a href="https://justevery.com/#vol-slate"><img src=".github/assets/media/preview.gif" width="800" alt="Slate's editor: a heading, an @ mention of a person, a link to a page and a checklist item typed into a page"></a>
</p>
<p align="center"><a href="https://justevery.com/#vol-slate"><b>Watch the full demo</b></a> · 50 seconds</p>

<p align="center">
  <img src=".github/assets/media/flow.webp" width="800" alt="The same search for launch: sam sees four results within his access, maya sees five including the Leadership budget page">
</p>

<p align="center">
  <img src=".github/assets/media/screen-1.webp" width="800" alt="Slate's Launch plan page: a Launch week heading, a mention of @alice, a link to the Launch checklist page and a to-do, each block saved"><br>
  <sub>Pages with mentions, page links and blocks that save as you write.</sub>
</p>

<p align="center">
  <img src=".github/assets/media/screen-2.webp" width="800" alt="The Projects database in Slate as a board grouped by status, each record with an owner and a due date"><br>
  <sub>Databases with board, chart and automation views.</sub>
</p>

# Slate

Slate is a self-hosted team wiki built with React, TanStack Start, Hono and Cloudflare Workers. The default `core-wiki` profile provides pages and containers, rich-text editing, comments, permissions, search, revision history, imports, and backup and restore. The public source repository is [just-every/run-slate](https://github.com/just-every/run-slate). Source publication does not establish product or provider acceptance.

Install Git and Node.js 22 or later to run rer. There is no Node or pnpm version to choose: the checkout pins Node.js **22.20.0** and pnpm **10.12.4**, and rer fetches and uses exactly those for its commands.

## Run it on your computer

Clone the public source repository and enter the checkout:

```sh
git clone https://github.com/just-every/run-slate.git slate
cd slate
```

Install rer once per computer (`npm install -g @runeditrun/rer`, or `curl -fsSL https://runeditrun.com/install.sh | sh`); it runs the `@runeditrun/rer` version this checkout pins (0.2.23). In a fresh checkout `rer dev` alone installs the pinned dependencies, makes a placeholder local owner and starts Slate. To choose your own owner email, prepare it first:

```sh
rer install
rer setup --owner-email you@example.test
rer dev
```

Use your own email address. Setup prepares the local app, database and private settings, then exits with no app running. Running setup again preserves your settings, workspace and owner. Changing a saved owner or address requires explicit recovery or reset.

When Slate is ready, dev prints an `RER_OPEN` link. Open that link to sign in as the local owner; no email or outbox step is needed for this initial sign-in. Keep the link private. On first use, name the workspace and create its first space and page at `/setup`; later visits open your existing workspace. Local data lives in `.wrangler/state`; credentials stay out of production builds.

Local mail is silently suppressed; there is no local email outbox. A signed-in local owner can use Settings → Import & export → **Export workspace** without email confirmation. Hosted workspace export still requires a fresh email confirmation. Other sensitive operations retain their email confirmation requirement; use the CLI below for local backup and restore.

In a second terminal, stop dev before running the checks:

```sh
rer dev --stop
node_modules/.bin/playwright install chromium
rer verify
```

`rer verify` requires Playwright's Chromium for its production hydration check. Install it once after `rer install` using the checkout's command above; no global pnpm installation is needed.

`rer build` then `rer preview` serves a fixed production build. Dev supports Vite editing/HMR. Both reuse a compatible running instance, preserve the saved origin and native identity, and accept explicit loopback `--host`, `--port`, and `--idle-timeout`. Stop the active mode before changing modes. `rer doctor` reports missing local inputs without provider requests. `rer check --profile first-party` validates the command contract before dependencies or setup exist.

## Back up, restore and reset

Stop dev or preview before moving local data. Export to a new private file:

```sh
rer export --output exports/installation.rer
```

The archive includes D1 facts and identity lineage plus retained FILES attachments and source import originals. Derived ZIP exports, deleted files and unreferenced staging objects are excluded. Session capabilities, provider credentials, local configuration and transient caches are excluded. Native agent credential metadata is retained as revoked records with erased digests and empty scopes; no agent token or usable digest moves. Restore into a fresh empty checkout **before its first setup/sign-in**. Copy the archive into that destination checkout's `exports/` directory first, then run these commands from the destination root. `--input` must name a path contained in that checkout; paths into another checkout, including `../slate/exports/installation.rer`, are refused:

```sh
rer import --input exports/installation.rer --yes
rer setup --owner-email you@example.test
```

Re-enter the archived native owner's email. If the archive was taken while more than one person owned the workspace, import asks you to choose: run `rer setup --owner-email` with the owner's address first, then import. A member removed before the export stays removed. Fresh sign-in is required; restored automation, grants and effects require renewed owner authority. Existing workspace ZIP exports and the authenticated web restore API remain a separate native product flow. Hosted installation export uses `rer export --target remote --origin https://wiki.example.com --session-file .seed/owner-session --output exports/hosted.rer`; put only your native owner cookie in an owned mode-0600 session file. Remote installation import is unsupported; restore the archive into a separate empty local checkout first.

Reset lists its local removal inventory and requires explicit confirmation:

```sh
rer reset --yes
```

It removes local D1/R2/collaboration state, settings and installer drafts, preserving source, dependencies, owner exports and deployment receipts. Back up first. Reset refuses while another operation owns local state.

## Mail with Run Edit Run hosting

Managed hosting includes mail through Run Edit Run; you do not need a Resend or SendGrid account. Configure fills and hides `MAIL_PROVIDER`, `MAIL_FROM`, `MAIL_RELAY_URL` and `MAIL_API_KEY`, generating a private credential for the installation and environment. Slate uses Base's copied `rer` relay adapter. Free and Assisted hosting keep the options to use your own Resend or SendGrid account, key and verified sender. Local development suppresses mail and uses the printed one-click sign-in link.

## Deploy to your Cloudflare account

Before deploying, set up a real Resend or SendGrid account and a verified sender. Hosted Slate signs you in by email, so `SLATE_SETUP_OWNER_EMAIL` must be a mailbox you can read. Supply `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `SLATE_SETUP_OWNER_EMAIL`, `SLATE_MAIL_PROVIDER` (`resend` or `sendgrid`), `SLATE_MAIL_FROM` (the verified sender) and `SLATE_MAIL_API_KEY` (that provider's API key) from your private vault or deployment environment. Rer generates the session secret on a first deploy. See [OPERATIONS.md](OPERATIONS.md#owner-account-deployment) for all inputs. Validate and build locally first:

```sh
rer deploy --environment production --dry-run
rer deploy --environment production
```

Dry run makes no provider request and cannot check mail delivery. The second command creates resources in your Cloudflare account, applies database updates, uploads secrets, deploys and checks health. After a healthy first deploy, rer claims `SLATE_SETUP_OWNER_EMAIL` as the owner and removes its one-time setup token. Open the printed address, request a sign-in email for that owner address and follow the link in your mailbox. You do not need a setup token. After signing in, name the workspace at `/setup`. A successful deployment alone does not prove that sign-in mail reaches your inbox.

To update a deployed wiki, export it first (see [docs/INSTALL.md](docs/INSTALL.md#update-your-existing-wiki)), then:

```sh
git pull --ff-only
rer deploy --environment production
```

To remove a deployment and every resource rer created for it, including its data (export first):

```sh
rer deploy --environment production --remove --yes
```

Source `rer release --repo PATH --output PATH --clean-history` validates and prepares a local export; it does not push, tag a public repository or deploy.

## Verify and acceptance

```sh
rer verify
pnpm verify:ci
pnpm test:imports
pnpm test:release-source
pnpm source:check
```

`rer verify` checks command contracts, generated Worker binding freshness, types, static contracts and boundaries, source integrity and the emitted build/artifact; it runs no test suites. It requires Chromium installed with `node_modules/.bin/playwright install chromium` after `rer install`. `pnpm verify:ci` runs those checks plus Slate's CI test suites, including identity mail, foundation, platform, profile, type-generation, portability and operations coverage. Push CI runs parallel shards; installer and README journeys run nightly and on release tags. Build and deploy commands do not run test suites. Planned contract clauses remain visible; a passing check does not imply full flagship acceptance. `pnpm test:release-regressions` separately exercises publication relocation, erasure and the emitted browser console using the same Chromium installation.

Advanced federation and inquiry code remains in the source under the explicit `SLATE_PROFILE=flagship` development profile. It is outside the core-wiki release acceptance. [CONTRACT.md](CONTRACT.md), [ACCEPTANCE.md](ACCEPTANCE.md), and [HANDOVER.md](HANDOVER.md) state requirements and current evidence limits. Slate is MIT licensed.
