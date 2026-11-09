# fv-slate-outline-1 results

Product: just-every/run-slate, branch cloud/fv-slate-outline-1, commit 2bf63ae0f4a2da36656f9c0d00d384ce69ff78b0. The guarded product push succeeded on its first attempt. No PR was created; the lane owns landing. Nothing was pushed to main. Evidence publication is separate from product acceptance and landing.

## Cause and change

Evidence supports **(b), an existing journey completion race under load**. The hosted failure is not an outline assertion: after the outline finishes, settingsJourney calls STAT-001's statusVocabularyJourney. Its retirement save starts a native POST /api/status followed by a vocabulary GET before ActionDialog closes. The old test starts a five-second disappearance assertion as soon as click() returns. It can therefore fail while a genuine successful user action is still pending.

The controlled experiment held the actual retirement response for six seconds after the real Worker committed it with HTTP 200. The original journey failed at exactly the hosted assertion and call site: Edit status expected count 0, received 1, timeout 5000ms. The changed journey passed the same experiment in both verification-only and open-vocabulary profiles, retaining page/history, authority and explicit bulk assertions. The delay is diagnostic only and is absent from the product branch.

The product change adds four journey lines: arm the actual save response wait before clicking, require HTTP 200, and allow the resulting native reads to settle before the existing visible dialog-closure assertion. Its five-second assertion and whole-registration deadlines are unchanged. No response is retried; no limit, registration, shard or workflow changes. The source lock and the exact journey specification were updated.

The status journey and relevant status/dialog/browser transport source are unchanged between 95a0372f and d2e67e44. Native browser traffic does not enter journey-api's helper queue, and all snapshot reads have been awaited before this save. There is no evidence for prioritizing this interaction inside the probe queue. The rebuilt candidate application output SHA-256 is byte-identical to main's original output: f58523f2f95b0cc74a181f9b02204c5635fc7aa9558c21d8dffd246fe23db0e9. No product regression is established.

The natural hosted five-second retirement failure did not occur in the ordinary comparison samples recorded; their later whole-registration timeouts are distinct failures. Classification (b) rests on the unchanged pre-harness code path and controlled real-response reproduction, not a claim of measured latency on the historical hosted request.

Limitation: the retained hosted archive extract identifies the assertion and retirement call, but does not establish the failing request's exact transport latency. The controlled experiment proves the existing completion-boundary flaw; it does not claim to recreate every hosted scheduling condition. The serial original-main, parent and 95a0372f repeats also hit the unchanged whole-registration deadline later in access coverage, after both status profiles passed. This broader timing fragility predates the current wait change. The first overlapping comparison batch overloaded the VM's four-CPU quota and is explicitly separated below. Its main, parent and valid 95a runs passed both status profiles, then timed out later in unrelated theme coverage. The unpaced overlapping run failed earlier in shortcut geometry and is inconclusive for status. These are not counted as successful full registrations or product regressions. See source-analysis.md and every retained log.

## Plan and validation

The complete plan is in PLAN.md. Published log copies normalize checkout-root paths and redact injected credentials if present; result counts, failures, timestamps and assertions are retained, with original and published log hashes in the receipt. Work followed source and hosted-log inspection, revision and pacing comparisons, the controlled real-response regression, the minimal one-clause journey fix, contract and source-lock checks, the guarded product push, exact-SHA Verify observation and separate evidence transport. All experiments ran in the dedicated Linux cloud VM; no m1 measurement is claimed. The brief's m1 429 storms remain historical context. The comments lane was read at 0b55774db7e7454174c6d7474ba46b4cf55f820f and its files were untouched.

Local contract regeneration wrote zero changed views, and its check passed. ACCEPTANCE.md and docs/CLAIMS.md were restored whole from origin/main and are absent from the commit. Integration sync, JavaScript syntax, regenerated pnpm source:lock, pnpm source:check and staged diff checks passed. See local-checks.json. The isolated candidate full registration passed in 599269.219239 ms against its unchanged 600000 ms deadline (730.78 ms margin on this VM). Full outputs and experiment hashes are recorded in experiment-receipt.json and the selected logs; candidate artifact provenance is in candidate-build-source.json.

Before/after clause counts: 59 done / 238 partial / 41 missing / 338 total in both. Published: 43 done / 183 partial / 1 missing / 227 total. Target and push further: 16 done / 55 partial / 40 missing / 111 total. STAT-001 remains done; no clause is promoted, demoted or amended. PAGE-010 and AUTO-001 are unchanged. Permanent test registrations and CI shape are unchanged.

| Run | Revision / mode | Result | Test seconds | STAT-001 profiles passed |
| --- | --- | --- | --- | --- |
| main-overlap | d2e67e44; original; overlapping batch | 0 pass, 0 fail, 1 cancelled, 0 skipped | 600.01 | verification-only, open-vocabulary |
| parent-overlap | 70a1ca37; original; overlapping batch | 0 pass, 0 fail, 1 cancelled, 0 skipped | 600.01 | verification-only, open-vocabulary |
| 95a-invalid-setup | 95a0372f; invalid; began before build receipt | 0 pass, 1 fail, 0 cancelled, 0 skipped | 3.64 | none recorded |
| 95a-overlap | 95a0372f; original; overlapping batch | 0 pass, 0 fail, 1 cancelled, 0 skipped | 600.01 | verification-only, open-vocabulary |
| unpaced-overlap | d2e67e44; probe refill 0.001ms; overlapping batch | 0 pass, 1 fail, 0 cancelled, 0 skipped | 253.54 | none recorded |
| delay-before | d2e67e44; original status journey; helper refill 0.001ms; real retirement response held 6000ms | 0 pass, 1 fail, 0 cancelled, 0 skipped | 241.45 | none recorded |
| delay-after | d2e67e44 + candidate journey patch; changed status journey; helper refill 0.001ms; real retirement response held 6000ms | 1 pass, 0 fail, 0 cancelled, 0 skipped | 175.66 | verification-only, open-vocabulary |
| candidate-full | 2bf63ae0; candidate; isolated full registration | 1 pass, 0 fail, 0 cancelled, 0 skipped | 599.27 | verification-only, open-vocabulary |
| main-original-repeat | d2e67e44; original; serial full registration | 0 pass, 0 fail, 1 cancelled, 0 skipped | 600.0 | verification-only, open-vocabulary |
| parent-repeat | 70a1ca37; original; serial full registration | 0 pass, 0 fail, 1 cancelled, 0 skipped | 600.0 | verification-only, open-vocabulary |
| 95a-repeat | 95a0372f; original; serial full registration | 0 pass, 0 fail, 1 cancelled, 0 skipped | 600.0 | verification-only, open-vocabulary |
| unpaced-repeat | d2e67e44; probe refill 0.001ms; serial full registration | 1 pass, 0 fail, 0 cancelled, 0 skipped | 599.76 | verification-only, open-vocabulary |

Exact-SHA Verify: run 42551871955, completed / success, head 2bf63ae0f4a2da36656f9c0d00d384ce69ff78b0. URL: https://github.com/just-every/run-slate/actions/runs/42551871955. The single watcher uses REST and waits at least 300 seconds between observations; all GitHub calls, including the historical failed-job archive read, are in github-calls.json. No failed-job rerun has been requested.

Candidate browser proof: [1440 dialog](candidate-status-1440-open.png), [1440 saved](candidate-status-1440-saved.png), [390 dialog](candidate-status-390-open.png), [390 saved](candidate-status-390-saved.png). Native response and closure observations are in browser-proof-receipt.json.

Public branch custody does not run the fleet publication scan or land main. The fleet reruns its independent gates. This packet contains no keys, environment dumps or held-out gate material. No report or evidence files were committed to the product branch.
