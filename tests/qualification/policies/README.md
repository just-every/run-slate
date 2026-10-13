# Policy/content/structured local semantic qualification

Run with Node 22.20.0 / pnpm 10.12.4:

```
pnpm exec vitest run --config tests/qualification/policies/vitest.config.ts
rer build
QUAL_EVIDENCE=/absolute/evidence/path node tests/qualification/policies/emitted.mjs
```

The suite runs application services and HTTP against Workers D1/R2. It does not
mock application endpoints or alter existing tests/fixtures/migrations. Identity
fixtures are labelled test actors. The one invitation test intercepts the external
mail transport solely inside the test; it proves local token/grant semantics,
not mailbox delivery. Simulated timestamps prove scheduler boundaries, not an
elapsed prospective window or human verification.

`emitted.mjs` uses the shared emitted-artifact runtime on **8748/8749**, completes
the actual setup UI with a mailbox-possession fixture, then exercises the actual
built HTTP APIs and anonymous publishing. It closes its browser and Worker in
`finally`. Its receipts identify the emitted hash and profile combinations. It is
not the separate UI writer's visible/hidden control acceptance.

## Assertion boundaries

- `lifecycle-versions`: both lifecycle values paired with labelled history,
  unpublished reader snapshots, published labels/ordinals, due/cancelled/failed
  schedules, immutable revision reads, restore and current-access revocation.
- `access-publication`: both general principals and both access profiles, all four
  permission levels on private drafts, expiry retention, private personal containers,
  inherited group revocation, both public profiles and each independent veto,
  public response/privacy/indexing/unpublish/reserved-address behavior.
- `private-surfaces`: unshared drafts excluded from other actors' search, tree,
  inbox, content queries and evidence; author draft grounding denial; current
  inherited origin/expiry rows; configured levels and concurrent configuration CAS.
- `imported-profiles`: **unchanged committed genuine Notion, Confluence, Google Docs,
  and Microsoft Word archives** pass through real persistent imports, original R2
  retention and replay. All eight policies/**17 values** round-trip, comparing
  complete stored page/block/revision/grant/container/exposure/status/field/record/
  automation tables before and after. A genuinely absent optional construct is
  not represented as an imported example of that construct.
- `superset-profiles`: rich preexisting authored data (private/live pages, grants, public exposure, labelled revision, status, database fields/record, template, comments and all rule scopes) survives forward/reverse switching with a second actor reload.
- `mention-lifecycle`: real draft/scheduled/live/unpublished/archive/trash/delete transitions retain current safe labels for owner and reader.
- `structured-views`: six layouts, authorized aggregate/filter/group/chart inputs,
  embedded independent filters, lock versus editable values, view lifecycle and
  actionable missing-field errors, both record parities with retained body,
  comments/history and page-tree return.
- `fields`: nineteen concrete field types, actual person/file/relation targets,
  atomic rejected edits/type loss, metadata read-only fields, empty semantics,
  reader-specific rollup/formula recomputation and revocation, cycle rejection.
- `automation-templates`: source/container/site rules and stored run history,
  event replay, current actor removal, forbidden action types, real scheduled slot
  and self-loop suppression; template preview/search/scope, independent snapshot
  application, archive/restore/delete and shipped-template duplication.
- `comments-suggestions`: independent-block concurrent writes, stale block rejection,
  anchored pending/accepted/stale suggestions and immutable content; author-only
  comment edits, exact mentions, non-notifying reactions, moved/orphaned anchors,
  historical reference, resolve/reopen and tombstones.
- `status-archive`: both status profiles, seeded vocabulary/custom/retired entries,
  exact-open attestation requirement, stale/expired retained verification and one
  notification; archive/trash/restore/confirmed cascade erasure with R2 cleanup,
  descendant identity and private draft discard.
- `container-links`: both container profiles, actual create/settings/index access,
  per-page partial bulk result and activity; current title/lifecycle references
  without restricted-title disclosure.
- `safety-history`: both version profiles' actual block comparison and independently
  calculated NFC SHA-256; malformed HTTP rejection, upload size/type/R2 access,
  active SVG sanitization and disposition.
- `invitations`: local mail transport double captures actual generated token;
  pending rows do not grant access, revocation prevents acceptance, successful
  acceptance grants only the target and token reuse is rejected.

Clause IDs in names identify **specific exercised local facets**, not an assertion
that every UI, timing-at-capacity, provider, human or release requirement in a long
clause is accepted. The parent owns the paired UI receipts, whole-clause review,
existing-data migration gate, immutable decision acceptance, six composed journeys,
and final emitted-source integration. No external provider/inference/human or
release acceptance is advanced here.

`report.mjs` combines Vitest JSON, the independent clause map and emitted receipts into a per-clause facet report. It never marks a whole clause accepted. Pass the three input paths and output JSON path in that order.
