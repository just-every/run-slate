# Content implementation handover

The content lane owns only server modules in pages, editor, lifecycle, versions,
page-status, comments, containers, archive, publishing, media, collaboration and
suggestions, migration `0003_content_collaboration.sql`, and tests/flagship/content.
UI files and shared integration remain with their writers.

## Integration exports

- `pages/routes.ts createPagesRoutes` at `/api/pages`; create/read/property CAS,
  per-block CAS, block-tree replace, exact-revision opens, tree expansion, queries,
  move preview/apply, duplicate, bulk commands, publish/schedule/discard.
- `containers/routes.ts createContainersRoutes` at `/api/containers`.
- `versions/routes.ts createRevisionsRoutes` at `/api/revisions`; history, exact
  revision, compare, restore, intermediate labelled-version tombstone.
- `comments/routes.ts createCommentsRoutes` at `/api/comments`; page threads,
  rich comments/replies, author edit/delete, resolve/reopen/all, reactions.
- `page-status/routes.ts createStatusRoutes` at `/api/status`; vocabulary,
  exact-human-open attestation and expiry view.
- `archive/routes.ts createArchiveRoutes` at `/api/archive`; archive/trash,
  restore, explicitly named permanent cascade.
- `media/routes.ts createMediaRoutes` at `/api/media`; multipart upload and
  page-authorized attachment download/scoped inline serving.
- `publishing/routes.ts createPublishingRoutes` at `/api/publishing` and
  `createPublicPagesRoutes` at `/p`; explicit exposure, stored host/slug,
  container/workspace vetoes, published-only rendering and sanitized media.
- `collaboration/routes.ts createCollaborationRoutes` at `/api/collaboration`;
  real namespace websocket `/:pageId/socket`, committed snapshots, presence.
- `suggestions/routes.ts createSuggestionsRoutes` at `/api/suggestions`;
  revision-pinned proposals, human acceptance, exact maintenance-grant acceptance.
- `collaboration/durable-object.ts ContentCollaboration`, binding
  `CONTENT_COLLABORATION`. Native session and current ACL are rechecked on every
  message/snapshot, at one-second idle checks, and on explicit invalidation.
- `collaboration/invalidation.ts invalidateContentRooms` must be awaited after
  ACL/session revocation. Core Hono now does so for relevant mutation families.
- `lifecycle/jobs.ts runContentJobs`: schedules, once-only verification-lapse
  outbox records, durable R2 deletion queue and stale presence cleanup.

## Atomic consumers

`prepareCreatePage`, `prepareReplaceBlocks`, `prepareRestorePage`, and
`prepareRecordProperties` return statements for the caller's core commitOperation.
The caller authorizes its destination/page in the outer operation; page/block
revision guards remain in the prepared batch. `prepareImportedPageMetadata` and
`prepareImportedMedia` support atomic import plans. Media staging must be cleaned
up by the import coordinator if its transaction does not retain the file row.

`archive/erasure.ts prepareEraseMemberContent` is specifically for the core
self/owner-authorized erasure transaction, and returns no private body to that
administrator. It composes structured/discovery/intelligence erasure and durable
R2 cleanup. Normal member removal must continue to archive instead.

`publishing/delegated.ts publishGrantedPage` and
`suggestions/delegated.ts acceptGrantedSuggestion` enforce the intelligence
writer's exact current grant plus an atomic grant revision/expiry guard. The
calling run must supply its complete source provenance. Neither is a human
verification entrypoint.

## Verification

Run `pnpm exec vitest run tests/flagship/content` and `pnpm typecheck`. Tests use real local Worker/D1/R2, Hono routes, the registered Durable Object namespace and native sessions. They exercise content, authorization, idle revocation and expiry. These are focused local checks; complete UI, capacity and deployment acceptance remains separate.
