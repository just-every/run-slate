# Deployment and native mail

Use `rer deploy --environment production --dry-run` for local validation/build without provider requests. Authorized deployment omits `--dry-run` and uses Base deploy-kit with deploy.json. OPERATIONS.md names the actual account/token and native secrets. Resource custody lives in `.rer/deploy`.

Choose `SLATE_MAIL_PROVIDER` explicitly (`resend` or `sendgrid`), supply its `SLATE_MAIL_API_KEY` and verified `SLATE_MAIL_FROM`. Local setup does not provision a provider. Local mail is silently suppressed, with no captured-mail page; open the `RER_OPEN` link printed by `rer dev` for native local owner entry.

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
