# Sign-in upgrade note

Slate now signs people in through Base operator-auth composed over Slate's own
members and sessions. Apply migrations `0022_native_identity_authority.sql` and
`0023_identity_providers.sql` as usual; both are additive and applied migrations
are unchanged. Every member, owner, role, group, guest and live session survives.

**Email.** A sign-in link now works once and expires after an hour. Opening it
shows a confirmation page; pressing Confirm signs in. Links sent before the
upgrade show a page asking for a new link.

**Identity provider.** If `SSO_ENABLED=true`, keep `IDENTITY_ISSUER_URL`,
`IDENTITY_CLIENT_ID`, `IDENTITY_CLIENT_SECRET` and the provider's registered
callback `https://YOUR-SLATE/api/auth/identity/callback`, and add these before
deploying:

| Setting | Value |
| --- | --- |
| `IDENTITY_AUTHORIZATION_ENDPOINT` | `authorization_endpoint` from the issuer's `/.well-known/openid-configuration` |
| `IDENTITY_TOKEN_ENDPOINT` | `token_endpoint` from the same document |
| `IDENTITY_JWKS_URI` | `jwks_uri` from the same document |
| `IDENTITY_TRANSACTION_SECRET` | A new random secret of at least 32 characters, different from `SESSION_SECRET` |
| `IDENTITY_TOKEN_AUTH_METHOD` | Optional: `client_secret_post` (default, as before) or `client_secret_basic` |

Slate trusts only those exact HTTPS endpoints and RS256 signatures. Until they
are set, the deployment reports a configuration error naming the missing
settings. A member's first provider sign-in links that provider identity to the
member with the same verified mailbox; it never moves to another member later.
Provider sessions last up to 24 hours, and changing the provider settings ends
them.

**Confirm-by-email for sensitive actions.** Hosted workspace export, restoration,
permanently deleting a page, changing ownership, removing an owner or erasing a
person, issuing an agent credential and connecting a source now need an email
confirmation from the last ten minutes. Slate sends the link to your own address
when you try; open it, confirm, then try again.

**Local development.** `rer dev` opens signed in as the owner. The dev badge
switches between the owner, the `editor` and `guest` personas and signed out;
local mail is silently suppressed. A signed-in local owner can export without
email confirmation. No mail-capture page is available.

**Linked provider setup.** Setup offers an optional existing provider URL. Leaving it blank keeps native email sign-in. The Base native accounts adapter currently refuses unattended first-time provider approval (`native_capability_unavailable`); selected provider setup is blocked until Base supplies that capability. An existing owner may approve a prepared link through the shared owner-authorized protocol, and relink/unlink/logout keep their explicit authority checks. Local protocol evidence proves that boundary, not first-time setup or hosted provider acceptance.
