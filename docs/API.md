# Personal API access

Open **Settings → Developer access** to create a personal token. Choose a name, one or more spaces, and read or read-and-write access for each space. Confirm through your email if Slate asks. Guests cannot create tokens.

Copy the secret when it appears and store it securely. It is available only once. Slate stores its hash. A token expires after 90 days unless you choose an earlier or later expiry, up to one year.

The token acts as you and follows your current page access. A write scope cannot grant editing rights you do not have. Removing a member, changing their role or revoking a token ends its access. Restored deployments retain token metadata, but members must create fresh tokens.

Owners see every personal token. Members see their own. Each entry shows its member, spaces, creation time, expiry, last use and state. Choose **Refresh token activity** after making an API call. Last use is recorded to the minute. Revoke a token with the confirmation control; its next request is refused.

## Calling the API

The versioned path is `/api/v1`. Send the token only in the `Authorization: Bearer` header. A browser cookie alone cannot call it. The public specification is at `/api/v1/openapi.json` on your deployment.

Pages, page blocks and page tasks support reads and changes. The specification lists each available operation and its request and response shape. Other resource families and application authorization are not available yet. Token administration, exports, publication and erasure use signed-in settings.

Supply an `operationKey` on every write. Retrying the same request with the same key returns its first result for 24 hours. Reusing a key for a different request is refused. Task updates send the task’s content and current block revision, just as block updates do.

Lists accept `limit` up to 100 and return an opaque `nextCursor`. Send that cursor with the same query to continue. Each token permits 120 requests per minute. A rate refusal returns HTTP 429 and a `Retry-After` header in seconds.

Errors have the same shape throughout the versioned API: `error` contains `code`, `message` and `requestId`. Keep the request identifier when reporting a problem. Token grants, use summaries, expiry refusals and revocations appear in Activity.

## Webhooks

Workspace owners can add a webhook in Developer access. Choose a space, event kinds and a public HTTPS destination on port 443. Save the signing secret once, just as you save a personal token. It is stored encrypted and is never included in an archive.

The outbound flow sends your destination the stable event identifier, event kind, action and time, plus record identifiers and titles only while the acting owner can read the record. It sends no page bodies or comment text. The DNS service receives the destination hostname to check public addresses before registration and before each delivery. URL credentials, fragments, local or reserved names and private addresses are refused. Redirects are refused, and each exchange has a ten-second bound. Resolved addresses are checked without address pinning.

The `Slate-Signature` header is `t=<unix-seconds>,v1=<hex-signature>`. Verify the HMAC-SHA256 signature over the timestamp, a dot and the exact request body using your saved secret. Check the timestamp against your receiver’s clock. `Slate-Event-Id` identifies the event, `Slate-Delivery-Id` identifies its delivery and `Slate-Attempt` identifies the attempt. Use the stable event identifier to deduplicate retries.

Failures retry at one minute, five minutes, thirty minutes, two hours, six hours, twelve hours and twenty-four hours from the first attempt. Exhausting the retry window disables the destination and creates an owner inbox reminder. View deliveries to inspect status, duration and up to 512 bytes of each response. Logs are retained for 30 days and excluded from archives. The panel shows the failure reason. Re-enable the destination and replay a delivery after fixing the receiver; a replay uses a fresh timestamp and signature with the same event identifier.

Removing the acting owner disables their destinations. Erasing them removes their subscriptions and logs. Restored subscriptions stay disabled without credentials; create a fresh destination after restoring.
