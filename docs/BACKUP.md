# Backup and restore

A Slate backup is one zip file that holds your whole workspace. You can make one from the app or from the command line, and restore it into a new, empty deployment. Only workspace owners can make a backup, and only the owner named in `SLATE_SETUP_OWNER_EMAIL` can restore one.

## What a backup holds

- Workspace settings, members, groups and guests.
- Containers (the app calls them spaces), pages, databases, records and templates, each with its revision history and who can open it.
- Comments, notifications, automations and the activity log.
- Every uploaded file in its original form, and the original files of imports that have not been deleted.

Slate checks the archive's checksums before it restores anything.

A backup leaves some things out on purpose: sign-in sessions, sign-in links, pending invitations, saved responses to repeated requests, and every provider key and secret. Keep `SLATE_SESSION_SECRET` and your email provider's key somewhere safe yourself, because they cannot come back from a backup.

## Make a backup

### From the app

1. Sign in as a workspace owner and open **Settings**, then **Import & export**.
2. Under **Take your workspace with you**, select **Export workspace**.
3. When the status reads completed, select **Download workspace archive**.

Download it soon: Slate keeps a finished export for 7 days.

A complete backup needs the owner to be able to open every page, including private drafts and personal pages. If someone has pages you cannot open, or another member still has an import's original file saved, Slate stops with `EXPORT_SCOPE_INCOMPLETE` and says what is in the way. No partial archive is made. The files in a backup can add up to at most 256 MiB.

### From the command line

This native authenticated ZIP backup command uses the running wiki's URL and owner session. It is a distinct format and flow from `rer export` / `import` installation archives.

```sh
export SLATE_APP_URL=https://wiki.example.com
export SLATE_SESSION_COOKIE='slate_session=VALUE'
node src/core/features/portability/command.mjs backup backup.zip
```

`SLATE_SESSION_COOKIE` is the owner's session cookie, written as `slate_session=VALUE`. Sign in as the owner in your browser and copy the value of the `slate_session` cookie from the browser's developer tools. Treat it like a password: anyone who has it is signed in as the owner.

The command sends the cookie only to `SLATE_APP_URL`, which has to be an `https://` address (a local `127.0.0.1` or `localhost` address may use `http://`). It never prints the cookie. It creates `backup.zip` readable only by you, and it refuses to overwrite a file that already exists. When it finishes it prints the job's id and state, the file name and counts of what was exported.

## Restore a backup

Restoring replaces an empty workspace with the one in the archive. Read the rules first:

- **The deployment must be empty.** It must have no containers or other workspace records yet. Otherwise Slate refuses with `RESTORE_NOT_EMPTY` and changes nothing. To bring content into a workspace that is already in use, see [Moving in](IMPORTING.md).
- **You must be the setup owner,** and the archive must contain your email address. Set `SLATE_SETUP_OWNER_EMAIL` to the owner's address when you deploy the new instance.
- **The versions must match.** The archive has to fit the database layout of the Slate you are restoring into. A mismatch is refused with `ARCHIVE_SCHEMA_MISMATCH`, so restore into the same version that made the backup.
- **A restore is all or nothing.** Slate checks the whole archive, stages the files, then publishes everything in one step. If it fails, the deployment is left empty and you can try again.
- **Size.** The archive can be up to 256 MiB, and can expand to at most 512 MiB.

### On your computer

Use a separate checkout at the same Git revision that made the backup. Keep your existing checkout and its data:

```sh
git clone https://github.com/just-every/run-slate.git slate-restore
cd slate-restore
git checkout <backup-source-revision>
rer install
rer setup --owner-email you@example.test
rer dev
```

Replace `<backup-source-revision>` with the original checkout's `git rev-parse HEAD`, and `you@example.test` with the archived owner's email. Setup prepares the owner and stops its temporary server; `rer dev` starts the app and prints the private owner `RER_OPEN` link. Open that link, choose **Restore an existing workspace** before naming a workspace or creating its first space, upload the ZIP, and select **Restore workspace**. The untouched setup owner's default statuses and the scheduler's successful heartbeat do not make this destination nonempty. Real failed-job records remain protected.

Restore signs everyone out. Use the private owner entry from `rer dev` again to open the restored workspace. No sign-in email is sent locally. If the destination already has content or customized settings, use another fresh checkout; do not reset your existing workspace to make room for the archive.

### On a hosted installation

To restore:

1. Prepare a distinct empty deployment as described in [Install and deploy](INSTALL.md), with the archived owner's address as `SLATE_SETUP_OWNER_EMAIL` and the required private deployment inputs. Review `rer deploy --environment restore-preview --dry-run`, then run it without `--dry-run` when authorized. Choose an environment name distinct from your existing deployment and retain its `.rer/deploy` receipts.
2. Sign in. On the first step of the first-run setup, choose **Restore an existing workspace**.
3. Choose your `.zip` archive and select **Restore workspace**.
4. When it completes, select **Open restored workspace** and sign in again.

From the command line, `node src/core/features/portability/command.mjs restore backup.zip` does the same. It uses the same two environment variables as the backup command, pointed at the new deployment, so sign in there as the owner first to get its cookie.

## After a restore

- **Everyone is signed out.** Sessions are not restored, so sign in again.
- **Only the owner is active.** Other members come back as inactive until you invite them again.
- **Give yourself the spaces you need.** As workspace owner you manage every space's access, but reading a space comes from a grant. Share each space you need with yourself; a page restricted to a former member opens to that person again when you invite them back.
- **Nothing is published to the web.** Pages that were public are private again until a member publishes them.
- **Automations are off.** Switch on the ones you still want.
- **Reconnect anything external.** Provider credentials are not in the archive.

Restore into a separate, empty deployment first and check permissions, attachments and public pages before you point your team at it.

## Copy out a page or a container

To share a copy of just one part of the wiki, use **Export page** on a page, or **Export space** on a container. Choose Markdown, HTML or PDF, and whether to include child pages. You get one zip with the content and its media, readable without Slate, and it contains only what you are allowed to read. This is separate from a backup and is not a way to restore a workspace.

## Scheduled backups

A workspace owner can open **Settings → Import & export → Scheduled backups** and add an S3-compatible bucket or Cloudflare R2. Enter the endpoint, region, bucket, prefix and access credentials, then choose nightly or weekly, a UTC time and how many successful backups to retain. Saving enables that schedule. **Test connection** checks bucket access; **Run now** starts a backup immediately.

Only owners can configure, test, run or remove destinations, with a recent sign-in confirmation. Slate encrypts credentials and never returns them from the API or includes them in an archive. Removing a destination destroys its stored credentials and stops later runs; it leaves your bucket objects in your custody. Restored destinations are disconnected until an owner enters credentials again.

A run makes the same complete workspace ZIP as manual export. It streams bounded parts, verifies the uploaded object's size and SHA256 by reading it back, and only then removes older objects that this destination's own successful run receipts name. Other bucket objects are untouched. An incomplete export scope fails before any external object is written. One durable receipt per destination and period prevents concurrent or restarted schedulers from writing another object for that period. An interrupted run is recorded as failed and needs a later period or an explicit new run.

Each destination shows its last success and current safe failure. Each failed run gives every active owner one in-app notice; a later successful run clears the current failure while retaining run history. Email failure delivery is not available yet.

**Run restore drill** verifies the latest stored backup and shows a report, download and instructions. That report confirms archive validation; it does not claim a restore has run. Start a separate empty Slate deployment, sign in as its setup owner using an archived full member's email, restore the downloaded ZIP from Import & export, then sign in again and open the restored pages and their internal links. The source workspace must never be used as the restore target. Re-enter provider credentials after restoration.

Cloudflare R2 and other S3-compatible live-bucket acceptance has not been run for this build. Chest can join the same destination contract when it publishes an intake; it is not currently selectable.
