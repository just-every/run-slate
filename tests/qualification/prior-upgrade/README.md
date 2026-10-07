# Genuine old-store upgrade qualification

This harness consumes the already populated and sealed unreleased WIP baseline
`b6a303b79f73c4155a4819cd2ae5c9a085eb18ef`. It never populates or replaces
`original-state`. Its prepare-only command reads baseline JSON metadata and
hashes the readonly sealed backup; it does not open the original SQLite files.

Source the runtime paths recorded by the execution handoff, prepend the pnpm8
binary directory, set `PRIOR_EVIDENCE` to the absolute existing execution evidence
directory, then run:

```
export PRIOR_EVIDENCE=/absolute/path/to/slate-prior-upgrade-execution
node tests/qualification/prior-upgrade/preflight.mjs
python3 tests/qualification/prior-upgrade/oracle-selftest.py
```

Only after the parent explicitly supplies and authorizes the final SHA and source
checkout, set `PRIOR_FINAL_SHA` and `PRIOR_FINAL_SOURCE` and run `prove.mjs`.
Inspect `candidate-proof/candidate-migrations.json` against the actual frozen
candidate before permitting any unknown migration delta. No floating pin is
accepted. The frozen source clone and build, append-only receipts, snapshots,
current native archive, sacrificial invalid copy, browser images and result live
under the existing evidence directory's new `candidate-proof/` directory.
Do not rerun `prove.mjs` after an interrupted transition: inspect the exact
recorded phase and existing original store first. A failed result remains failed.

The proof starts from the SAME original state, applies final migrations twice,
checks every old table/column and duplicate-preserving complete-row multiset,
retains the original ledger timestamps, independently checks added values,
then exercises old APIs/browser/editor/record/archive and candidate restart.
The immutable backup is separately booted under the old artifact. A second
untouched sealed copy upgrades through the final candidate and compares the
migration outcome, excluding only appended ledger timestamps and random dirty
index generation tokens. Export requires the exact canonical table inventory from the frozen product's
`portableTables` declaration and exact column order from the stopped post-export
schema. It compares exact complete-row multisets against the post-export snapshot,
including duplicate counts. The only export-operation delta is its own
`federation_exports` row: archive-time running state/null key/empty counts/start
clock versus final completed state/key/exact manifest counts/completion clock,
independently checked against the durable operational journal. Missing tables,
columns, changed fields and arbitrary extra rows fail.

Current native export and fresh native restore are
separate checks, with complete-field preservation and explicitly enumerated
credential/authority/blob-key transformations. Unknown transforms fail.

Invalid archives are generated only as separately named sacrificial copies; the
native current archive is retained unchanged. Refusal checks retain portable
content while permitting the product's operational refusal journals. Mailbox
possession is a labelled fixture; token acceptance remains native. No inference,
mail, provider, deploy or remote recovery claim is made. Only ports 8730/8731
are used, every owned browser/worker is closed in `finally`, and the sealed
manifest is checked again after execution.
