# Install and deploy

Slate runs as one Cloudflare Worker with D1, R2, a jobs queue and collaboration Durable Objects. The public source is [just-every/run-slate](https://github.com/just-every/run-slate).

## On your computer

Select Node.js 22.20.0 and pnpm 10.12.4, then:

```sh
npm install -g @runeditrun/rer@0.2.1
git clone https://github.com/just-every/run-slate.git slate
cd slate
rer install
rer setup --owner-email owner@example.test
rer dev
```

Use your own email. Open the printed outbox, choose the newest sign-in message, then follow its one-use link and choose **Confirm**. Previously issued links require a new sign-in request. No email is sent. Private settings and local data survive restart; Slate creates no sample workspace. Setup reruns preserve your settings and owner. Stop dev with `rer dev --stop`. Use `rer preview` for a fixed production build.

## Your Cloudflare account

Provide account/token and native mail/session settings from your private vault as described in [OPERATIONS.md](../OPERATIONS.md). A Resend or SendGrid provider and verified sender must be selected explicitly. Review `rer deploy --environment production --dry-run`, which makes no provider request. Authorized `rer deploy --environment production` uses Base deploy-kit to create resources, apply migrations, publish and check health. Keep its `.rer/deploy` receipts. Existing deployments require an explicit resource migration plan.

For [backup and restore](BACKUP.md) and confirmed reset, follow [README.md](../README.md). Product acceptance and inbox delivery remain separate from successful local or deployment checks.

For an optional linked identity provider, `SLATE_IDENTITY_PROVIDER` selects its exact HTTPS origin before initial setup; leaving it blank keeps email sign-in. Unattended first-time linking is currently unavailable for Slate's native accounts, so leave it blank on a fresh installation. Keep an existing provider selection unchanged during an update.

## Update your existing wiki

Export your running wiki first. Sign in as its owner, confirm your email for the sensitive export, and save the single owner session cookie in an owned mode-0600 `.seed/owner-session` file. Replace the origin and environment below with the ones you already use:

```sh
rer export --target remote --origin https://wiki.example.com --session-file .seed/owner-session --output exports/before-update.rer
git pull --ff-only
pnpm install
rer deploy --environment production
```

Continue only after export succeeds. Keep your deployment receipts and private settings, including the session secret. Review `rer deploy --environment production --dry-run` before deploying. Afterwards, check the deployment identity in `/health` against the receipt and open retained pages, revision history, search, attachments and existing shared/public links with the same owner and expected access. See [Operating Slate](../OPERATIONS.md) for recovery and the current Base controller-ledger export limitation.
