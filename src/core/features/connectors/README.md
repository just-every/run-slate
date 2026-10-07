# Source and action boundary

Normal connection starts with `POST /api/connectors/prepare {sourceUrl,operationKey}`. Slate recognises a Google Docs URL, Slack message permalink or GitHub issue URL, uses an already authorised personal connection when it can read the selected source, or prepares the provider authorization URL. The signed-in person only follows provider sign-in/consent. `/oauth/:provider/start` and the same-site authenticated `/callback` use a ten-minute actor/workspace/provider-bound single-use state, S256 PKCE, exact configured redirect URL and encrypted token custody. Provider identity is discovered, never trusted from a caller claim. Deployment app registration/consent is an external prerequisite, not a successful connection.

Configure `APP_URL`, `CONNECTOR_CREDENTIALS_KEY` and the selected `GOOGLE_`, `SLACK_` or `GITHUB_CLIENT_ID` / `CLIENT_SECRET`. Development uses server-only `SLATE_` prefixes. Missing app configuration returns `CONNECTOR_CONFIGURATION_REQUIRED`. The advanced manual-token endpoint is optional, identity-checked and never the normal user journey. All access/refresh tokens and app secrets retained with a connection are AES-GCM encrypted. Refresh rotation uses a conditional claim; an uncertain exchange requires reconnect rather than blindly reusing a rotated refresh token. Disconnect destroys local credential custody and blocks every subsequent reader; it does not claim provider-wide revocation outside Slate.

Sources are selected individual documents/messages/issues, not silently crawled corpora. Each request bounds the source response to 2 MB and 15 seconds, stages 4,000-character immutable passages in six-passage batches, checks provider revision after staging, and switches the current version only on a complete commit. A failed/interrupted version never replaces the previous version. Hourly scheduling selects at most 25 sources; queue messages each process one source. Expired interrupted claims recover after fifteen minutes. An unusually large selected document returns an explicit size error rather than truncated evidence.

`resolveEvidence` rechecks current active local identity, connected personal provider identity and source-native access for requester and each declared output audience member. Native provider access is checked on every query/generation/delivery call. Unknown groups/public audiences are never silently widened: they need a disclosed rights mechanism; current implementation accepts named members only. Exact retained revisions are returned with current/stale state; unavailable revision, revoked credentials, inaccessible or deleted source returns a content-free tombstone. A newly staged but unpublished revision is never readable. Source deletion removes retained passage content. Search only returns permission-checked passage content, with no unfiltered counts.

GitHub is also an operational source. `getEffectAdapter` supports `github.issue.update`; intelligence owns exact grants, intent, single dispatch and reconciliation. GitHub's issue PATCH has no documented atomic revision CAS or request idempotency key: capabilities say so explicitly. Read-back can establish matching current fields, but cannot attribute an uncertain request's result. Never blindly resend or label this as an atomic conditional provider write. Native Orbit/H2H adapters implement the edition-owned `protocol = rer-delegation/1` protocol; a working connection requires live identity/capability negotiation against that implementation. Orbit's exact human outreach approval cannot be replaced by a Slate grant.

Primary references checked 2026-09-27:
- https://developers.google.com/identity/protocols/oauth2/web-server
- https://developers.google.com/workspace/drive/api/reference/rest/v3/files/get
- https://developers.google.com/workspace/docs/api/reference/rest/v1/documents/get
- https://docs.slack.dev/authentication/installing-with-oauth/
- https://docs.slack.dev/authentication/using-pkce/
- https://docs.slack.dev/authentication/using-token-rotation/
- https://docs.slack.dev/reference/methods/conversations.history/
- https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps
- https://docs.github.com/en/rest/issues/issues#update-an-issue

Provider mocks exist only in tests. They establish local protocol/security behavior, not live tenant acceptance. Authorized test accounts and registered provider OAuth applications are still needed for that evidence.


## Native edition connections

Configure exact `HAPPYTOHELP_DELEGATION_ORIGIN`, `HAPPYTOHELP_DELEGATION_CLIENT_ID`, `HAPPYTOHELP_DELEGATION_ACCOUNT_ID` and the corresponding `ORBIT_DELEGATION_*` values. Setup/dev environment inputs use the `SLATE_` prefix. Hosted setup accepts exact HTTPS origins only. Local loopback needs the explicit server-only `SLATE_ALLOW_LOOPBACK_DELEGATION=true`; it is rejected by hosted setup. Native source settings must independently register this Slate client and its exact `/api/connectors/oauth/<provider>/callback` URL. Source installation/account/principal/grant identity is negotiated and persisted; ordinary product sessions never substitute for delegation credentials.

Native stable URLs map only inside the configured origin: HappyToHelp `/projects/<project>/conversations/<id>` and `/projects/<project>/articles/<id>`; Orbit `/opportunities/<id>`, `/contacts/<id>`, `/companies/<id>`, `/signals/<id>` and `/opportunities/<id>/handoffs/<id>`. OAuth requests exact selected targets, retaining existing selected targets only in a new explicit consent. Expiring native delegations have no refresh-token fallback. Disconnect destroys local custody first, attempts native revocation, and separately reports unavailable remote revocation.

Native evidence/read checks bind the retained installation and account for every independently connected audience member. Native exact effects support only `happytohelp.article.update` and `orbit.handoff.upsert`. Article audience negotiation includes `intendedStatus=draft|published`; the source must CAS that projected audience against strict effect content. Receipts validate canonical request hash, installation/account/principal, operation, target, original revision and operation key. Lost HTTP response reconciliation can establish attribution from the source's durable receipt without a prior local receipt. Unknown receipt lookups never authorize replay. Handoffs do not send mail, approve outreach, purchase an add-on or enable SSO. Those account-service operations remain dependent on an actual owner-selected source.

Slack notifier consent uses the same personal OAuth flow with `{purpose:"notifier"}`, adding `chat:write`, `users:read` and `users:read.email` to the existing reader scopes. Notification code reuses the connector reference and current credential/identity checks; no second secret store is needed.
