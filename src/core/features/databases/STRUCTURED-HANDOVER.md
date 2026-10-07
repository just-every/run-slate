# Structured work integration

Owned implementation is in the non-UI `databases`, `templates` and `automation` directories. Migration `0004_structured_work.sql` is additive: it backfills existing database record revisions and adds structured revisions, durable automation jobs/action receipts and event cursors.

## Public seams

- Mount `createDatabasesRoutes`, `createTemplatesRoutes`, `createAutomationRoutes` from each feature's `routes.ts` under `/api/databases`, `/api/templates`, `/api/automation`.
- `databases/service.ts`: `createDatabase`, `saveField`, `setStructureLock`, `createRecord`, `validateValues`. `records.ts`: `openRecord`, `updateRecord`. Record writes use content-owned page creation/revision plans inside the operation batch.
- `databases/views.ts`: `saveView`, `listViews`, `queryView`, `chart`. `evaluation.ts`: `recordValues(ctx,databaseId,raw,definitions?)` performs reader-scoped lazy formulas/rollups. Imported unsupported expressions retain their supplied values and carry `evaluationState: retained-not-recomputed`. Fields expose `readOnly`; record detail adds current `editable` affordances.
- `databases/discovery.ts`: `listDatabases`, `resolveReferences`, `referenceOptions` provide current reader-filtered navigation and actual member/file/record labels. GET `/api/databases`, POST `/api/databases/references`, GET `/api/databases/:id/references/:fieldId?query=`. Denied references are omitted; pickers return at most 100 matching authorized options.
- `databases/import-plan.ts`: `prepareImportedDatabase`, `prepareImportedRecord`; the import owner supplies authorized page statements and rewritten identities in the same transaction. `content-plan.ts`: `prepareRestoreRecordValues`, `prepareDeleteStructuredPages`; the content owner supplies page authorization/CAS. Source deletion disables automation rules and retains their receipts.
- `templates/service.ts`: searchable gallery (active/archived/deleted), preview, save, lifecycle/move/duplicate, apply, authorized retained assets. Snapshot children, property exclusions and independently copied attachments survive edits/deletion of the source or template. Application is one atomic page-tree operation; staged file copies with no committed file row are cleaned up.
- `automation/events.ts`: `scheduledAutomation(env,now?)`, `handleAutomationJob(env,message)` for `{type:'automation.drain'}`. Committed content events have a durable per-workspace cursor; origin operation receipts recover causal chains. Worker execution uses the rule's current actor, durable prepared actions and replay keys, current ACL checks, scope checks, bounded branches/rates/chains, leases and failure disabling. `adapters.ts` uses real content archive and discovery notifications.

## Verification

Run `pnpm exec vitest run --config tests/flagship/structured/vitest.config.ts`, `python3 tests/flagship/structured/migration.py` and `pnpm typecheck`. The suites exercise real Worker/D1/R2, authorization, CAS/replay, formulas and cycles, rollup privacy, policy alternatives, automation scope, permission loss and template independence. These checks do not establish deployed/provider acceptance.

### Template capability API

Template list items and previews expose authoritative `permissions.canManage`, `permissions.canApply` and `permissions.canDuplicate`. List responses and previews also expose `applyDestinations: {containerId,parentPageId:null|string,label}[]`. The UI must use these choices and send the selected parent when present. Choices run the same `destination()` checks as application; page-specific editors and guests can receive an editable parent choice without receiving the container index or private container names. Shipped templates report manage=false and retain their supported duplicate action. These are current affordances; mutation endpoints still reauthorize every operation.
