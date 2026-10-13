# Test runtime lifetime

Import D1 and operator-auth conformance reuse one lazily created Miniflare per
isolated Node test-file process. Each helper runs its migrations once, captures
its baseline once, restores it before each serialized case, and disposes the
runtime and temporary directory at file end. An import `reopen()` still disposes
workerd and opens the same persistence directory, without resetting or migrating.

Both helpers use `tests/support/d1-baseline.mjs` and
`tests/support/runtime-lease.mjs` at the repository root. Base's source-copy step
now excludes tests, so these Base-only fixtures do not need duplicate helpers in
each module. The portable auth conformance contract remains module-owned.

The shared reset clears rows, removes added schema, reconstructs changed or
missing baseline tables, restores seeded rows and autoincrement sequences, and
reinstalls baseline indexes, views and protection triggers. It deletes children
before parents and restores parents before children. Protection triggers are
removed only while restoring the baseline in a real D1 batch.

`d1-baseline.test.ts` contains the single reset test: mutate a real D1 binding,
then reset that same binding and check seeded rows, altered and added schema,
foreign keys, protection and sequence restoration. It replaces the four previous
isolation files and their eight cases; there are no per-helper reset tests.

The import fixture restores native tables and seeded session authority as well
as import storage. The auth fixture restores owners, sessions, tokens,
invitations, limits and captured mail. Its harness passes configuration per
request to the original Worker, which constructs its adapters per request and
has no deferred `waitUntil` work. Closing a case waits for dispatched requests
before releasing its lease.

## Current counts and lifecycle exceptions

These are source-level lifetime counts for `verify:modules`, not timings or a
before/after measurement:

- Ten discovered import files use the shared D1 fixture: `d1.test.ts`,
  `d1-preserved-provider.test.ts`, `d1-preserved-scale.test.ts`,
  `d1-read-only.test.ts`, `d1-original-name-custody.test.ts`,
  `original-name-bytes.test.ts`, `plan-cap-d1.test.ts`,
  `d1-stream-custody.test.ts`, `reviewed-source-native.test.ts` and
  `stream-review-integrity.test.ts`. Each creates one initial
  runtime; every explicit `reopen()` adds a real runtime creation. Imported
  nested suites share their containing file's fixture.
- Auth `conformance.test.ts` uses one runtime for ten Worker scenarios. Its
  adapter-validation case creates no runtime.
- The shared reset test creates and disposes one independent runtime.
- Import `d1/worker.test.ts` and `d1/normalized-worker.test.ts` keep separate
  runtimes for Worker loading,
  `nodejs_compat`, bundling and schema bootstrap.
- Import engine, scale, preserved-provider, preserved-set-provider,
  preserved-report-provider-scale, preserved-native-provider-scale and original
  name custody cases retain their explicit real persistence restarts. Full-scale
  inputs remain behind the existing pre-release scale command.
- Mail retains six workerd smokes: events, assembly, development runtime, core
  runtime, provider runtime and inbound. Events and development each create two
  runtimes for their same-store restart; the other four create one each (eight
  creations total). The retired mail event pool and reset harness
  have been removed.
- Integration token D1 and raw-webhook Worker checks retain separate runtimes
  and same-directory restarts for token/replay persistence.
- Auth core, upgrade, pre-ledger migration, cancellation and browser checks under
  `verify:operator-auth` retain their existing fresh lifecycles. Native SQLite
  reopen checks also keep their existing lifetimes.

No performance baseline was run for this revision. Targeted runtime checks and
final merged verification are run separately on a dedicated verification machine.

The source-derived before/after runtime and case counts are in
[`ops/test-runtime/inventory.md`](../../../ops/test-runtime/inventory.md).

### Retained real restarts

Case names below identify the unchanged declarations. Counts use default inputs;
the three scale restarts follow its existing checkpoint/continuation conditions.

| Case | Reason | Reopens |
| --- | --- | ---: |
| `bounded native contact + evidence publication, durable reopen/resume, originals, restartable undo` | Durable resume and restartable undo | 2 |
| `sequential imports transfer attribution and newer undo restores the original ownership chain` | Attribution survives undo restart | 1 |
| `multiple target transfers from one predecessor are atomic and reversal restarts across batches` | Reversal resumes across workerd termination | 1 |
| `complete public requests stay bounded across resumable entries` | Forward and undo checkpoints survive termination | 3 |
| `mixed preserved undo, restart, current authority and bounded report batch ${batchSize}` | Preserved reports and current authority across restart | 2 each at batch sizes 1, 4, 20 |
| `atomically grouped partial rollback preserves mixed owned effects and mode fences` | Rollback mode fences survive restart | 1 |
| `full native set and accumulated report guards remain exact across bounded undo and restart` | Undo/report guards remain durable | 1 |
| `all durable report effects resume, reopen and reject late final-chunk corruption` | Resumed report corruption is refused | 1 |
| `public first undo fences all present native effects and full export remains exact` | Undo fences remain durable | 1 |
| `original names retain leading, embedded and trailing NUL across restart and undo` | Byte-exact custody through restart and undo | 2 |
| `corruption after a name's NUL rejects read and publication` | Corruption refusal after reopen | 1 |
| `retains the complete Unicode and NUL name across restart and rejects a changed suffix` | Byte-exact names and corruption refusal after reopen | 2 |
| Integration `actual local D1 fixed batches bind grants and usage, roll back audit failures and persist after restart` | Token grants and usage remain durable | 1 |
| Integration `documented Fetch receiver runs in workerd with raw-byte authentication and durable D1 replay protection` | Replay protection survives termination | 1 |
| Mail `signed delivery intake is isolated, atomic and durable in real workerd SQLite and Queue` | Deduplication and recipient state survive termination | 1 |
| Mail `real D1 batches, workerd viewer and persisted bytes survive a complete runtime restart` | Outbox bytes survive termination | 1 |

Import's `Worker entry loads and plans inside actual workerd with nodejs_compat`
keeps its independent runtime and schema bootstrap: it loads the actual Worker
entrypoint rather than the host fixture's trivial fetch Worker.

Origin-depth keeps both cases fresh: `real D1 origin predicates fit its depth
limit through setup, live parent lifecycle and cold replay` and `real D1 balanced
origin guards reject changed parent binding and captured orphans`. Each measures
first and second initialization on a clean database; the first case reopens
twice, and the second once. Sharing an initialized fixture would remove that
condition. The normalized Worker smoke likewise keeps its independent
Worker-entry bootstrap.
