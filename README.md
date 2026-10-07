# Slate

Slate is a self-hosted team wiki built with React, TanStack Start, Hono and Cloudflare Workers. The default `core-wiki` profile provides pages and containers, rich-text editing, comments, permissions, search, revision history, imports, and backup and restore. Source: https://github.com/just-every/slate.

Use Node 26.8.1 and pnpm 8.15.6 (the package requires Node 22.12 or newer).

```sh
pnpm install --frozen-lockfile
pnpm dev
```

`pnpm dev` applies local D1 migrations and starts Vite on loopback with local sample data. Open the URL Vite prints. Local state is stored in `.wrangler/state`; `SLATE_PERSIST_STATE_PATH` and `SLATE_WRANGLER_CONFIG_PATH` select another local state directory or Wrangler configuration. Sign-in and first-owner setup use the native session flow; see [OPERATIONS.md](OPERATIONS.md) for configuration and provider prerequisites.

```sh
pnpm verify
pnpm test:imports
pnpm test:release-source
pnpm source:check
```

`verify` checks types, builds the emitted Worker, exercises anonymous/session access, runs the Worker contract suite, and tests foundation, platform and profile behavior. The suite reports planned clauses explicitly: passing checks do not imply complete flagship acceptance. `pnpm test:release-regressions` additionally exercises publication relocation, erasure and the emitted browser console; install Chromium with `pnpm exec playwright install chromium` first.

For hosted setup, authenticate Wrangler to your Cloudflare account. Set `SLATE_DEPLOY_ENV`, `SLATE_APP_URL`, `SLATE_SETUP_OWNER_EMAIL`, `SLATE_MAIL_FROM`, `SLATE_SESSION_SECRET` and `SLATE_MAIL_API_KEY`. Choose `SLATE_MAIL_PROVIDER=resend` (default) or `sendgrid`, with a verified sender and its provider key. Then run `pnpm run setup` to provision D1, R2 and a queue, install secrets and apply remote migrations. `pnpm run deploy` runs setup, builds, deploys and verifies database/file health. These commands change the selected account. [Deployment details](docs/release/sendgrid-deployment.md) and [resource footprint](deploy/footprint.md) describe the inputs.

`pnpm run export ARCHIVE.zip` and `pnpm run import ARCHIVE.zip` provide backup and restore; read [OPERATIONS.md](OPERATIONS.md) before restoring into an empty deployment. Preserve applied migration history and installation secrets.

Advanced federation and inquiry code remains in the source under the explicit `SLATE_PROFILE=flagship` development profile. It is outside v0.1.0 core-wiki acceptance. [CONTRACT.md](CONTRACT.md), [ACCEPTANCE.md](ACCEPTANCE.md), and [HANDOVER.md](HANDOVER.md) state requirements and limits. Slate is MIT licensed.
