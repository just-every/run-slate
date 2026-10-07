# Disposable deployment and Base Mail

`pnpm run setup` and `pnpm run deploy` read configuration from environment variables, including `SLATE_RESOURCE_PREFIX` (default `slate`). They accept no positional arguments or configuration flags. Use `pnpm run setup --help` or `pnpm run deploy --help` to print usage without contacting a provider.
Resources use `<prefix>-<SLATE_DEPLOY_ENV>` plus `-db`, `-files`, and `-jobs`.
For `SLATE_RESOURCE_PREFIX=slate-example` and `SLATE_DEPLOY_ENV=preview`,
the Worker is `slate-example-preview`. Set `SLATE_APP_URL` to that Worker's
actual HTTPS URL. Setup still provisions resources and installs secrets;
deploy still runs setup, builds, deploys, and checks health. Both commands change the selected Cloudflare account.

`SLATE_MAIL_PROVIDER=sendgrid` writes `MAIL_PROVIDER=sendgrid`; omission preserves
Resend. `SLATE_MAIL_API_KEY` holds the selected provider's secret and
`SLATE_MAIL_FROM` must be a verified sender. No secret belongs in source or proof.

The SendGrid implementation is the exact mail adapter/core subset from
Base `712a4b43d8fc3f30b8d4c2f354c8a10e060bfc38`, recorded in `edition.json` and
`sources.lock.json`. The adjacent declaration file is Slate's TypeScript boundary.
Slate persists encrypted intent and attempt ownership before calling Base Mail.
HTTP 202 with a provider identifier records accepted (`sent`), not inbox delivery.
Missing identifiers, transport uncertainty, server errors, and a recovered expired
dispatch lease remain `uncertain`; cron and explicit retry cannot send again.
Settings displays the held receipt and permits invitation revocation. The public
sign-in view reports unconfirmed delivery. Provider read-back/reconciliation is
an operator responsibility; this change does not invent a receipt lookup API.
Explicit SendGrid rejections allow an owner retry; Resend retains its existing
bounded exact-body idempotency retry. The admitted provider and credential digest
must match before dispatch.
