# Qualification suites

`pnpm test:qualification` builds the production Worker and runs, in sequence, the
earlier qualification suites that still pass: the Workers configurations, the
Node tests and the emitted-Worker and browser journeys listed in `run.mjs`.
CI does not run them. The release wall is `pnpm verify`, `pnpm test:release-regressions`
and the CI journeys in `ui-convergence/` (`pnpm test:ui:journeys`).

The emitted-Worker journeys choose ports in 8700-8799, and the navigation journey
uses 59800-59819; run nothing else on those ports at the same time. Each run
writes its receipts to a temporary directory that is removed afterwards.
