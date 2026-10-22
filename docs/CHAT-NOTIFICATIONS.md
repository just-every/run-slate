# Connect chat notifications

Open **Settings → Chat notifications**. A workspace owner can connect channels for the whole workspace or a container. A container owner can connect channels for their own containers. Select **Add destination**, choose Slack, Microsoft Teams or Nook, choose **Events from**, and select the events that belong in that channel. If Slate asks for email confirmation, open the confirmation link and save again. Each destination has its own selection, status, last delivery and last failure. There is no one-channel limit.

Messages contain the event, actor, title and a link. They never contain page or comment text. The link requires sign-in and access. Slate checks the current channel audience and each person's access before sending; if anyone cannot read the linked record, nothing about that event is sent to that channel.

## Slack

Create or choose a private channel that is not shared with another Slack workspace or organization. Invite your Slack app. Every person in the channel must have a visible Slack email matching an active Slate member. Deactivated Slack accounts are ignored. No other bot may be in the channel.

In your Slack app's **OAuth & Permissions**, grant bot scopes `chat:write`, `groups:read`, `groups:history`, `users:read` and `users:read.email`. Install or reinstall the app, then invite it to the channel. Find the channel ID in its details. Enter that ID and the app's Bot User OAuth Token in Slate, select events, then choose **Save chat delivery**. The default wiki needs no connected Slack source identity.

Where the separately configured Slack source-consent surface is available, an owner can also choose a connected identity and private channel through **Connect through Slack consent**. That destination has the same private-channel, membership and access checks. Revoking or replacing its source authorization stops it until reconnected.

## Microsoft Teams

Use an Entra application with delegated Microsoft Graph permissions `ChannelMessage.Send`, `Channel.ReadBasic.All`, `ChannelMember.Read.All`, `TeamMember.Read.All`, `Organization.Read.All`, `User.Read.All` and `TeamsAppInstallation.ReadForTeam.All`, with the tenant's required consent. Sign in as a licensed Teams user who can read the destination roster and post to the channel. Obtain a delegated Graph access token through that application's normal authorization flow. An application-only client-credentials token is not a channel-message posting credential for this feature.

Choose **Microsoft Teams**. Enter the team ID and channel ID separated by a slash, then the delegated Graph access token. Choose the scope and events and save. Slate posts a plain-text channel message through Microsoft Graph; it does not use an incoming webhook. Expired tokens need a fresh delegated token through **Reconnect**.

Slate refuses shared channels outright. A standard channel must belong to a private team; a private channel uses its own roster. Slate checks the complete paginated roster Graph exposes and refuses guests and external accounts. Every entry must be an enabled tenant member whose visible email matches their Graph user record and an active Slate member, and every mapped member must be able to read the linked record. Missing or unrecognized identities, incomplete responses and inaccessible rosters prevent connection or sending. Slate also checks the team's installed applications and refuses a bot or a missing application definition. Slack's separate exclusion of other bots is unchanged.

## Failures and reconnecting

Each destination chooses immediate delivery or a daily digest. Immediate delivery waits until the UTC minute closes; more than five events per destination per minute become one message. Daily delivery groups the day's events after midnight UTC. Later events for the same page within 24 hours reply in the first message's thread. When a page is deleted, moves beyond the channel's audience, or its actor is erased, Slate edits every message it sent about it to "Restricted Slate page" while the destination remains connected and its credential is available. Withdrawal failures remain pending for retry; disconnect, revoked authorization or erasure of the configuring member can prevent remote edits.

Rate limiting delays the destination until the provider's `Retry-After`; no queued event is lost. Other transient rejections before acceptance retry within the existing bounded retry window using the same operation key. Permanent rejections do not retry. An uncertain write is held for review so it is never blindly sent twice. Graph's `client-request-id` is a correlation ID, not a deduplication guarantee. Slack can reconcile an uncertain write from a matching provider receipt; Graph uncertainty stays recorded for review.

Expired or revoked authorization changes only that destination to **Needs attention**. Other destinations continue. **Reconnect** keeps the destination, selection and history; enter a fresh credential. **Disconnect delivery** stops new sends and pending work for that destination and destroys its stored credential. Already accepted provider messages cannot be recalled by disconnecting.

Deployment configuration must include `CONNECTOR_CREDENTIALS_KEY` while any destination is connected or needs attention. Missing it fails startup by name. Credentials are encrypted, never returned by the API and excluded from workspace exports. Restored destinations are disconnected and need fresh authorization. Erasing the configuring member destroys their destination credentials and removes their stored audience references.

## Existing installations

Migration 0045 extends the existing registered `chat_connections` table and removes its one-live-destination index. It preserves destination IDs, ciphertext scopes, selections, history and the default Slack bot-token API. Migration 0046 adds the `chat_messages` and `chat_message_sources` tables to track sent messages and their source events for threading and withdrawal; existing portability and member-erasure handling still applies. Back up before upgrading. If reverting the application, restore the pre-upgrade backup into a separate installation; do not run old single-destination code over a store configured with several destinations.

## Provider acceptance and Nook

Slack and Teams are covered by tests that replace only the provider's network boundary. These are not real-provider receipts. Live Slack acceptance still needs a private, unshared test channel with the bot invited and all people mapped to active Slate members. Live Teams acceptance still needs a licensed Teams user in the held tenant. Neither live leg was run for this change.

Nook destinations connect through Slate's adapter for Nook's notification-token door (target, missing in Nook). A deployment without the approved `NOOK_NOTIFIER` binding refuses Nook at connect. No Nook live acceptance is claimed.
