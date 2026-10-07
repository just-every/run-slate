# Native index performance regressions

Use an isolated, migrated local D1 state and pinned repository dependencies.
`scoped-read.mjs` is read-only and requires at least 10,000 canonical pages in
its selected workspace. It samples different positions and key counts, runs the
actual canonical document reader through native D1, and records EXPLAIN plans
and rows-read metadata before asserting work proportional to the selected keys.
It fails against the workspace-scan implementation without altering its SQL or
manufacturing any native response.

```sh
node tests/qualification/release-index-performance/scoped-read.mjs \
  --config LOCAL_CONFIG --persist-to OWNED_LOCAL_STATE --workspace WORKSPACE \
  --report OWNED_EVIDENCE/scoped-read.json
node tests/qualification/release-index-performance/generations.mjs \
  --config LOCAL_CONFIG --persist-to OWNED_LOCAL_STATE \
  --report OWNED_EVIDENCE/generations.json
```

`generations.mjs` adds uniquely named synthetic workspaces to the owned state.
It uses real native D1 statements and transactions. The observation adapter
pauses at application statement boundaries for actual concurrent canonical
writes, nested rebuilds and a controlled interruption; it never supplies a
stored response. A native SQLite abort separately verifies publication rollback.
Content checks exercise long retained text, Unicode spans, exact phrases,
working/published readers, thread-only dirty keys and live revocation through
actual search.

Run the existing `tests/qualification/search/semantics.mjs` and
`tests/qualification/search/capacity.mjs` unchanged as well. The latter retains
100,000 pages in five containers, its 120-second rebuild subprocess bound, and
20 selective plus 20 broad requests with each p95 at most 500ms. These focused
regressions do not replace that qualification or its independent release gate.
