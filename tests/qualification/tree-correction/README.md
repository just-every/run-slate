# Composed tree correction

Run from the edition root with Node 26.8.1 and pnpm 8.15.6:

```
pnpm exec vitest run --config tests/qualification/tree-correction/vitest.config.ts
pnpm exec tsx --test tests/qualification/tree-correction/ui.node.tsx tests/qualification/interface/tree-order.test.ts tests/e2e/page-move-state.test.tsx
QUAL_EVIDENCE=/absolute/external/evidence node tests/qualification/tree-correction/browser.mjs
```

The browser check requires the emitted `pnpm build` artifact and installed Chromium. It uses only assigned local ports 8748/8749, real local D1 and the emitted Worker, and closes its runtime/browser in `finally`. Its labelled identity fixture replaces mailbox possession; it does not send mail, deploy or invoke inference. Storage tests use the existing real Workers/D1 fixture and deliberate SQL race injection immediately before an actual atomic batch.

Coverage: exact edit/full access boundaries including anonymous exposures and authority revocation; UTF-8 BINARY order including scalar boundaries and IDs; untouched descendant history and true no-op; anchor revision conflicts before confirmation and within the batch; stable actor-readable preview hashes with hidden cohort guards; permission-derived tree controls, actual mouse drag and native accessible placement selectors.

The immutable existing tree-order suite has two outdated positive setups that authorize changed-audience moves with only source edit access. They remain unchanged and fail closed after this correction; the new suite separately proves full-authority cross-container movement and unchanged-audience edit-only placement. No existing semantic assertion, fixture or migration is weakened.
