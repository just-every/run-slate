# Slate SHARE-002 timeout repair

Repository: just-every/run-slate  
Branch: cloud/sd-slate-c-f201-fix1  
Product head: `491405a8bdc1d35c6470fd0b551d06ee36b098d4`  
Proof source: `e1853d86a7265b31679ee6b5179d73364d9ae78d`  
Proof/candidate tree: `4b74b0836410c348acf71bfdbb327da622c26530`

## Result

The original sharing journey retains main's 240000 ms timeout. The appended native permission matrix now has four independent 1440px registrations, each also capped at 240000 ms. All ten original/extended width-specific cases have passing timed receipts. The final qualification commit has the same tree as the proof source; it exists to request the exact-SHA push workflow after the intermediate saves used [skip ci]. No default branch was pushed, no published history was rewritten, and no landing or clause-completion claim is made.

## Full plan and implementation

1. Start from f201 candidate `02700389cd02ebdeaa7808d96382801de3ecd0ce` and merge fresh main `ba0a52e28727a7b9b6bfc5b8f5440444917b1dbb`. Preserve main's newer judgments, including REV-006 and the Workers-only evidence convention. Reapply only SHARE-002 supporting Evidence/Gap text; its status remains partial.
2. Restore the existing journey from 1200000 to 240000 ms and measure it. The combined registration timed out, so move the four independent level bodies into budget-permitted registrations. The AST inventory moves from 207 to 211; conservatively excluding only 20 release-wall cases leaves 191 ordinary registrations, below the unchanged cap of 200. Four explicit shard assignments retain one execution of every level.
3. Reduce actual work without deleting assertions. Overlap independent canonical reads with activity pagination while the actor is idle; bound each complete activity walk inclusively by the page's native creation time. Await real page-open responses after lock/unlock and native archive remounts before freezing replay inventories. Unmount the unused owner Welcome view, keep its authenticated API context, and reserve 105 ms diagnostic read slots below the unchanged production rate limit. No sleep/retry, skip, raised timeout, production rate change or relaxed comparison was added.
4. Retain the selected matrix in both original responsive core callers. Keep browser references in CONTRACT and descriptive prose, outside both Workers-only supportingTests and test-evidence.json. Regenerate/check contract views, restore ACCEPTANCE.md and docs/CLAIMS.md whole from main, then regenerate/check sources.lock.json last. The view files, test-evidence.json and verify.yml have no diff from main.
5. Push every substantial save with fleet identity/hooks and inspect all candidate commit identities and trailers. Qualify the same source, push the final candidate, read its exact-SHA Verify, and return this packet only through the separate evidence ref. The fleet retains publication/landing custody.

## Timed passing runs

All values below are seconds; every registration uses 240000 ms.

| Case | 1440 | 390 |
| --- | ---: | ---: |
| Original sharing journey | 85.023 | 89.349 |
| Full permission matrix | 228.813 | 214.352 |
| Edit permission matrix | 238.751 | 218.671 |
| Comment permission matrix | 164.464 | 158.689 |
| View permission matrix | 130.18 | 118.671 |

The original/edit/comment/view passes come from the complete per-width batch. The full case is measured alone, sequentially at both widths, after all competing native validation stopped. Parallel full-case attempts exceeded the limit and remain explicitly recorded as unqualified attempts in JOURNEYS-1440.log and JOURNEYS-390.log. FULL-ISOLATED logs contain the passing full-case runs. JOURNEYS.json preserves each command scope, duration, phase timings, source tree and emitted-build provenance. The eight compressed matrix files contain the complete actual canonical records, receipts, refusals and replay comparisons. BROWSER-EVIDENCE.tar.gz contains the required responsive publication/archive screenshots and their geometry/Axe records, once per selected state and width.

## Validation and preservation

ASSERTION-PRESERVATION.json compares the complete TypeScript-AST multiset of 480 assert/expect call expressions against f201: 240 sharing, 54 discussion, 67 page edits and 119 lifecycle/erasure. Every expression matches after whitespace normalization; all four level bodies still execute once. No assertion was deleted or weakened.

CHECKS.json records passing typecheck, structural contract checks, shard tests, source-lock/integration checks, publication inputs, project setup and release-source tests. Contract-doc generation and its check passed before restoring the two main views; source lock was regenerated last and checked. TERMINAL.json binds the pushed qualification head to the exact proof tree and records the final identity audit.

The complete local Workers execution passed 126 tests in 103 files. Its actual full JSON is archived in WORKERS-FULL.json.gz. The initial Verify lacked one Chromium path variable, causing the emitted access failure and its dependent BASE-ACCESS-002 tag failure; VERIFY-INITIAL files preserve those actual results. No Worker test failed.

The final `node scripts/verify.mjs` passed 17 checks with zero failures. It ran the emitted browser access gate fresh with system Chromium and used the contract job's supported report-input mode for the complete prior Workers results. WORKERS-REUSE.json proves the six inputs are lossless partitions of that actual report; no result, status or assertion was synthesized. A Git path audit confirms Worker source/tests, dependencies, migrations and configuration are unchanged by the later browser-harness fixes, and the emitted output hash is identical. Both Chromium path variables point to /usr/bin/chromium; the harnesses use --no-sandbox.

## Counts and clause scope

Full target before/after: 338 clauses; 57 done, 240 partial, 41 missing, unchanged. SHARE-002: partial -> partial. Only its supporting Evidence/Gap description changes. Every-operation coverage across other record families, lifecycles, profiles, principals, extensions, automation and public APIs remains unproven. Existing privacy, LIFE-002, REV-001, queued scope, inheritance, expiry, grant narrowing, ADMIN-007 and shared company-policy prerequisites remain authoritative. No provider or live-account proof is claimed.

## Exact-SHA CI and custody

Verify 42359905141 completed on the exact candidate SHA. Its only underlying failure is generated ACCEPTANCE.md freshness; the verify summary fails and downstream jobs skip as a consequence. This is READY under the brief's explicit lander-regeneration exception. The Mac must regenerate views and run Verify again before landing.

Run URL: https://github.com/just-every/run-slate/actions/runs/42359905141  
PR: none; this lane lands the named branch.  
CI read calls: 1; job/log reads are recorded separately after completion. No rerun was requested.

The evidence ref is report transport only and does not signal acceptance or landing. All selected files are actual reports/receipts or synthetic native-test browser proof; credentials, environment dumps, private held-out material and symlinks are excluded. The checkout/node_modules are scheduled for deletion only after product custody and evidence publication are verified; the terminal message confirms cleanup. The packet remains outside the clone.
