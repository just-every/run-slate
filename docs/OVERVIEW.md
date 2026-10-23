# Slate

Slate is a self-hosted team wiki. Pages, databases and search live in one open-source app that runs on your own Cloudflare account, so your data stays in your account. It is free and MIT licensed, and the source is at https://github.com/just-every/run-slate.

## What you get

- **Pages** that nest into trees inside containers. Type `#` for a heading, `@` to mention a person or a page, and `/` to insert anything else.
- **Databases.** Give a collection its own fields and view it as a table, a board or a chart. Every record is a page.
- **Search** across pages and records, showing each person only what they are allowed to open.
- **Sharing and publishing.** Give people, groups or guests view, comment or edit access, and publish a page to the web when you want to.
- **History.** Slate keeps revisions, so you can compare two and restore the one you want.
- **Everything around them:** comments, templates, verification, an inbox, containers, and backup and restore.

## Start here

1. [Install and deploy](INSTALL.md) takes you from a fresh clone to your first sign-in, on your machine or on Cloudflare.
2. [Moving in](IMPORTING.md) brings your pages over from Notion, Confluence, Google Docs, Word and plain files.
3. [Backup and restore](BACKUP.md) keeps a copy of your workspace and puts it back.

## Run it

- [Email delivery](EMAIL.md) covers choosing Resend or SendGrid, what Slate sends, how failed sends are retried and what to check when mail does not arrive.
- [Cloudflare footprint](CLOUDFLARE.md) shows what Slate uses on your Cloudflare account and a worked cost example.

To look around locally, install Git and Node.js 22 or later, then run the line below. There is no Node or pnpm version to choose: rer fetches the ones the checkout pins and installs its dependencies itself.

```sh
npx -y @runeditrun/rer dev just-every/run-slate
```

To start it again later, run `cd run-slate && rer dev`. This checkout runs its pinned rer 0.2.25. In a fresh checkout, `rer dev` installs the pinned dependencies, prepares a placeholder local owner and prints a link that opens Slate signed in. Separate `rer install` and `rer setup` steps are optional; run `rer setup --owner-email you@example.test` first to choose your own owner email. Setup prepares local settings and the owner, then exits with no app running; `rer dev` starts Slate. No email is sent locally.

For an existing installation, follow [Update your existing wiki](INSTALL.md#update-your-existing-wiki): export first, then `git pull --ff-only` and `rer deploy` to the same environment. Rer installs the pinned dependencies as part of deployment.

## About the project

The current Slate version is 0.2.0. The [changelog on GitHub](../CHANGELOG.md) lists what it includes. The product requirements are in [CONTRACT.md](../CONTRACT.md). Slate is MIT licensed; the licence is in [LICENSE](../LICENSE).

## Connected file references

Use **Add block → Connected file** in a page to choose a file from your own connected Google Drive or SharePoint / OneDrive account. Owners enable these providers in **Settings → Import & export → Folder imports**; connect there with the same email you use in Slate. Browse a folder or enter its provider folder ID. A long folder listing says when more files exist so you can narrow it.

The card fetches the current title, provider-reported owner, modified time and type using each reader's own connected account. **Refresh file** checks again after a rename. A reader whose provider access fails sees only the provider, **Request access** and the original provider link; an unconnected reader also gets **Connect to view**. Slate changes no provider permissions. Deleted files show unavailable without the old title. Disconnecting destroys that member's token; the page keeps its reference and asks for access when opened again.

Only the provider, file ID and stable link are stored in the page. Exports, archives, restored pages and revisions retain that reference, with no file bytes, provider token or cached metadata. Readable exports and public pages show the provider link; they do not fetch connected-account metadata. Attaching a copy remains the separate file-attachment action. [Chest](https://github.com/just-every/run-chest) is the RunEditRun file-storage product; Chest card needs Chest's file-metadata door, not published. Drive and SharePoint evidence uses recorded provider fixtures only; no real provider call or consent was used.
