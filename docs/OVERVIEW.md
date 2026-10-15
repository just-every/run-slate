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

To look around locally, install Git and Node.js 22 or later, then run the commands below. There is no Node or pnpm version to choose: rer fetches the ones the checkout pins and installs its dependencies itself.

```sh
curl -fsSL https://runeditrun.com/install.sh | sh
git clone https://github.com/just-every/run-slate.git slate
cd slate
rer dev
```

You can also install rer with `npm install -g @runeditrun/rer`. In a fresh checkout, `rer dev` installs the pinned dependencies, prepares a placeholder local owner and prints a link that opens Slate signed in. Separate `rer install` and `rer setup` steps are optional; run `rer setup --owner-email you@example.test` first to choose your own owner email. No email is sent locally.

For an existing installation, follow [Update your existing wiki](INSTALL.md#update-your-existing-wiki): export first, then `git pull --ff-only` and `rer deploy` to the same environment. Rer installs the pinned dependencies as part of deployment.

## About the project

The current version is 0.1.0. The [changelog on GitHub](../CHANGELOG.md) lists what it includes. The product requirements are in [CONTRACT.md](../CONTRACT.md). Slate is MIT licensed; the licence is in [LICENSE](../LICENSE).
