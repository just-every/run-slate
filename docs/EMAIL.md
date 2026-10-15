# Email delivery

Slate sends email so that people can sign in and so that you can invite them. This page explains how to choose a provider and set it up, what Slate sends, what happens when a send fails, and what to check when a message does not arrive.

## What Slate sends

Slate sends two kinds of email and nothing else:

- **Sign-in links.** Each one is a single-use link that works for 60 minutes.
- **Invitations.** A member invitation, or an invitation to someone you share a page with who is not yet a member. Each one is a single-use link that works for 24 hours.

Messages come from the sender address configured for your hosting. Slate does not read incoming mail: a reply to that address creates and changes nothing. No other event in the wiki sends email.

A hosted owner's first sign-in uses an emailed link; Managed hosting supplies mail, while an owner-account deployment needs your provider settings. Local setup and dev use the printed loopback outbox; open its newest sign-in message and follow the one-use link. No email is sent locally.

## Choose a provider

Managed hosting includes mail through Run Edit Run with no provider account of your own. Run Edit Run Configure fills and hides `MAIL_PROVIDER=rer`, `MAIL_FROM`, `MAIL_RELAY_URL` and private `MAIL_API_KEY`, generating a credential for the installation and environment. The provider key stays with Run Edit Run.

Free and Assisted hosting retain own-account **Resend** or **SendGrid** options. Owner-account `rer deploy` also requires one of these explicitly, with a provider account, verified sender and API key:

| Variable | What it does |
|---|---|
| `SLATE_MAIL_PROVIDER` | Required: exactly `resend` or `sendgrid`. |
| `SLATE_MAIL_FROM` | A sender address verified by the selected provider. |
| `SLATE_MAIL_API_KEY` | That provider's private API key; deployment stores it as a Worker secret. |
| `SLATE_SETUP_OWNER_EMAIL` | The owner's mailbox for native sign-in. |
| `SLATE_SESSION_SECRET` | Protects sessions and waiting messages; preserve it across deployments. |

Supply these private deployment inputs and the explicit Cloudflare account/token described in [Install and deploy](INSTALL.md) and OPERATIONS.md. Review `rer deploy --environment production --dry-run`, then run the same command without `--dry-run` when deployment is authorized. Base derives the deployed origin and sets runtime `APP_URL`, which is used in mail links. Local `setup` prepares the loopback app and rejects hosted provider credentials.

A few rules keep retries safe:

- A message belongs to the provider and key it was first sent with. If you switch provider or key while a message is still waiting, Slate will not send it under the new one. Put the original key back, or revoke the invitation and send a new one.
- Keep the same `SLATE_SESSION_SECRET` for the life of the deployment. Slate keeps each waiting message encrypted with a key derived from it, so changing it makes any message that has not been sent unsendable, and signs everyone out.
- Slate does not put your provider key or the sign-in links in its activity feed, status responses or backups.

## What happens when a message is sent

Each request makes at most one attempt. A background job that runs every minute picks up anything still waiting.

- A message eligible for retry is tried at most three times: when it is first sent, then at about 150 seconds and at about 300 seconds. The job runs once a minute, so a retry can start a little late. Provider downtime, a pause in the background job or a backlog can delay mail, and Slate promises no delivery time.
- Before every attempt Slate checks that the message is still wanted. If you revoke the invitation, the person already joined, or the link is no longer valid, the message is cancelled. An email that has already left cannot be recalled, but the link in it is checked again when someone uses it.
- If all three attempts fail, the message is marked failed and a person can start another round of three from the app while retry remains safe. A round keeps the original message. Unclear outcomes are held as described below.
- When the provider says it accepted a message, Slate records it as sent. That means the provider took it, not that it reached an inbox.

### Managed relay

HTTP 202 with `accepted: true` means the provider accepted the message. The relay returns no message receipt ID; this response is valid acceptance, not proof of inbox delivery. Invitation delivery queues HTTP 429 responses, respecting `Retry-After` within the existing retry budget. A refused sign-in email is shown as a mail problem; request a new sign-in link after fixing it. Ambiguous outcomes are held for review, with no blind automatic or manual resend. Ask Run Edit Run support to check a held message before requesting a new sign-in link or replacing an invitation.

### Resend

Resend remembers identical requests for 24 hours, so a retry cannot send a second copy. Slate retries an unclear result within 23 hours of the first attempt, with the same message. After that window Slate clears its copy and records the failure instead of risking a duplicate. You then need to send a new sign-in link, or revoke and re-send the invitation.

### SendGrid

SendGrid does not offer the same protection against duplicates, so Slate is more careful:

- When SendGrid clearly rejects a message, the failure is shown and the owner can retry it.
- When the outcome is unclear, for example after a network error, a server error, an acceptance that comes back with no identifier, or a send that was interrupted, Slate **holds** the message. It will not send it again automatically, and the Retry button will not send it either. Instead it asks you to check SendGrid.
- Look in SendGrid's own activity log for the recipient address. If the message went out, you are done. If it did not, revoke the invitation and send a new one, or ask the person to request a new sign-in link.

## Where you see what happened

- **Sign-in screen.** After someone asks for a link they see that it is queued, then sent. If a send fails they see that. If Slate cannot confirm the outcome, it says the request was received and that delivery has not been confirmed, and does not claim the email was sent.
- **Settings, Invitation delivery.** The owner sees the latest 100 sign-in links and invitations, one row per request, with its state, the number of attempts, the next attempt and a safe error note. Other members see the invitations they sent. From here you can retry a failed message while it is safe to, and revoke an invitation.

Slate keeps the provider's HTTP status and category for a failure, but not the provider's raw reply, because providers can echo back the signed links.

Asking for a sign-in link again from the same screen carries on with the same delivery instead of starting a second one. Changing the address, or choosing to use a different address, starts a new request.

## If an email does not arrive

Work down this list.

1. **Check junk and spam folders,** and ask the person whether their mail system blocks the sender's domain.
2. **Look at the state in Slate.** Settings, Invitation delivery shows whether the message is queued, sent, failed or held. Queued means Slate is still trying. Sent means your provider accepted it.
3. **For Managed hosting,** Run Edit Run supplies the sender and credential. Check hosting access and ask Run Edit Run support to review held messages; you do not need a provider account. For your own provider, **check the sender.** `SLATE_MAIL_FROM` must be a sender your provider has verified.
4. **For your own provider, check the provider and key.** Confirm `SLATE_MAIL_PROVIDER` names the provider that owns the key, and that the key is still valid. If you changed either, put the original back for messages that are still waiting.
5. **For your own provider, look in its activity log.** It shows whether the message arrived there, was delivered, bounced or was suppressed. That is the only place that can tell you what happened after Slate handed it over. For a held SendGrid message it is the way to decide what to do next.
6. **Every page answers 503?** A required setting is missing and the page says which. Review the required inputs in OPERATIONS.md. `rer deploy --environment production --dry-run` validates/builds locally without provider requests. Correct the named missing inputs before an authorized deployment.
7. **Still failing?** Check that `/health` answers `ok`. That confirms the database and the file bucket can be reached, but it does not prove that mail is working.

If a sign-in link has expired, ask for a new one. Sign-in links stop working 60 minutes after they were sent, and invitations 24 hours after.

## Go deeper

- [Install and deploy](INSTALL.md) has the full setup steps.
- [Cloudflare footprint](CLOUDFLARE.md) covers the every-minute background job that retries mail, and says that your provider's charges are not part of the Cloudflare estimate.
- The full notes on retries and recovery are in the [mail delivery notes](MAIL-DELIVERY.md) on GitHub, and the SendGrid deployment notes are in the [deployment notes](release/sendgrid-deployment.md) on GitHub.
