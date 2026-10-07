# Routed interface qualification

Run against the emitted application, with fresh isolated local D1/R2 and the existing Playwright Chromium. No external provider, email, inference, deployment or browser installation is used.

```sh
pnpm typecheck
pnpm build
QUAL_EVIDENCE=/absolute/evidence/directory node tests/qualification/interface/routed.browser.mjs
QUAL_EVIDENCE=/absolute/evidence/directory node tests/qualification/interface/restore.browser.mjs
QUAL_EVIDENCE=/absolute/evidence/directory node tests/qualification/interface/suggestions.browser.mjs
pnpm exec tsx --test tests/qualification/interface/formatting.test.ts tests/qualification/interface/highlights.test.ts tests/qualification/interface/tree-order.test.ts tests/flagship/frontend/*.test.ts
```

The runners reserve only ports 8742 and 8743. Run them sequentially. `QUAL_MODULES=content,saving,...` selects diagnostic modules; only the default run executes the combined gate. Without `QUAL_EVIDENCE`, artifacts go to the ignored local `.artifacts/interface` directory. Every runtime records source and emitted artifact identity; browsers and Workers close in `finally`.

The checks operate actual routes, controls, authenticated HTTP and persistent state. Identity fixtures replace mailbox possession. Retained AI output/measurements, valid legacy tree positions, and the interrupted-worker job state are explicitly labelled test fixtures; they do not claim provider quality, a real provider dispatch, or an observed production interruption. The job check reads native durable status and invokes actual lease recovery; the portability Worker suite separately exercises live running work and R2 failure transitions. No application response is fabricated. Browser request pacing stays below the ordinary local operator rate limit.

`routed.json` names each asserted facet and associated requirement IDs, rather than declaring whole clauses satisfied. `restore-ui.json` records a real rich-content export, empty-deployment UI restore, session replacement, new sign-in and exact block/property comparison. External accounts, genuine inference quality, hosted behavior, and complete WCAG acceptance require separate evidence. Automated axe checks and screenshots alone do not establish those outcomes.

`suggestion-cas.json` proves a metadata-only status revision leaves the immutable content revision unchanged, while the routed proposal uses the current mutation revision, preserves original content until explicit acceptance, and creates a fresh accepted revision. Its failure-path direct request is diagnostic evidence only; a failed routed proposal still fails the check.
