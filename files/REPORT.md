# Slate DEC-006 standalone registration — sd-slate-c-f212-fix3

**READY under the brief's generated-view-only exemption.** Product branch **cloud/sd-slate-c-f212-fix3** is pushed at **a570985d38a47cb95075fb6e530b2f7b669e8bdd**. Both standalone DEC-006 registrations and full local app verification passed. Hosted Verify **42609007374** actually concluded **failure**, solely because ACCEPTANCE.md intentionally remains main's generated view. No landing or whole-clause acceptance is claimed. Evidence publication is a separate report-only ref.

## Plan and starting point

PLAN.md contains the complete plan. A fresh full-history clone of just-every/run-slate reported `false` for shallow status. Fetching fix2 and checking out its head printed `0eaa43c302904eb27fece856ad28c2e9ea48b92c`, exactly the required value. The new branch starts there. Fresh origin/main was `0b55774db7e7454174c6d7474ba46b4cf55f820f`; merging it reported `Already up to date`, because fix2 already includes it. No published history was rewritten.

## Changes and timing rationale

The core-wiki/touch-member registrations again have main's exact deadlines: 780000 ms at 390 and 720000 ms at 1440. Their DEC-006 block is removed from that enclosing journey and registered separately at both widths, with its unchanged `withWorkspace`, `setupWorkspace` and complete `decisionEditJourney`. Appending the new registrations leaves all existing ordinals unchanged. No assertion, old test, profile, refusal, source transport, snapshot queue, pacing or product limit changed in this continuation. The core owner's `ownerPeak <= 500` assertion remains on the core journey; DEC-006 retains its own per-actor <=500 assertions and reported peaks.

Each new registration gets 420000 ms. This is a new test's own budget, below both main journey deadlines; no existing timeout is raised. Actual fix2 evidence logs show complete native registrations (including setup) took 231592–326957 ms over three pairs. The chosen budget adds 93043 ms (28.5%) to that observed maximum. A budget below the former 240000 ms guard is not supported by those measurements. prior-dec006-durations.json names the source evidence head and per-run durations.

The seed has **196 -> 198 ordinary cases**, within its cap of 200 (main: 195). This uses the repository's documented conservative convention: all expanded cases minus the same 20 release-wall cases under `tests/flagship/release-clauses/`. An initial diagnostic that excluded all 21 `contract()` call sites gave 197; the reported final count instead follows the existing 20-case exclusion. The complete inventory including that clause harness is 216 -> 218 (main: 215). The touched browser file has 34 -> 36 ordinary cases. registration-counts.json records every name and deadline against main, fix2 and the candidate. The full seed inventory and the separate ordinary count are also retained to avoid confusing clause-harness registrations with ordinary cases.

## Contract and mechanical checks

DEC-006 remains main's **partial** judgment. All 338 status rows remain unchanged: **59 done / 238 partial / 41 missing -> 59 done / 238 partial / 41 missing**. No clause is promoted and no unrelated judgment is changed. The inherited DEC-006 requirement clarification remains; this continuation changes its test registration and exact test specification only.

MECHANICAL lock=`pnpm source:lock` exit=0; views=`node src/base/runtime/contract-docs.mjs write` exit=0 and `node src/base/runtime/contract-docs.mjs check` exit=0. Both generated views were restored whole using `git checkout origin/main -- ACCEPTANCE.md docs/CLAIMS.md`. The subsequent view check exits 1 naming only ACCEPTANCE.md, as expected from the retained candidate requirement clarification. `pnpm integration:sync` and `pnpm source:check` exit 0. Lock regeneration happened last after intended source was staged. Neither generated view is included in the product changes. mechanical-steps.json retains the actual ordered commands, outputs and exit codes.

## Local checks

- Native DEC-006: **2/2 passed**, once per width, using the actual new registrations. Complete registration durations: **266749.582 ms at 390; 194090.678 ms at 1440**, each below 420000 ms. Setup/edit phases were 72074/134199 ms at 390 and 61649/124999 ms at 1440; remaining time is workspace startup, persisted checkpoints and cleanup. Final owner peaks **120/min at 390; 113/min at 1440** (201 total each); reader peaks **293/min; 246/min** (396 total each). All retain the <=500 margin and native 600 limit. The phone's complete 266.75-second duration confirms that a sub-240-second registration budget is unsuitable here.
- Transport and sharding: 7/7 passed. The real fan-out queue, actor switching, byte-preserving binary paths, offline refusal and one unretried 429 remain covered.
- Typecheck: passed.
- First-party command contract: passed.
- Release-source: 2/2 passed.
- Source publication input scan: passed.
- `rer describe`: passed.
- `npx -y @runeditrun/rer setup --owner-email fleet@runeditrun.com --non-interactive`: passed after clearing a stale local lock whose recorded process was proven to be a zombie. A setup retry exited 4 while the stale lock existed; its successful retry exits 0. Actual setup receipts are retained without private local sign-in links.
- `npx -y @runeditrun/rer build`: passed.

Native browser and long-running rer commands use cloud_run, Node 22.20.0, pnpm 10.12.4 and `/usr/bin/chromium` with `--no-sandbox`. No provider or deployment operation runs. The known unrelated full-phone shortcut and transfer-job sandbox failures are not pursued under this brief; hosted Verify remains their judge.

## Proof provenance and publication

The native-tested staged tree is recorded in tested-tree.json. Build provenance initially names inherited fix2 HEAD with the current source and lock digests; the final product commit must have exactly the recorded tested tree. Complete native receipts, measured actor counts and decision screen captures are retained separately from product source. No raw environment dump, credential file or raw workspace network capture is selected for publication.

Product branch `cloud/sd-slate-c-f212-fix3` was pushed once, with no skip-ci marker, at **a570985d38a47cb95075fb6e530b2f7b669e8bdd**. Its tree `0c732667896ee912f1a59b4f24b4a654fcadbf7f` equals the native-tested staged tree exactly. The commit changes only journeys.test.mjs, its exact CLI journey specification and sources.lock.json. The worktree is clean. Fleet author/committer identity and every candidate commit, including side parents and trailers, passed inspection; the push guard succeeded on attempt 1. No force push, main/default-branch write, PR, deployment or landing occurred. Exact-SHA CI and evidence/cleanup outcomes follow after actual completion.


PROBE DEC-006: native proposal controls and authenticated HTTP at 390 and 1440 -> all eight fields keep exact durable revisions; unchanged writes are no-ops; stale captures return 409, view-only writes return 404, accepted edits return 409; histories, actor/time attribution and underlying blocks remain asserted. Native receipts contain 13 operation receipts, 10 retained snapshots and 10 refusal outcomes per width. Four decision states at each width have responsive screenshots plus accessibility/geometry metadata.

TIMEOUT-GUARD: raised pre-existing timeout grep output: **(empty)**. The exact `git diff origin/main HEAD -- tests | grep -n timeout` output is retained in timeout-guard.log: one new 420000 ms registration (expanded at both widths), plus unchanged COMM-002 timeout prose in diff context. No pre-existing registration deadline differs from main.

## Exact candidate app verification

The additional **`pnpm verify` passed** on the clean pushed commit in **433.139 seconds**. It covers first-party contracts, generated Worker types, Base copy equality, typecheck, application contracts, operation commands, production build, source lock/integration checks, emitted artifact boundaries, hosted admission and hydration (10 pages / 99 loads). It is recorded separately from the touched suites, and from the known generated-view check. The native proof uses `/usr/bin/chromium` with `--no-sandbox`. Rer's additional aggregate verification provisions its own hydration browser; the observed executable is recorded in verification-browser-mapping.json. No product file or assertion changes. Browser mapping is recorded in verification-browser-mapping.json.

source-stability.json reconciles the native proof with the final clean commit: source SHA-256 `7b4901ae0538d3a03ef88948f7a920e352c997b35341b6473dceb47de09e80e1`, lock SHA-256 `462f317cd834bc42200f0d0708eb4ffa063d49a81b752987e4fe770ff840eb3e` and emitted output SHA-256 `066753c4f8e0c9167b635e3df3d91df1822f3551fd707da5288e5274ad0605f4` all match the bytes used by the browser. The older commit/tree named in the original build record is retained honestly; no provenance file was rewritten to claim the build ran after the commit.

Exact-SHA hosted Verify: run **42609007374**, https://github.com/just-every/run-slate/actions/runs/42609007374, discovered in progress on `a570985d38a47cb95075fb6e530b2f7b669e8bdd`. Only one watcher is used, with run reads at least 300 seconds apart, including discovery. No other SHA's run can supply green evidence. The next permitted exact-SHA read at 11:31:39 UTC returned **completed/failure**. Failed-job metadata and the one-shot app log confirm the generated-view-only exemption; no actual hosted success is claimed.


The 11:36:41 UTC job metadata read confirms app job **129132289811** failed only `Run node src/base/runtime/contract-docs.mjs check`. Its actual app verification step was skipped. The plan succeeded. The aggregate job **129132520624** failed its `Require the plan and every expected job` guard; downstream test shards and contract job skipped because the app failed. The one-shot app log confirms the only substantive hosted failure: `ACCEPTANCE.md: generated content differs; run contract-docs write.` No hosted app/test success is claimed from skipped jobs. All job metadata names this candidate's exact SHA.


The final verification build record names the exact pushed commit and tested tree; its source and lock digests match the native proof. Native and final verification output identities also match exactly. `candidate-build-source.json` retains the actual post-commit build record.


## Terminal outcome and custody

**READY under the stated generated-view exemption**, with **no remaining product blocker**. The actual hosted conclusion is failure; it is not called a hosted success. The local `pnpm verify` succeeds on the exact pushed SHA. App job 129132289811's single failed-log read succeeded and names ACCEPTANCE.md only. The aggregate guard fails because the app failed, and downstream suites are skipped, not presented as passing. Four GitHub calls were used, all more than 300 seconds apart, including discovery and diagnostics. No failed archive request was retried.

Full product and test provenance is in product-receipt.json, product-push.log, source-stability.json, candidate-build-source.json, native-dec006.json/log, the per-width native receipts and screens, ci-receipt.json, and outcome.json. Complete command outputs are retained, with secret values/private local links removed. The explicit reviewed selection is publication-selection.json. This packet contains no raw workspace network report, credentials, environment dump, private held-out gate material or symlink. It is sent only to `refs/heads/evidence/sd-slate-c-f212-fix3`; the terminal EVIDENCE line supplies its exact transport head. Evidence transport alone does not establish READY, acceptance or landing.

Cleanup is the final operation after successful evidence custody: remove this task's product clone and node_modules. All test-owned browsers and live Worker/server processes have already closed. The final terminal message confirms actual cleanup. The packet remains outside the clone under `$HOME/rer-consolidation/work/sd-slate-c-f212-fix3/packet/`.

POST lanes/sd/INBOX.md: sd-slate-c-f212-fix3 DEC-006 split into independent 390/1440 registrations; main core deadlines restored 780000/720000; native 2/2 and local verify green; owner peaks 120/113 per minute; ordinary cases 196->198 <=200; DEC-006 partial->partial, counts 59/238/41 unchanged; pushed a570985d38a47cb95075fb6e530b2f7b669e8bdd; Verify 42609007374 generated-ACCEPTANCE-only red, READY exemption; no landing claim.


## Terminal outcome and custody

**READY under the stated generated-view exemption**, with **no remaining product blocker**. The actual hosted conclusion is failure; it is not called a hosted success. The local `pnpm verify` succeeds on the exact pushed SHA. App job 129132289811's single failed-log read succeeded and names ACCEPTANCE.md only. The aggregate guard fails because the app failed, and downstream suites are skipped, not presented as passing. Four GitHub calls were used, all more than 300 seconds apart, including discovery and diagnostics. No failed archive request was retried.

Full product and test provenance is in product-receipt.json, product-push.log, source-stability.json, candidate-build-source.json, native-dec006.json/log, the per-width native receipts and screens, ci-receipt.json, and outcome.json. Complete command outputs are retained, with secret values/private local links removed. The explicit reviewed selection is publication-selection.json. This packet contains no raw workspace network report, credentials, environment dump, private held-out gate material or symlink. It is sent only to `refs/heads/evidence/sd-slate-c-f212-fix3`; the terminal EVIDENCE line supplies its exact transport head. Evidence transport alone does not establish READY, acceptance or landing.

Cleanup is the final operation after successful evidence custody: remove this task's product clone and node_modules. All test-owned browsers and live Worker/server processes have already closed. The final terminal message confirms actual cleanup. The packet remains outside the clone under `$HOME/rer-consolidation/work/sd-slate-c-f212-fix3/packet/`.

POST lanes/sd/INBOX.md: sd-slate-c-f212-fix3 DEC-006 split into independent 390/1440 registrations; main core deadlines restored 780000/720000; native 2/2 and local verify green; owner peaks 120/113 per minute; ordinary cases 196->198 <=200; DEC-006 partial->partial, counts 59/238/41 unchanged; pushed a570985d38a47cb95075fb6e530b2f7b669e8bdd; Verify 42609007374 generated-ACCEPTANCE-only red, READY exemption; no landing claim.
