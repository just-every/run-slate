# Connect chat notifications

Open **Settings → Chat notifications**. A workspace owner can connect channels for the whole workspace or a container. A container owner can connect channels for their own containers. Select **Add destination**, choose Slack, Microsoft Teams or Nook, choose **Events from**, and select the events that belong in that channel. If Slate asks for email confirmation, open the confirmation link and save again. Each destination has its own selection, status, last delivery and last failure. There is no one-channel limit.

Messages contain the event, actor, title and a link. They never contain page or comment text. The link requires sign-in and access. Slate checks the current channel audience and each person's access before sending; if anyone cannot read the linked record, nothing about that event is sent to that channel.

## Slack

Create or choose a private channel that is not shared with another Slack workspace or organization. Invite your Slack app. Every person in the channel must have a visible Slack email matching an active Slate member. Deactivated Slack accounts are ignored. No other bot may be in the channel.

In your Slack app's **OAuth & Permissions**, grant bot scopes `chat:write`, `groups:read`, `groups:history`, `users:read` and `users:read.email`. Install or reinstall the app, then invite it to the channel. Find the channel ID in its details. Enter that ID and the app's Bot User OAuth Token in Slate, select events, then choose **Save chat delivery**. The default wiki needs no connected Slack source identity.

Where the separately configured Slack source-consent surface is available, an owner can also choose a connected identity and private channel through **Connect through Slack consent**. That destination has the same private-channel, membership and access checks. Revoking or replacing its source authorization stops it until reconnected.

## Microsoft Teams

Use an Entra application with delegated Microsoft Graph permissions `ChannelMessage.Send`, `ChannelMessage.ReadWrite`, `Channel.ReadBasic.All`, `Team.ReadBasic.All`, `ChannelMember.Read.All`, `TeamMember.Read.All`, `User.Read`, `User.Read.All` and `TeamsAppInstallation.ReadForTeam`, with the tenant's required consent. Sign in as a licensed Teams user who can read the destination roster and post to the channel. Obtain a delegated Graph access token through that application's normal authorization flow. An application-only client-credentials token is not a channel-message posting credential for this feature.

The delegated scopes match the endpoints Slate uses: [`ChannelMessage.ReadWrite` edits sent channel messages and replies](https://learn.microsoft.com/en-us/graph/api/chatmessage-update?view=graph-rest-1.0), [`Team.ReadBasic.All` reads team privacy](https://learn.microsoft.com/en-us/graph/api/team-get?view=graph-rest-1.0), and [`TeamsAppInstallation.ReadForTeam` lists installed apps](https://learn.microsoft.com/en-us/graph/api/team-list-installedapps?view=graph-rest-1.0). [`User.Read` reads the organization ID selected by Slate](https://learn.microsoft.com/en-us/graph/api/organization-list?view=graph-rest-1.0); the separately required [`User.Read.All` reads other roster members’ non-basic user properties](https://learn.microsoft.com/en-us/graph/api/user-get?view=graph-rest-1.0). Keep the same posting user when refreshing the token so earlier messages remain editable. Application permissions for message updates only cover policy violations, not title withdrawal. Installing a Teams app with permission limited to one team is not yet supported by this setup; use the delegated sign-in described above.

Choose **Microsoft Teams**. Enter the team ID and channel ID separated by a slash, then the delegated Graph access token. Choose the scope and events and save. Slate posts a plain-text channel message through Microsoft Graph; it does not use an incoming webhook. Expired tokens need a fresh delegated token through **Reconnect**.

Slate refuses shared channels outright. A standard channel must belong to a private team; a private channel uses its own roster. Slate checks the complete paginated roster Graph exposes and refuses guests and external accounts. Every entry must be an enabled tenant member whose visible email matches their Graph user record and an active Slate member, and every mapped member must be able to read the linked record. Missing or unrecognized identities, incomplete responses and inaccessible rosters prevent connection or sending. Slate also checks the team's installed applications and refuses a bot or a missing application definition. Slack's separate exclusion of other bots is unchanged.

## Failures and reconnecting

Each destination chooses immediate delivery or a daily digest. Immediate delivery waits until the UTC minute closes; more than five events per destination per minute become one message. Daily delivery groups the day's events after midnight UTC. Later events for the same page within 24 hours reply in the first message's thread. When a page is deleted, moves beyond the channel's audience, or its actor is erased, Slate edits every message it sent about it to "Restricted Slate page" while the destination remains connected and its credential is available. Withdrawal failures remain pending for retry; disconnect, revoked authorization or erasure of the configuring member can prevent remote edits.

Rate limiting delays the destination until the provider's `Retry-After`; no queued event is lost. Other temporary rejections before a message is sent retry within the existing retry window without creating a second send. Permanent rejections do not retry. An uncertain write is held for review so it is never blindly sent twice. The destination shows **Needs attention** with **Resolve held sends**. Check the channel, then choose **Acknowledge without resending**. Acknowledgment keeps the uncertain history and any unresolved withdrawal; it does not confirm delivery or send another post. Other authorized work on the destination continues. Graph's `client-request-id` is a correlation ID, not a deduplication guarantee. Slack can confirm an uncertain send from its matching delivery record; Teams sends with unclear outcomes stay held for review.

Expired or revoked authorization changes only that destination to **Needs attention**. Other destinations continue. **Reconnect** keeps the destination, selection and history; enter a fresh credential. **Disconnect delivery** stops new sends and pending work for that destination and destroys its stored credential. Already accepted provider messages cannot be recalled by disconnecting.

Deployment configuration must include `CONNECTOR_CREDENTIALS_KEY` while any destination is connected or needs attention. Missing it fails startup by name. Credentials are encrypted, never returned by the API and excluded from workspace exports. Restored destinations are disconnected and need fresh authorization. Erasing the configuring member destroys their destination credentials and removes their stored audience references.

## Existing installations

Migration 0045 extends the existing registered `chat_connections` table and removes its one-live-destination index. It preserves destination IDs, ciphertext scopes, selections, history and the default Slack bot-token API. Migration 0046 adds the `chat_messages` and `chat_message_sources` tables to track sent messages and their source events for threading and withdrawal; existing portability and member-erasure handling still applies. Back up before upgrading. If reverting the application, restore the pre-upgrade backup into a separate installation; do not run old single-destination code over a store configured with several destinations.

## Before you rely on delivery

Slack and Teams delivery has been tested with stand-ins, not yet against a live workspace. After connecting, trigger a selected event in a private test channel and confirm the message arrives; Slack needs its bot invited and every person matched to an active Slate member, and Teams needs a licensed posting user.

For Nook, set your installation’s HTTPS address in `NOOK_NOTIFICATION_ORIGIN`, or provide its approved `NOOK_NOTIFIER` binding; without either, you cannot connect. Delivery has been tested with stand-ins only, so confirm a message arrives in your channel before relying on it.

Nook groups later events for the same page into its first message’s thread within 24 hours, and checks its delivery record before resolving an uncertain send without posting again. If that record is missing or cannot be checked, the send stays held; choose **Acknowledge without resending** after checking the channel, which keeps the unclear outcome and any unfinished message updates on record.

A replacement approval for the same exact app name and channel can edit that app's earlier posts under current channel authority. Slate uses this path to replace sent titles with "Restricted Slate page" after deletion, loss of audience access or actor erasure. A different app/channel pair or a revoked token is refused. If the destination is disconnected or its authorization is unavailable, withdrawal remains unresolved. These message updates have only been tested with stand-ins; check them in your Nook channel before relying on them.

A Nook destination stays bound to its approved channel. To use another channel, add a new destination with that channel’s token. Keep the original destination connected so Slate can withdraw its earlier messages. You can still rotate its token for the same approved app and channel, change events, or switch its delivery schedule.
