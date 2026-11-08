# fv-slate-timeout-6

Repository: just-every/run-slate
Product branch: cloud/fv-slate-timeout-6
Main baseline: 95a0372f (full identity recorded in receipt).

## Plan

1. Inspect main and the entire f212 candidate diff, then trace every sharing API transport and the production limiter's exact key/window/limit.
2. Reproduce and temporarily measure requests by operator, IP and limiter window in the local merge shape. Retain no cookies, tokens, credentials or private gate data.
3. Fix the cause in the harness only: a common native API transport with actor IP identity and shared scheduling, including snapshot branches and alternate helper paths. Keep production limits, all assertions, workflow layout and deadlines.
4. Measure the same merged mobile sharing journey after the change, repeat if no lowered-limit test seam exists, and check the extended matrices. Restore all temporary instrumentation.
5. Return to main plus the harness fix, synchronize integration and regenerate the source lock last. Run touched checks, inspect all candidate identities and messages, commit with fleet identity and push the named branch through the guard.
6. Discover/poll one exact-SHA Verify through REST within the ten-call budget. Publish complete non-secret reports and actual receipts only to the task evidence ref. Return product custody and inbox relay lines separately.

## Preliminary source findings

Main has no synthetic client-IP seam in browser-support.api() or two-people-support.call(). Its permissionLevelsJourney scheduler covers only calls to a locally wrapped state.api(), reserving 125 ms per responsive diagnostic read and 105 ms per extended read. Calls via ok()/call() and native browser activity bypass that reservation.

Production enforceRateLimit hashes {address, scope, bucket}. The operator scope is operator:<member.id>, with 600 requests in a fixed 60-second window; address falls back to local when CF-Connecting-IP is missing. Therefore owner and reader are already separate operator buckets even when their IP matches. A claim that two different members share one operator bucket is incorrect.

The f212 diff changes decisions, DEC-006 requirement wording, related registries, and a nested fresh proposal workspace after the sharing step. It does not add a request path to the comments snapshot. Further measurements and final diagnosis follow in the results section.

## Diagnosis and scope

The source-supported diagnosis is (b), with the non-reproduction limit below: the comments snapshot is one of five canonical inventory branches plus an unbounded sequence of activity cursor reads, charged to the owner's own fixed-minute operator bucket. The old 125 ms responsive / 105 ms extended reservation applies only to the local `state.api()` wrapper. Owner mutations through `call()`/`ok()`, reads before/after that wrapper and native browser work consume the same bucket without sharing that reservation. There is no total per-actor budget. The comment request is where an exhausted bucket is observed; comments do not have a separate bucket. f212 neither adds an actor nor bypasses a preexisting actor-IP seam in that path: main has no such seam. Its new decision-edit workspace runs later, after sharing. Different members sharing an IP is not the cause because `operator:<member id>` participates in the hash.

This cloud machine did **not** reproduce the reported 429 on the baseline merge: the complete mobile core caller passed locally, as did the isolated sharing caller. Consequently the historic failing runner's precise count and minute cannot be asserted from these local receipts. The diagnosed unbounded traffic path is established by source inspection; the new bound is established by clock-driven scheduler tests and actual request-window measurements. The fixed 600/60-second production limit has no environment/test override. No limit or limiter row was changed. The brief's m1 host was unavailable here; the dedicated cloud VM was used, so m1's reported independent 429 storms were not tested or attributed to this fix.

## Implementation

One `journey-api.mjs` transport carries the person's synthetic documentation IPv6 address, current native session and shared per-installation/per-actor scheduler. `state.api()` and `call()`/`ok()` both delegate to it; cookie overrides select their actual reader's queue, without changing the owner's browser identity. Owner, reader, touch, recipient and public-page browser contexts receive corresponding headers. Native UI requests continue through the real browser and emitted Worker.

All snapshot branches and activity cursor pages use that same queue, with one in-flight diagnostic request per actor. A bounded 100-request burst and five refills/second permit at most 400 probes per rolling minute, reserving 200 of the real 600 for browser activity. An extended matrix verifies that every owner page is unmounted before using 400 refills/minute plus the bounded burst (at most 500); it retains 100 requests of margin. Light journeys spend existing burst credits immediately. Refusals are returned once; there is no retry, response substitution or swallowed failure. Every canonical inventory and original assertion remains. CI partitions, registrations, workflow files and deadlines are unchanged.

The added regression is included in the existing reachability check, so the workflow shape is unchanged. It runs five simultaneous snapshot branches (including comments), an alternate `call()` and a cursor read against an actual local HTTP server, verifies one in-flight request, common IP/session, cookie overrides, identity switching and an unretried 429. Fake-clock burst tests prove both rolling-minute bounds without waiting a minute.

Temporary measurement logs only timestamp, limiter scope, synthetic/loopback address, fixed bucket, count, limit and pathname. No cookies, tokens, query strings, request bodies or environment values are selected for evidence. Measurement code is outside product source or in uncommitted generated output and is removed by the final clean build.

## Baseline evidence

The local proof merge has parents `95a0372f6692b95607cedc7d1f9a0440dc9d3c38` and `1ce8fa17` (the latter's full SHA is in the final receipt), at local commit `7c4b8a8b22839337ca3d44beaa68fa2d9747a71a`. It is never published as product work. CONTRACT.md was resolved first; main's newer status judgments were retained, generated contract documents checked, views restored from main, integration synchronized and source lock regenerated for that merge. f212's decisions implementation is present only in this local proof shape.

The baseline isolated mobile sharing run issued 815 owner and 159 reader requests; its maximum fixed-minute counts were owner 379 and reader 94, leaving 221 and 506 requests respectively. Its maximum rolling-minute counts were 416 and 118. The complete baseline mobile caller passed in 787.26 seconds. D1 samples from the latter are observations of cumulative counts, not a complete request event stream; `before-d1-observation.jsonl` is labeled accordingly. `before-requests.jsonl` captures only the early/restarted Worker sessions and must not be used as a complete journey count.

An early shared-transport implementation (a fixed 150 ms dispatch interval) passed mobile sharing twice and desktop sharing once, with maximum owner fixed-minute counts 346, 306 and 278; reader counts 104, 85 and 96. That intermediate implementation exceeded the unchanged 240-second extended edit-matrix deadline. It was replaced with the bounded burst scheduler described above, which avoids imposing delays on light sequences. These intermediate measurements and the timeout are retained as actual results, not presented as final-candidate checks.


## Scope and retained proof

This is a harness and test-specification change. Product limiter code, workflow shape, journey registrations, assertion inventories, deadlines, CONTRACT.md and RELEASE.json remain unchanged. No clause is promoted: full-target counts remain 58 done / 239 partial / 41 missing (338 total), including Core 58 / 239 / 35 and Agent surface 0 / 0 / 6. SHARE-002 remains partial. Product journey registrations and partitions are unchanged. The existing test specification records 212 expanded / 192 ordinary journey cases, below its cap of 200. The three new supporting transport/budget regressions execute in the existing reachability command, whose local test count rises from 1 to 4; they do not add product journey registrations.

The final candidate's focused local checks pass: reachability plus transport/budget regressions 4/4, UI state 2/2, release-source 2/2, and extended edit authority 1/1 at 1440 (207.59 seconds inside the unchanged 240-second deadline). The earlier interrupted final-core attempt has no completed receipt and is not counted as a pass; its partial request file is retained and labeled incomplete. Native responsive sharing proof and exact-SHA CI custody will be added below from actual completed runs.


## Final merged responsive results

The final bounded-burst harness passed all three local merged-shape proofs, with zero failures, skips or exhausted-limit refusals: mobile 390 repeat 1 in 135.64 seconds, mobile 390 repeat 2 in 131.91 seconds, and desktop 1440 in 142.06 seconds. The native product has no lowered-limit seam, so these are repeated runs at its actual 600/60-second limit. Browser screenshots and accessibility receipts for the Share invite screen at both widths are included.

| Run | Owner requests | Owner max fixed minute | Owner max rolling minute | Reader requests | Reader max fixed minute | Reader max rolling minute |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Baseline merge, 390 | 815 | 379 | 416 | 159 | 94 | 118 |
| Final merge, 390 repeat 1 | 803 | 396 | 539 | 149 | 124 | 129 |
| Final merge, 390 repeat 2 | 803 | 500 | 559 | 150 | 128 | 130 |
| Final merge, 1440 | 804 | 500 | 532 | 150 | 107 | 130 |

Fixed-window peaks depend on the wall-clock minute boundary; the burst scheduler deliberately permits light traffic immediately, so it does not claim every observed peak decreased. It supplies a deterministic probe bound that the old inventory-only reservation lacked. The worst observed final fixed-minute margin was 100 owner requests and 472 reader requests; the more conservative worst rolling-minute margin was 41 owner requests and 470 reader requests. Each fixture's later member made 15 requests, at most 15 in a fixed minute. Fixed-minute totals aggregate every address used by each actor; the separate `max_limiter_key_window` field records the actual product counter per address/scope/window. Thus these margins do not depend on splitting an actor across addresses. The queues and budgets are tested with a fake clock; actual native Worker counts are measured separately above. No temporary measurement source is staged.

The product branch is based directly on main 95a0372f; it contains only the common harness transport/budget, context identity propagation, transport/budget regressions, the corresponding test specification, and sources.lock.json. The f212 decisions implementation and local merge commit remain unpublished. Integration synchronization, contract-document consistency and source-lock consistency checks pass. Harness hashes match the code used by the completed merged proofs.


## Product publication and local admission

Product branch: `cloud/fv-slate-timeout-6`.
Product commit: `f9aa1cb913ef9031ab9dde92555871def222c938`.
The guarded product push succeeded on its first attempt; only this product commit was pushed, without the local f212 merge. Its sole parent is main `95a0372f6692b95607cedc7d1f9a0440dc9d3c38`. Every candidate author/committer and full commit message was inspected; both identities are Run Edit Run fleet <fleet@runeditrun.com>, with no co-author trailers. The checkout is clean. No PR was requested or required by this repository's branch landing workflow, and none was opened.

Local `npx -y @runeditrun/rer build`, `npx -y @runeditrun/rer verify`, `rer describe`, and `node scripts/publish-check.mjs` pass. Verify includes type checking, Base adoption and source/contract checks, emitted-artifact boundaries and hosted hydration (10 pages, 99 loads). The source/package publication-input check passes; the Mac's publication scan, independent acceptance and landing remain external duties. The final build contains no temporary limiter measurements. The outer cloud shell uses Node 24.19.0 with pnpm 10.12.4; rer selects the project's pinned Node 22.20.0 for its own checks/build. Exact-SHA hosted Verify uses the repository's existing Node 22.20.0 workflow.


## Complete product mobile caller

After the clean product build and push, the original `real core-wiki and touch-member journeys at 390px` caller passed in **683.63 seconds**, inside its unchanged 900-second deadline (whole Node invocation 701.09 seconds; 1 pass, 0 failed, 0 skipped). This runs on main plus the committed harness fix, and exercises the earlier native export/restore, writing, touch operations and two-author comments before all four sharing levels and their comments snapshots. Details, Search/Inbox/tasks/reviews, revision histories, automations, record parity, templates, archive/restore and version deletion also complete. No assertion, registration, deadline or product limit was changed. This completed receipt supersedes the earlier interrupted attempt; the interrupted attempt remains explicitly incomplete and is never counted as a pass.

All required local touched checks are green. The completed exact-SHA hosted Verify result is recorded below.


## Exact-SHA hosted Verify and terminal custody

[Verify Slate run 42531034834](https://github.com/just-every/run-slate/actions/runs/42531034834) completed **success** on product commit `f9aa1cb913ef9031ab9dde92555871def222c938`, observed at 2026-11-08T23:06:32Z. This is the pushed candidate's full workflow success, not a contract-view exception or another SHA. One watcher made seven REST reads, all separated by more than 300 seconds; zero reruns, no workflow/test skips introduced, and no failed-job archive reads were needed. The ten-call budget was respected.

Product custody is **READY** for `cloud/fv-slate-timeout-6` at `f9aa1cb913ef9031ab9dde92555871def222c938`. No task blocker remains. No PR was created; no main/default branch was pushed or fast-forwarded. The fleet's independent publication scan, acceptance checks and landing remain its duties. No contract statuses or counts changed (58 done / 239 partial / 41 missing before and after). The complete actual packet is published separately to `refs/heads/evidence/fv-slate-timeout-6`; its immutable head is identified by the terminal EVIDENCE line and is not a product acceptance or landing signal.

Relay to fv/sd: the source-supported cause is (b), incomplete aggregate pacing of the owner's own bucket. f212 does not add a comments transport bypass, and current main has no actor-IP seam to bypass. The former local inventory wrapper omitted other helper and browser traffic. The shared API queue and actor identity seam now cover the journey's diagnostic requests; bounded probes plus measured native margin leave the product limiter unchanged. The baseline 429 was not reproduced on this cloud VM; m1 and its separate reported 429 storms were unavailable and are not claimed fixed by these cloud receipts.
