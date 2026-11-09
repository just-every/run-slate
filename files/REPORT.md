# sd-slate-c-f212-fix1

The product candidate is pushed to `cloud/sd-slate-c-f212-fix1` at `2ea899a49ec26d7f91caf585e1c7937b37d6f329`. All three consecutive full journey runs pass at both widths. OWNER PEAK before: 564/min. OWNER PEAK after: 423/min (maximum over all six final runs), below the requested 500/min margin against the unchanged product limit of 600/min. No retry wrapper, timeout increase, deleted/skipped/weakened assertion, new clause judgment or landing claim.

Repository: just-every/run-slate. PR: none; the repository's instructions require no PR for this fleet branch. Input candidate `0cddbd258a74da2d45863b86a350ec03352faf89` was verified in a fresh full-history clone. Fresh main `0b55774db7e7454174c6d7474ba46b4cf55f820f` was merged, including its newer comment test fix. Main was fetched immediately before the product push and had not moved. All seven candidate commits, including side parents, passed the identity and complete-message/trailer audit; the new commit uses Run Edit Run fleet for author and committer and has no co-author trailer. Product push succeeded on attempt 1, without force and without skip-ci.

## Full plan and implementation

1. Initialize fleet identity, refresh the authorized launcher, install the decrypted-bundle Git helper/push guard and mandatory commit hook, and clone the declared repository with complete history. Verify input SHA and merge fresh main, retaining newer tests and clause judgments.
2. Measure first with counting-only instrumentation in the existing actor-aware transport and browser contexts. The unmodified-pacing full phone journey passed in 836.959s locally but reached 564 owner requests in a rolling minute; the separate decision matrix's reader reached 495/min. Fixed-minute alignment and runner speed explain why a local pass does not refute the supplied deterministic hosted 429.
3. Route every native JSON request in the new DEC-006 decision matrix through the harness's existing per-actor api() queue, together with its independent snapshots. Route the owner context during the actual overflowing sharing step through that same transport. Preserve native submitted JSON, genuine response status/body and Retry-After, and dispatch once. Keep unrelated older touch/second-person transport behavior. Unmount the unrelated owner page for selected sharing snapshots; retain all matrix inventories. The transport's identity assignment, serialization and token/refill implementation remain unchanged; its extension only measures requests. File/transfer and existing binary probes retain native byte/header handling and are counted separately.
4. Remove a redundant goto to an already-current proposal URL before its required reload. Every field, retained snapshot, actor/time, noop, authority and immutable-edit assertion remains. Add <=500/min owner and decision-actor assertions and a transport regression covering one in-flight request, cookie/address identity, genuine one-shot 429, binary bytes, offline behavior and page-route fallthrough.
5. Run both complete core/touch tests sequentially, three times each, with the original phone 900s and desktop 840s deadlines. Use pinned Node 22.20.0, Chromium /usr/bin/chromium and --no-sandbox. Each pair uses one Node worker, a 1900s hard command bound and the documented cloud_run subreaper; every browser and owned Worker closes. Run the complete profile suite, typecheck, first-party, source/release and transport checks. Capture the changed decision screens at 390 and 1440.
6. Generate and check contract views, restore main's generated views, sync integration, lock source last and check. Commit the verified tree, audit and push only the named branch, observe exact-SHA Verify with one bounded REST watcher, and publish this non-secret packet only through the evidence ref. The remaining fleet publication scan and landing belong to the Mac.

## Final native proof

| Repetition | Width | Seconds | Core owner/min | Core reader/min | DEC owner/min | DEC reader/min | Result |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | 390 | 889.050 | 399 | 478 | 135 | 388 | pass |
| 1 | 1440 | 732.271 | 387 | 294 | 131 | 388 | pass |
| 2 | 390 | 873.363 | 423 | 477 | 138 | 389 | pass |
| 2 | 1440 | 709.451 | 395 | 295 | 134 | 388 | pass |
| 3 | 390 | 883.519 | 399 | 445 | 135 | 388 | pass |
| 3 | 1440 | 719.791 | 393 | 312 | 132 | 388 | pass |

All six tests passed; each paired log contains two actual TAP passes with exit 0, not merely a successful launcher exit. `qualification-1.log` through `qualification-3.log` and six per-width measurement receipts retain the complete per-actor request-path counts. The first pair's exact tree `6aedf2a6a22af148bac75b81267a485ba2882767` equals the published commit tree; repetitions 2 and 3 and the final screenshot/decision receipts use the committed SHA. The committed artifact records source SHA-256 `d340aa14ace20cb770147d9bb37972fc3310a8e735b838dc8d3ba253cc6df109`, lock SHA-256 `b547d716983af684298d42a651d77a650db1880d8cf0172afcb37dbc66584898` and emitted output SHA-256 `d5e376b9cae276bbc98184b68af69d4d9bcffe8ca9d8dda84d30e573a14f399e`.

PROBE DEC-006: a core-wiki editor submits the native proposal form, changing question to “Which revised procedure?”, options to Second/Third, outcome to Third, rationale, owner, decided/review dates and exact evidence -> changed saves return 200 with exactly one revision/activity; previous content retains actor/time and reloads correctly. Pending and final unchanged submissions return 200 with unchanged revision and null activity. Captured stale input -> 409 REVISION_CONFLICT; view-only capture -> 404 NOT_FOUND; eight accepted-field changes -> 409 IMMUTABLE_DECISION with identical stored decision/history/activity. The appointed owner accepts through the native control, and underlying page blocks remain unchanged. Actual native request/receipt/snapshot/refusal files are retained for all six runs. The responsive proposal, history, view-only and accepted screens are captured once per width in the final packet; the first pair's proposal screens and the final pair's accepted-history screens were visually inspected at both widths for readable fields and no clipping.

## Checks and mechanical work

- `pnpm test:profile` under pinned Node 22.20.0: exit 0; all node suites and five Worker tests across two files passed.
- `pnpm typecheck`: exit 0.
- `npx -y @runeditrun/rer check --profile first-party`: exit 0.
- `node --test tests/qualification/ui-convergence/journey-api.test.mjs`: exit 0; four tests passed.
- Focused native write journey: exit 0 with original committed-save/activity, network-loss, explicit-retry and reload assertions.
- `pnpm test:release-source`: exit 0.
- `npx -y @runeditrun/rer setup --owner-email fleet@runeditrun.com --non-interactive`: exit 0; hooks reinstalled after dependency setup.
- `npx -y @runeditrun/rer build`: exit 0, including the committed-SHA build used by repetitions 2 and 3.
- MECHANICAL lock=`pnpm source:lock` exit=0; lock check=`pnpm source:check` exit=0; views=`node src/base/runtime/contract-docs.mjs write` then `node src/base/runtime/contract-docs.mjs check` exit=0. Generated views were restored whole from origin/main after that check, with no branch diff from main for ACCEPTANCE.md or docs/CLAIMS.md. No generated view was edited to obtain CI green.

## Exact-SHA Verify and custody

Run [42577008851](https://github.com/just-every/run-slate/actions/runs/42577008851) observed exact head `2ea899a49ec26d7f91caf585e1c7937b37d6f329` with actual conclusion `failure`. Qualification: **generated-view-only exemption**. The app's sole failed step is `node src/base/runtime/contract-docs.mjs check`, reporting only `ACCEPTANCE.md: generated content differs; run contract-docs write.` The aggregate verify job fails because app failed and its dependent jobs skipped. Actual failed-job logs and the REST/job receipt are included. This is the assignment's explicit generated-view-only READY exception; the Mac regenerates those views and reruns Verify before landing. It is not a claim that every job ran green or that the product landed. The watcher used 4/10 allowed GitHub calls, spaced at least 300 seconds, and read each failed job archive once through gh run view, with no direct blob retries.

Product custody is separate from report publication. Reports belong only to evidence/sd-slate-c-f212-fix1; publishing them changes no product checkout, head or index. Blockers: none under the supplied READY contract. Clause statuses/counts are unchanged from the input candidate: Done 60, Partial 237, Missing 41, Total 338. DEC-006's inherited DONE judgment is retained; this rate-budget repair raises no status. Main's 59/238 offset was already present in the supplied DEC-006 candidate.

## Diagnostic attempts excluded from qualification

The initial broad-routing prototype exposed page/context route handling conflicts in the existing save fixture. The final page route chain and offline behavior were verified before restarting proof. One full-routing desktop attempt passed at 368/min but its overlapping phone attempt exceeded the existing deadline (hard command exit 124); neither counts toward final repeated proof. Overlapping scoped attempts were stopped and excluded, and one empty launcher exit caused by simultaneous temporary reaper rewrites was rejected as no test execution. Final proof uses one sourced sequential command, unchanged deadlines and actual TAP validation. No assertion was deleted, skipped or weakened to address any of these diagnostics. The baseline harness driver was Node 24.19.0 with emitted Worker built by pinned Node 22; all final repetitions and final profile checks explicitly use pinned Node 22.20.0. Setup's private local sign-in output is excluded from public evidence.
