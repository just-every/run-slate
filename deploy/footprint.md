# Core-wiki Cloudflare footprint — 6 October 2026

Use **Workers Paid (Standard), $5/month account minimum**, for the planned hosted
candidate. This is an engineering budget, not measured acceptance or a purchase.
Free remains possible for sufficiently small workloads but its 10 ms invocation
CPU limit has not been demonstrated for Slate's search/import/SSR work. The Paid
allowance is 10 million requests and 30 million CPU ms/month; overages are
$0.30/million requests and $0.02/million CPU ms. Static-asset requests are free.
Account allowances are shared with other apps. [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/).

Source topology is one Worker (`src/server.ts`) plus its built static assets,
one D1 database (`DB`), one R2 bucket (`FILES`), one Queue (`JOBS`), one SQLite
Durable Object class (`ContentCollaboration`) and one every-minute cron.
The DO migration remains applied; core-wiki denies new collaboration sockets.
Queue batch size is 10, timeout 5 seconds, retries 3. There are 15 original SQL
files; `0009` is absent in the source tree and is not fabricated.
The generated integration spec checks exact source topology and migration hashes.
RER may add app/preview gateway Workers; those management costs are outside this
native-application estimate. Preview plans disable scheduled and queue effects.

A 30-day planning example for 25 active members, 20,000 pages, 200,000 blocks,
50,000 records and AI off is below. These are explicit workload assumptions,
not measurements or capacity promises.

| Meter | Assumed monthly quantity | Budget implication |
|---|---:|---|
| HTTP Worker requests | 1,000,000 at 10 ms average CPU | 10 million CPU ms |
| Cron | 43,200 invocations at 5 ms average CPU | 216,000 CPU ms; cron still queries D1 |
| Queue work | 100,000 messages, each <=64 KB, successful first attempt | 300,000 operations (write/read/delete); provision 1 million CPU ms as a conservative per-message estimate |
| D1 | 1 GB, 100 million rows read, 2 million written | Inside Paid's included 5 GB, 25 billion reads, 50 million writes |
| R2 Standard | 8 GB-month, 100,000 Class A, 1 million Class B | Inside separate included 10 GB-month, 1 million A, 10 million B |
| Durable Objects | Fresh core-wiki: no socket sessions; no retained data assumed | No active use assumed; upgrades retain old DO storage and must measure it |
| Native mail | Actual login/invitation/delivery volume | External provider cost excluded |

The example is approximately **$5/month Cloudflare**, if other applications do
not consume these shared allowances and observed quantities match. Total Worker
CPU assumption is 11.216 million ms/month. Queue retries and messages larger than
64 KB increase operations; asynchronous backups/imports and indexing can dominate
CPU, scanned D1 rows and R2 storage. Temporary export archives and old versions
must be counted in the bucket, not just current media.

D1 overages are $0.001/million rows read, $1/million written and $0.75/GB-month.
A query's scanned rows count even when it returns few records. [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/).
Queues includes 1 million operations/month on Paid, then $0.40/million; retries
are additional reads. [Queues pricing](https://developers.cloudflare.com/queues/platform/pricing/).
R2 Standard's separate free allowance is not a promise that every backup remains
free. [R2 pricing](https://developers.cloudflare.com/r2/pricing/).
SQLite DO storage persists and is billed until removed; disabling a feature does
not erase it. Paid includes 1 million requests, 400,000 GB-s and 5 GB-month SQL
storage; beyond included storage is $0.20/GB-month. [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/).

Before adopting a capacity or cost claim, measure emitted Worker CPU/p95 latency,
D1 read/write metadata and storage, Queue operation/retry counts, R2 peak storage
and operation classes, and retained DO state against real accepted workloads.
No such provider/load measurement was performed for this source candidate.
No plan, subscription, account setting, remote resource or deployment was changed.

Measure each committed candidate with `pnpm build` and `pnpm artifact:delivery`. The delivery descriptor records emitted modules, client assets and applied SQL migrations. Output size does not establish provider CPU, billing, capacity or production workload limits.
