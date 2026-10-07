# Data ownership local qualification

Run on Node 26.8.1 / pnpm 8.15.6. `QUAL_EVIDENCE` is optional; scripts default to the OS temporary directory.

```
pnpm exec vitest run --config tests/qualification/data/vitest.config.ts
pnpm exec vitest run --config tests/qualification/data/migration.config.ts
QUAL_ARCHIVE=/path/to/native/workspace.zip pnpm exec vitest run --config tests/qualification/data/archive-retention.config.ts
node tests/qualification/data/inventory.mjs
pnpm typecheck
pnpm build
node tests/qualification/data/emitted.mjs
```

The emitted runner exclusively uses ports 8738/8739 and closes its Worker. Its SQL fixture uses the shared stop–CLI–restart helper. It replaces mailbox possession only; native HTTP performs first-run setup, body edits, attachment upload, trash, permanent deletion and replay across restart. Workers tests use actual local D1/R2 and production services. The outbound service captures real Workerd HTTP at the local boundary and denies all unrecognized traffic; provider responses and a deliberate R2 outage are test-only fixtures, never provider acceptance or application replacements.

Executed facets:

- **BASE-DATA-002:** archived/trashed records survive past/future content maintenance; genuine native archive with 106 tables (31 populated) retains every preexisting canonical row and original blob through past/future content maintenance and all current native scheduled domains, with only a new automation delivery cursor; disposable search/presence state expires without deleting saved searches or underlying content, and results rebuild equivalently.
- **BASE-DATA-003:** page/body/revision/archive/R2 deletion; AI/skill/inquiry/experiment/evaluation/decision lineage; source-linked skills and method-linked inquiries on different host pages; member-owned navigation/source/credential stores; shared-work reviews/interruptions/guided steps; legacy AI rows; explicit source erasure; explicit permanent template erasure with reversible soft deletion preserved. Tests retain unrelated shared pages/assets. Publication attribution and choices are erased and schedule authority stays cancelled. Legacy import/export file metadata is tombstoned with its bytes. A real D1 actor revocation between authorization and commit rolls back all erasure before any R2 call. Failure stays visible and pending, and replay completes without another destructive audit. Template pending cleanup remains discoverable after reload without disclosing erased content.
- **BASE-DATA-004:** actual captured DNS/preview, Resend, OpenAI/local inference, GitHub/Slack/Google reads, OAuth, identity, chat and native HappyToHelp/Orbit HTTP requests. Source callsite inventory names direct and aliased fetch boundaries and their manifest declaration.
- **BASE-DATA-005:** native empty-database bootstrap and first-run setup, ordinary create/edit/read/search, and health work with external HTTP denied and no captured author/marketplace request. Source inventory is separate from execution evidence.

Migration 0015 preserves all nine existing archive-history columns and nullable canonical tree position, including foreign-key checks and native restore of null/non-null positions. Existing migrations and original tests/fixtures are unchanged.

Limits: 106 canonical tables plus 19 excluded stores are inventoried with exact columns and declared foreign keys. This is not a claim that all 125 tables contain personal canaries. Assertions identify purposeful populated stores; a canonical-table count is not erasure evidence. Provider failures at the local boundary prove request containment and fail-closed transport, not live provider operation. UI permanent-template controls belong to the interface lane. Parent composition must rerun against the final publication/audit/source freeze; no deployment, live inference, real mail, full-release or all-clause acceptance is claimed here.
