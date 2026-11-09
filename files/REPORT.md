# fv-slate-comments-1

Repository: just-every/run-slate. Product branch: cloud/fv-slate-comments-1. [Full plan](PLAN.md); [reproduction instructions](REPRODUCE.md).

## Cause

**(b): an existing load-sensitive browser-harness render race.** This is more precise than a hosted-only flake: the same failure is reproducible locally before the actor-aware transport. The phone assertion at comments-journey.mjs:223 reads the DOM, not a server snapshot. `open()` waits for navigation's network idle, then clicks Comments, mounting a fresh asynchronous `useResource` read. `InitialResourcesProvider` has already discarded initial document seeds after hydration. `Locator.evaluateAll` takes an immediate inventory and can return [] while that panel is loading. A separate actor-transport API read cannot synchronize React rendering.

The journey already awaits the real deletion PATCH response, verifies its receipt, reads back each committed deletion through `ok()` and checks its exact activity. Before the failing DOM assertion it verifies both persisted tombstones in order, one thread, six mutation activities, replayed receipts and an unchanged durable snapshot. The failure therefore does not show an uncommitted deletion or a broken actor queue.

## History comparison

Full DAG and first-parent history since 67b70648 are retained in main-history-all.txt and main-history.txt. Main is d2e67e449b239aacace820a458866cf81043ca96. Its parent, before timeout-6, is 70a1ca379440899480c93f715fb7f7be094bdfc6. Earlier main is 95a0372f6692b95607cedc7d1f9a0440dc9d3c38. Each historical worktree built its own emitted artifact; their provenance is retained.

The comments journey is unchanged since e1bd1c0f6b3f98e8027fd11cb021dbe02011c114. Timeout-6 changes no product source. From 95a0372f to current main the only product changes are two decision-lineage/successor lines, retained in product-range.diff; no comments, resource-loading or tombstone implementation changes occur. Testing both sides of the transport introduction and the earlier main shows that the transport is not the origin of this race.

Natural independent 390px runs: current main 3/3 pass; pre-timeout-6 parent 2/2 pass; 95a0372f 2/2 pass. This cloud does not reproduce the original hosted scheduling unaided. Under a controlled hold of the genuine comments GET response after the final reload, all three unchanged versions deterministically fail with the same [] versus two comment IDs. The held real 200 responses contain two null-body deleted records, and the separate durable API equality assertion has passed. No product response, storage, authority, delete timing or limiter is substituted.

No existing native limiter test seam was found. All runs preserve production limits; no 429-storm workaround, product limit change, retry, skip, fixed delay or increased timeout is used.

## Fix

Move the exact chronological DOM inventory assertion after the existing awaited assertions for both visible "Comment deleted" tombstones, erased body text and absent mutation controls. Keep the original exact inventory assertion, all native mutation receipts, actor-aware API snapshots, activity counts, author/refusal and replay checks. This is a synchronization change confined to COMM-002. The requirement specification records why a server snapshot is insufficient. Regenerate sources.lock.json with the documented command.

CONTRACT.md and all clause judgments are unchanged: COMM-002 remains done. Before/after counts are Core 59 done / 238 partial / 35 missing (332), Agent surface 0 / 0 / 6 (6), Full target 59 / 238 / 41 (338). No clause promotion, workflow, shard or product change. Contract regeneration writes zero changed documents and its check passes; generated views are restored from origin/main and excluded from the commit.

## Validation and custody

Controlled fixed case passes: the test begins its existing tombstone wait while the panel inventory is [], releases the same real response, then observes both IDs. This establishes a condition wait rather than accidental delay. Structured results and controlled traces are in the packet. Natural fixed repetitions, exact candidate browser captures, command receipts, product SHA/push and exact-SHA Verify are recorded below as they complete.

The first standalone transport-check invocation omitted SLATE_CHROMIUM_PATH, so Chromium launch failed before test cleanup and left its local listener alive. Only that owned test process was stopped; rerunning with /usr/bin/chromium passes all three transport tests. This invocation error is separate from the comments regression. The native content HTTP acceptance registration passes (one selected test, three outside the filter skipped), including COMM-002 native-session assertions. Two release-source tests pass. Integration sync, contract generator/check, source lock/check, diff whitespace and the publication input scan pass.

No production deployment or product landing is performed. The fleet remains responsible for publication scanning and landing. Evidence publication is report-only and does not signal acceptance or landing.

Product commit: `0b55774db7e7454174c6d7474ba46b4cf55f820f`. One product push succeeded on attempt 1. The exact commit was rebuilt using the repository's installed Node 22.20.0; candidate native comment journeys pass once at 1440 and once at 390. The final screenshots and complete browser/axe receipts bind to that exact build, contain both visible tombstones and preserve six mutation activities; no serious/critical accessibility violation or horizontal overflow. Three independent fixed natural phone trials also pass. Product tree is limited to the assertion move/comment, requirement test specification and source lock. No PR is required by the repository's shipped landing rules; none was created.

The requested comparison has no good/bad boundary attributable to timeout-6: the controlled case is already bad at both historical baseline refs. Further bisection inside that interval would not identify an introducing commit. `transport-range.diff` retains the relevant helper and budget changes. The comments snapshot itself remains sequential (`await read()`, then `await activity()`), and the real deletion response settles before both; the unsynchronized operation is the later immediate DOM inventory.

Additional full-context validation: the exact candidate’s original 390px core-wiki registration reaches and passes COMM-002 after the native export/restore, writing, touch creation and column steps. `full-context-comments-observed.txt` retains its actual probe line. The complete registration continues through later, unrelated steps; its terminal result will be retained separately.

The additional complete local 390px core registration hit its unchanged 780000ms overall timeout after COMM-002 had passed and while later template/archive/revision steps were still progressing. This is a red full-registration result, not a passing full-suite claim. Its complete log and terminal status are retained. No deadline, workflow, unrelated product or limiter change is made to compensate. Exact-SHA hosted Verify remains the required CI result.

## Terminal result

**READY**: branch `cloud/fv-slate-comments-1`, head `0b55774db7e7454174c6d7474ba46b4cf55f820f`. Exact-SHA Verify Slate run **42550265520** completed **success**: https://github.com/just-every/run-slate/actions/runs/42550265520. This is the complete push workflow, not a subset dispatch or another SHA. Six GitHub calls were used, including the initial locally mishandled discovery response; no job rerun was needed. The watcher used one process and at least 300 seconds between observations. No PR was created or required.

Targeted and controlled results: baseline natural 7/7 pass across three revisions; baseline controlled 3/3 reproduce the exact empty DOM failure; fixed controlled 1/1 pass; fixed natural 3/3 pass; exact candidate browser 2/2 pass (1440 and 390); native HTTP selected acceptance 1 pass; transport 3 pass; release-source 2 pass; generator, integration, source and publication-input checks pass. The additional full local phone registration is **red/cancelled at its unchanged 780-second deadline**, with COMM-002 already passed; do not interpret its later completed functional probes as a passing registration. Its whole log and exit 1 are included. The same candidate's complete required hosted Verify is green.

Cause remains **(b), an existing asynchronous panel-render race**, rather than a delete-commit or actor-queue regression. COMM-002 remains **done → done**; all counts remain unchanged (Full target 59 done, 238 partial, 41 missing; Core 59/238/35; Agent surface 0/0/6). No product/limit/CI/deadline changes and no clause promotion. No remaining publication/CI blocker is observed; the independent fleet publication scan and landing remain the fleet's responsibility.

The report packet is published separately to `refs/heads/evidence/fv-slate-comments-1`. Product custody and report transport are independent. Final evidence ref/head is given by the transport's terminal receipt; this report does not claim a product landing or deployment.
