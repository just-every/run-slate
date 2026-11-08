# Slate full-authority timeout repair — 8 November 2026

Scope: SHARE-002 supporting native ordinary-page proof only. Branch: `cloud/fv-slate-timeout-1`. No requirement or production behavior is amended; SHARE-002 remains partial.

## Measured cause

Current main at investigation was exactly `67b706484e5430012d9c154c1e14090ea1e49bc2`. `git rev-list --count 67b70648..origin/main` returned **0**. The requested bisect therefore has an empty interval: no intervening regression commit exists and no speculative per-commit builds were run.

[Main Verify 42416085031](https://github.com/just-every/run-slate/actions/runs/42416085031) reused a green push; its app and shards were skipped. The actual same-SHA execution behind it was [42413608321](https://github.com/just-every/run-slate/actions/runs/42413608321). Its full case passed in 237.18 seconds, only 2.82 seconds below the existing limit. The expanded matrix already existed in that passing source; earlier commits 5550cc6c, 77cc6772 and e1853d86 had isolated levels, overlapped canonical inventories, bounded activity reads and removed unused owner-page polling.

| Source / run | Runner | Full journey wall time | Result |
| --- | --- | ---: | --- |
| Main 67b70648, 42416085031 | Hosted Ubuntu | Not executed | Reused green push |
| Same SHA, 42413608321, 7 Nov | Hosted Ubuntu 24.04 | 237.18 s | Passed |
| f174 803f67a2, 42465080765 | Hosted Ubuntu 24.04 | 221.20 s | This case passed; the run failed elsewhere |
| f177 e3dad69c, 42477058708 attempt 2 | Hosted Ubuntu 24.04 | 240.00 s, censored | Timed out |
| Fresh main 67b70648, 42482646230 | Hosted Ubuntu 24.04 | 240.00 s, censored; native assertions finished at least 252.83 s after start | Timed out |
| Fresh main 67b70648, heavy-slot m1 | m1-runner, Node 22.20.0 | 196.67 s | Passed, 45 refusals |

Fresh hosted measurement: [job 128738270707](https://github.com/just-every/run-slate/actions/runs/42482646230/job/128738270707). It started the full case immediately after the preceding test at 13:05:01.480Z, timed out at 13:09:01.483Z, and emitted the final 45-refusal success probe at 13:09:14.313Z. The latter is a lower bound on real work completion, excluding remaining artifact writing and teardown; it is not a passing test duration. No measurement timeout override or retry wrapper was used.

Both the actual 7 Nov execution and fresh hosted measurement used Ubuntu image `20261101.360.1`, Node 22.20.0 and the same source/lock. The unchanged phone Settings journey rose from 211.58 to 241.39 seconds (+14.1%) while still passing its own deadline. This corroborates variable runner throughput across unrelated work. It does not establish host CPU contention specifically; hosted CPU load was not exposed by these logs.

| Full phase | 7 Nov same-SHA hosted | Fresh same-SHA hosted | Fresh same-SHA m1 |
| --- | ---: | ---: | ---: |
| Setup | 21.83 s | 25.09 s | 19.69 s |
| Page edits | 26.10 s | 27.81 s | 23.88 s |
| Lifecycle | 37.70 s | 44.09 s | 19.85 s |
| Archive | 19.68 s | 22.60 s | 12.78 s |
| Erasure | 8.99 s | 10.81 s | 4.84 s |
| Discussion | 29.67 s | 30.48 s | 27.68 s |

The cause is a broad diagnostic journey with essentially no deadline margin under variable runner throughput. Its full permission level performs many native edits, lifecycle transitions, archive/erasure trials, discussion and grant operations, complete paginated inventories, replay and revoked-capture checks. Inventory reads already overlap and retain necessary pacing below the unchanged 600-request production limit. Build and shared schema preparation occur outside the individual test timer; a slower build cannot cause this 240-second failure. Production activity performance could be improved separately, but there is no new main regression to repair here.

## Repair

Split only full authority into two fresh native installations:

- **Page changes:** display, ownership, body structure, locks, revision restoration, publication, scheduling, discard, archive, trash and erasure.
- **Discussion and sharing:** comments, replies, resolution, reactions, new-recipient grants, all level changes and revocation.

Both begin with the original populated page, metadata and title/body proof. Both retain complete canonical inventories, attributed receipts and exactly-once activity, every captured-operation replay, final current-session revocation, metadata-read refusals and an Access needed screen without prior content. Each measured case captured 19 operations; page changes made 26 refused requests and discussion/sharing made 27. Each responsive pair repeated these same counts. No assertion body was deleted, no test is skipped and there are no new retries or production-limit changes.

Both cases retain **240000 ms**, stay on existing partition 6 and run before the existing phone focus suite. The eight-shard workflow and speed-tests-ci PLAN.md Appendix A reuse/aggregate rules are unchanged. Edit/comment/view and both responsive selected core callers remain combined. The inventory adds one ordinary registration: **212 expanded / conservatively 192 ordinary**, excluding the same 20 release-wall cases, below the unchanged ordinary cap of 200.

## Targeted validation

| Split case | m1 at 1440 px | m1 at 390 px | Deadline |
| --- | ---: | ---: | ---: |
| Page changes | 118.51 s | 113.97 s | 240 s |
| Discussion and sharing | 103.84 s | 102.87 s | 240 s |

The maximum observed m1 times are 118.51 and 103.84 seconds, leaving 121.49 and 136.16 seconds of margin. These are small samples (one execution per case and width), not estimates of a population p95. The limit is unchanged. Final hosted split measurements and exact pushed-SHA Verify status are recorded in the PR description; its hosted sample and margin must be read with the same sample-size limitation.

Targeted command: `node --test --test-concurrency=1 --test-name-pattern='^native ordinary page full authority' tests/qualification/ui-convergence/journeys.test.mjs`. Candidate-only phone measurement invokes the same committed `withWorkspace`, `setupWorkspace` and `permissionLevelsJourney` bodies for sections `page` and `discussion` at 390×844; it adds no permanent phone registrations. Both cases and both widths passed. Source/release tests passed 2/2; shard-routing tests passed 3/3. Contract regeneration, integration sync, source lock/check, syntax and whitespace checks passed.

Baseline and candidate remote jobs ran sequentially through `.tools/heavy-slot.py`, at nice 15 with pinned runtimes. Baseline job: `20261108T125904988052Z-heavy-slot-bc57ac81`; candidate job: `20261108T130328802158Z-heavy-slot-d4d0a951` (logic commit 6fc2da4f; subsequent code change only labels the selected section in diagnostic output). Logs are retained under `/Users/zemaj/www/rer-consolidation/logs/remote/`. Both jobs exited 0 and removed their checkouts/servers. The builder inspected all **56** native screenshots, 28 at each width, including both revoked-access end states and the absent erased-page row. Captures, accessibility observations and retained inventories are preserved in `/Users/zemaj/www/rer-consolidation/evidence/fv-slate-timeout-1/fv-slate-timeout-1-ui.tar.gz`.
