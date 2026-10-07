# Native search state regression

Use the repository's pinned Node/pnpm, build the current source first, and supply
isolated local qualification storage and a free application/inspector pair:

```sh
QUAL_EVIDENCE=/path/to/receipts QUAL_PORT_RANGE=59400-59419 \
  QUAL_APP_PORT=59400 QUAL_INSPECTOR_PORT=59401 \
  node tests/qualification/release-search-state/native.mjs
```

This drives the emitted Worker, native D1 and the browser. It delays real script
delivery while starting normal fill/select actions against server-rendered
search controls. It does not replace a response, simulate application data in
source, or alter the original test deadlines. Before the repair, enabled SSR
controls accept edits without handlers; hydration resets the query/kind, and
Search sends `q=&kind=`. Afterward controls become editable only when handlers
and restored URL state are ready. The same actions must return the exact
no-results text, clear only filters and create a persisted page with the entered
title. Other checks cover URL filters, reload, back/forward, ignored result and
authority parameters, native read revocation and default core-profile behavior.
Mailbox possession and content setup are explicit local test fixtures only.

`original.mjs` imports and executes the original four discovery browser checks
without changing their functions, fixtures, assertions or deadlines. Optional
`SEARCH_DELAY_ROUTE=true` delays only delivery of the real search route chunk by
750 ms to exercise the same hydration window with the unchanged journey.
`trace.mjs` records input/change/submit events, control values, handler attachment
and actual search request parameters; it changes no product state. Each runner
closes its browser and local Worker in `finally` and emits receipts in its runtime
directory. Run original checks separately from the new regression.
