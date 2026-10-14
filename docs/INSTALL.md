# Install and deploy

Slate runs as one Cloudflare Worker with D1, R2, a jobs queue and collaboration Durable Objects. The public source is [just-every/run-slate](https://github.com/just-every/run-slate).

## On your computer

Install Git and Node.js 22 or later to run rer. There is no Node or pnpm version to choose: rer fetches the ones this checkout pins and installs the pinned dependencies itself. Then:

```sh
npm install -g @runeditrun/rer
git clone https://github.com/just-every/run-slate.git slate
cd slate
rer dev
```

In a fresh checkout `rer dev` alone sets up a placeholder local owner. To use your own email instead, run `rer setup --owner-email owner@example.test` before `rer dev` (use your own address). Open the printed outbox, choose the newest sign-in message, then follow its one-use link and choose **Confirm**. Previously issued links require a new sign-in request. No email is sent. Private settings and local data survive restart; Slate creates no sample workspace. Setup reruns preserve your settings and owner. Stop dev with `rer dev --stop`. Use `rer preview` for a fixed production build.

## Your Cloudflare account

Provide the account/token, owner email and mail settings from your private vault as described in [OPERATIONS.md](../OPERATIONS.md); rer generates the session secret on a first deploy. A Resend or SendGrid provider and verified sender must be selected explicitly. Review `rer deploy --environment production --dry-run`, which makes no provider request. Authorized `rer deploy --environment production` uses rer's own deploy kit to create resources, apply migrations, publish and check health. Keep its `.rer/deploy` receipts.

Slate has no setup token. After the deploy, open the printed address and sign in by email as the owner email you deployed with: the first sign-in with that address claims the new wiki, and you then name the workspace at `/setup`. For a normal update in the same account and environment, follow the update steps below. Moving accounts or changing resource names needs a separate migration plan.

For [backup and restore](BACKUP.md) and confirmed reset, follow [README.md](../README.md). Product acceptance and inbox delivery remain separate from successful local or deployment checks.

For an optional linked identity provider, `SLATE_IDENTITY_PROVIDER` selects its exact HTTPS origin before initial setup; leaving it blank keeps email sign-in. Unattended first-time linking is currently unavailable for Slate's native accounts, so leave it blank on a fresh installation. Keep an existing provider selection unchanged during an update.

## Update your existing wiki

Export your running wiki first. Before exporting, confirm the checkout is clean and `git rev-parse HEAD` matches the running wiki's `/health` `deployment.sourceSha` and the deployment receipt's `source.sha`. If they differ, preserve your local changes and find the deployed source revision before continuing. Sign in as its owner, confirm your email for the sensitive export, and save the single owner session cookie in an owned mode-0600 `.seed/owner-session` file. Replace the origin and environment below with the ones you already use:

```sh
rer export --target remote --origin https://wiki.example.com --session-file .seed/owner-session --output exports/before-update.rer
git rev-parse HEAD > exports/before-update.source
git pull --ff-only
rer deploy --environment production
```

Rer deploy installs the pinned dependencies automatically. `rer update` updates the CLI rather than your wiki source; use the health and retained-data checks below to validate this deployment.

Continue only after export succeeds. Keep the same Cloudflare account, environment, resource names, `.rer/deploy` receipts and private settings, including the session secret and identity-provider selection. Preserve local source edits when a pull refuses to fast-forward.

Before pulling, restore the backup into a separate empty checkout pinned to its recorded source revision and inspect it. An older archive may be refused by newer migration rules, including migration 0029's trigger replacement; keep the export-source checkout for recovery until that upgrade restore is separately validated.

Review `rer deploy --environment production --dry-run` before deploying. Afterwards, check the receipt's project, environment and origin and match `/health`'s `deployment.sourceSha`, `fingerprint` and `versionId` to it. Open retained pages, revision history, search, attachments and existing shared/public links with the same owner and expected access. A health response alone does not prove retained data or access.

Fresh rer 0.2.5 exports work with its `d1_migrations` ledger; upgrades from a legacy ledger need separate proof. Stop if export refuses a ledger or unknown table; preserve it for review. See [Operating Slate](../OPERATIONS.md) for recovery and the migration-ledger compatibility boundaries.

## Remove a deployment

Export first: removal deletes the Worker and every D1 database, R2 bucket and queue rer created for that environment, with their data. Run it from the checkout that deployed it, with the same account credentials:

```sh
rer deploy --environment production --remove --yes
```

Rer reads back that none of them is still listed. A bucket that still holds files stays until it is empty; run the command again to finish. Resources rer did not create are never touched.
