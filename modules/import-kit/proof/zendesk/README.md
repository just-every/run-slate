# Lily branch proof (synthetic)

This is a branch proof, not the Lily adoption. It uses the unchanged domain
planner and canonical queue compiler from Lily
`d24f3f7b4785863a0438a5fa7fde43d71f772a4b`. The kit owns planning fingerprint,
review, durable job, atomic native SQLite publication, originals, provenance,
idempotency, process recovery and undo. It never invokes Lily's old apply function.
`source-manifest.json` binds every source file used by that source tree, its
migrations and fixture; the runner rejects changed source and runtime versions.

Materialize that commit in a separate read-only local directory. Provide the
pinned Wrangler 4.129.1 and Vite 8.2.2 runtime from its lockfile (reusing an existing
installation is sufficient). No account, token, provider login or live endpoint
is required. Run:

```
PLAYWRIGHT_SKIP_BROWSER_GC=1 WRANGLER_SEND_METRICS=false node modules/import-kit/proof/zendesk/run.ts /absolute/pinned-lily /absolute/proof-output
node --test modules/import-kit/tests/zendesk/*.test.ts
```

The runner writes the synthetic NDJSON exactly as Lily's own test does from its
unchanged fixture module, and supplies its unchanged `[0,128,255]` attachment.
It runs the actual original `scripts/import-zendesk.mjs` twice (dry run and apply)
on a fresh migrated D1/R2 installation. The port uses another fresh database with
all of Lily's unchanged migrations and the same Administrator, namespace and
mapping. It compares independent native tables and source identities, public
messages/private notes, lifecycle/queue/search projections, unsupported outcomes
and exact attachment bytes. Full added/removed/changed row deltas are compared against each separately migrated baseline. Only independently generated import timestamps are
normalized; source timestamps remain exact. FTS virtual/shadow storage is excluded;
its owning search documents and packs are included.

Eight wrapped source inputs produce ten source outcomes: the ticket contains two
comments. The kit input count remains eight; each message, note, relationship,
attachment and generated native row has a separate attributed effect. Unsupported
objects are retained as explicit source-only outcomes, and channel conversion is
reported. All original wrapper bytes and attachments remain in kit custody.
Generated native projection effects record and validate their physical rows;
undo removes their attribution before their owning row's native cascade removes
physical projections. Customer addresses have no cascade and are removed explicitly.

The crash worker is SIGKILLed inside the second native publication transaction,
after the first batch committed. Another process reopens and finishes the job.
A further process undoes it and checks all native tables against the initial
baseline. The fixture's related effects fit one bounded reversal transaction;
undo uses batchSize 1000 because Lily's deferred foreign-key dependencies must
reverse together. Larger archives and arbitrary graph splits are not qualified
by this fixture proof.

Imported staff remain inactive. Preparation refuses plans that generate mail work,
dispatch attempts or notification recipients. The assigned historical fixture
creates only inert native notification event/history rows with no recipients;
HTTP/queue/cron writers are never started. Originals and provenance use SQLite
BLOB custody rather than R2; R2 is used by the independent original CLI.

The fixture is synthetic documented-format evidence. No authorized real export
was supplied, no catalogue status is promoted, and DATA-003 real-export acceptance
remains unverified. The parent must add the new nested suite to Base's top-level
module test discovery; this unit does not own the aggregator.
