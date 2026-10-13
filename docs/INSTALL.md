# Install and deploy

Slate runs as one Cloudflare Worker with D1, R2, a jobs queue and collaboration Durable Objects. The public source is [just-every/run-slate](https://github.com/just-every/run-slate).

## On your computer

Select Node.js 22.20.0 and pnpm 10.12.4, then:

```sh
npm install -g @runeditrun/rer
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
