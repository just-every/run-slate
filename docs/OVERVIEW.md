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

To look around locally right now, use Node 22.20.0 and pnpm 10.12.4, then run:

```sh
npm install -g @runeditrun/rer@0.2.1
git clone https://github.com/just-every/run-slate.git slate
cd slate
rer install
rer setup --owner-email owner@example.test
rer dev
```

Open the printed outbox, choose the newest sign-in message and follow its one-use link. No email is sent.

For an existing installation, follow [Update your existing wiki](INSTALL.md#update-your-existing-wiki): export first, pull the source update, install dependencies, then deploy to the same environment.

## About the project

The current version is 0.1.0. The [changelog on GitHub](../CHANGELOG.md) lists what it includes. The product requirements are in [CONTRACT.md](../CONTRACT.md). Slate is MIT licensed; the licence is in [LICENSE](../LICENSE).
