# Restored effect authority regression

The effect boundary authenticates the actor and checks current requester/source disclosure before rejecting persistent restore markers with `403 RESTORED_AUTHORITY_REQUIRED`. This precedes provider access and mutations. Ordinary run resume/replay retains its 409 conflict; historical authorized reads do not require execution authority.

Run `pnpm exec vitest run --config tests/qualification/release-restore-authority/vitest.config.ts` for native D1/R2 export/restoration, receipt history, stripped credentials, revoked grants, both restore fences, missing/removed actors, allowed dispatch and replay, unchanged effects/outbox/budgets/history on denial, cancellation and separately authorized successors. `preserved.config.ts` exercises the broader authority/recovery suites, whose profile and evaluation prerequisites differ. Provider transport alone is simulated in these tests.
