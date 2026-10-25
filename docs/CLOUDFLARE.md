# Cloudflare footprint

Slate runs entirely on your own Cloudflare account. This page lists what a deployment creates there, what each piece is for, how the pieces are named, and which meters can affect your bill. The prices and limits come from the project's footprint notes, dated 6 October 2026, and are Cloudflare's published figures as of that date. Check Cloudflare's pricing pages before you rely on them.

## What gets created

One deployment is one Worker plus a handful of resources, in the explicitly selected `CLOUDFLARE_ACCOUNT_ID`, authorized by `CLOUDFLARE_API_TOKEN`.

| Piece | What it is for |
|---|---|
| **A Worker** (`src/server.ts`) with its built static assets | Serves the app, the API and these docs. Static asset requests are free. |
| **A D1 database** (`DB`) | Everything the wiki stores: pages, databases, members, history and search. |
| **An R2 bucket** (`FILES`) | Uploaded files, plus temporary export archives and old file versions. |
| **A Queue** (`JOBS`) | Background work such as imports, backups and indexing. Messages are handled in batches of 10, waiting up to 5 seconds, with up to 3 retries. |
| **A cron trigger**, every minute | Picks up waiting work, including sign-in and invitation emails that need another attempt. |
| **A Durable Object class** (`ContentCollaboration`) | Backs live collaboration. Its migration stays applied, and a fresh deployment does not use it. |

Deployment stores the native owner email, session secret and selected mail provider's key as Worker secrets. See [Install and deploy](INSTALL.md).

## How things are named

`rer deploy --environment preview` reads `deploy.json` to create your deployment. Resource names use the project `just-every/slate`, your selected environment and the resource’s name in that file:

| Resource | Name for `preview` |
|---|---|
| Worker | `slate-preview` |
| D1 database (`DB`) | `slate-preview-db` |
| R2 bucket (`FILES`) | `slate-preview-files` |
| Queue (`JOBS`) | `slate-preview-jobs` |

Slate finds your workers.dev address from the Cloudflare account you select; keep the ownership records in `.rer/deploy` so later deployments can verify the resources belong to this installation. A resource with the same name is refused if that ownership cannot be confirmed.

Provide your account ID and API token when you authorize a deployment; use `--dry-run` to check and build locally without contacting Cloudflare. Local `setup` prepares only the app on your computer and creates no Cloudflare resources.

## What it is likely to cost

The footprint notes recommend **Workers Paid (Standard), $5/month account minimum**, for a hosted deployment. That is a planning budget, not a measured bill and not a purchase.

The Free plan may work for a small wiki, but its 10 ms limit on CPU time per request has not been shown to be enough for Slate's search, import and page rendering.

Paid includes 10 million requests and 30 million CPU ms a month. Beyond that, requests cost $0.30 per million and CPU time costs $0.02 per million ms. Static asset requests are free. These allowances are shared with any other apps on the same account. See [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/).

### A worked example

The notes give one 30-day example, for 25 active members, 20,000 pages, 200,000 blocks and 50,000 records. These are stated assumptions, not measurements and not capacity promises.

| Meter | Assumed monthly quantity | What it means for the budget |
|---|---:|---|
| Worker requests | 1,000,000 at 10 ms average CPU | 10 million CPU ms |
| Cron | 43,200 invocations at 5 ms average CPU | 216,000 CPU ms; the cron job still queries D1 |
| Queue work | 100,000 messages, each up to 64 KB, successful on the first attempt | 300,000 operations (write, read, delete); the notes budget 1 million CPU ms as a cautious per-message estimate |
| D1 | 1 GB, 100 million rows read, 2 million written | Inside Paid's included 5 GB, 25 billion reads and 50 million writes |
| R2 Standard | 8 GB-month, 100,000 Class A and 1 million Class B operations | Inside the separate included 10 GB-month, 1 million Class A and 10 million Class B |
| Durable Objects | A fresh deployment has no collaboration sessions and no stored data assumed | No active use assumed; an upgrade keeps old Durable Object storage, which has to be measured |
| Email | Your actual sign-in and invitation volume | Your email provider's charges are not included |

The notes put that example at about **$5 a month on Cloudflare**, provided your other apps do not use up the shared allowances and your real usage matches the assumptions. The total Worker CPU assumed is 11.216 million ms a month.

### What can push it higher

- **Retries and large messages.** Queue retries, and messages over 64 KB, add operations.
- **Imports, backups and indexing.** These run in the background and can dominate CPU time, scanned D1 rows and R2 storage.
- **Exports and old versions.** Temporary export archives and old file versions count toward the bucket, not just the files you can see.
- **Scanned rows.** D1 counts the rows a query scans even when it returns only a few.

Cloudflare's overage prices as quoted in the notes:

- **D1:** $0.001 per million rows read, $1 per million rows written and $0.75 per GB-month. See [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/).
- **Queues:** 1 million operations a month included on Paid, then $0.40 per million. Retries count as extra reads. See [Queues pricing](https://developers.cloudflare.com/queues/platform/pricing/).
- **R2 Standard:** it has its own free allowance, but that is not a promise that every backup stays free. See [R2 pricing](https://developers.cloudflare.com/r2/pricing/).
- **Durable Objects:** SQLite storage persists and is billed until you remove it, and turning a feature off does not erase it. Paid includes 1 million requests, 400,000 GB-s and 5 GB-month of SQL storage, then $0.20 per GB-month. See [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/).

## Measure before you trust a number

Before you commit to a cost or capacity figure, measure your own deployment against your real workload:

- Worker CPU time and p95 latency;
- D1 reads, writes and storage;
- Queue operations and retries;
- R2 peak storage and operation classes;
- any data kept by Durable Objects.

The figures above are estimates from stated assumptions. Slate's notes record that no such measurement has been made against a live provider account.

## Go deeper

The full notes are in the [footprint notes](../deploy/footprint.md) on GitHub. [Email delivery](EMAIL.md) explains how the every-minute cron job retries mail.
