# Decision layer qualification

Run with pinned Node 26.8.1 and pnpm 8, installed frozen dependencies, and existing
Playwright Chromium. No browser download, deployment, provider delivery or model
inference is needed or authorized by these runners.

```
pnpm typecheck
pnpm exec vitest run --config tests/qualification/decisions/vitest.config.ts tests/qualification/decisions/mechanics.test.ts tests/qualification/decisions/closure.test.ts
pnpm exec vitest run --config tests/qualification/decisions/migration.config.ts
pnpm exec vitest run --config tests/qualification/decisions/vitest.config.ts tests/flagship/intelligence/authority.test.ts -t DEC-003
pnpm build
node tests/qualification/decisions/emitted.mjs
```

The first two suites use real Workers/D1. They prove proposal editing and no-op
CAS, owner authority, immutable accepted snapshots, exact history, two-way
supersession and activity, review notes and native overdue notices, removal and
replacement layers, all six log filters, current citations and transactional
source-change races. Recursive page/decision/skill closure cases verify truthful
staleness, real grant revocation, and authorized historical reads for archived or
private-draft backing pages without current grounding authority. The retained
method evaluation fixture is labelled and proves no model/method quality. The migration suite starts before 0013 with populated,
linked accepted/superseded records and verifies preservation of every original
column, reference, citation, review and page plus a clean foreign-key check.

The emitted runner owns only ports 8736/8737 and always closes its Worker and
browser. Its labelled identity fixture replaces mailbox possession; product
records then use native HTTP. Actual browser controls edit, accept and review a
decision. Native HTTP filters and opens exact accepted history, removes the layer,
and creates a replacement. SQL before/after snapshots prove retained page body,
link, original child, comments, grants and versions. SQL inspection explicitly
stops/restarts the Worker to preserve single ownership of local SQLite. Set
QUAL_EVIDENCE to choose an absolute evidence directory.

The browser exercises existing page decision controls. New standalone decision
log/detail/removal UI belongs to the interface lane and needs its own integration
checks. Fixture actor clicks are not independent human acceptance; none of this
proves model usefulness, real provider acceptance or release readiness.

The broader old intelligence/authority and claims suites still use unqualified
model-route fixtures at this checkpoint. Four cases fail before their intended
assertions with MODEL_ROUTE_UNQUALIFIED (the reservation case observes no runs).
Those original tests and fixtures are unchanged. The original DEC-003 regression
is separately executed and passes.
