# TREE-002 relative placement qualification

Run `pnpm exec vitest run --config tests/qualification/tree-order/vitest.config.ts`.
The suite uses the real Workers/D1 application and original applied migrations.
The new fixture creates rows through the existing canonical seed helpers; only
boundary positions and explicit race conditions are changed with local SQL.

The selector is exactly one top-level `beforeId`, `afterId`, or `atEnd: true`.
Preview returns `changes`, `accessPreviewHash`, and `orderPreviewHash`.
Confirmation repeats the selector and both hashes with `expectedRevisionId` and
`operationKey`. Legacy string `treePosition` callers retain access-only preview.
Selectors cannot combine with legacy positions. Replaying a committed request
uses the ordinary operation receipt; an unchanged placement preserves revision
and activity while recording an unchanged receipt.

Coverage includes null, empty, tied, prefix/NUL and Unicode positions; before,
after, end, empty destinations; SQL ordering across hidden siblings; edit-only
placement; subtree reparent/access changes; stale root and descendant revisions;
invalid and inaccessible anchors; replay/conflicting keys; unchanged moves; and
multi-chunk repair. Bystander checks compare every page field except the permitted
position key, plus complete history and event rows.

The concurrency suite wraps only the real database batch entry point to inject
an actual SQL change after preparation and before the actual atomic D1 batch.
It compares all accessible database tables after the injected change with the
failed operation's final state, including receipts, guards, activity, search and
history. Cases cover sibling membership/key/location/deletion, subtree
membership/edges, destination/anchor liveness, revision CAS, ACL revocation and
inactive membership. HTTP invalid requests also preserve all domain tables;
the existing request-rate-limit counter intentionally records those requests.

No original tests, fixtures or migrations are modified. These are local
qualification checks, not deployment or full-release acceptance.
