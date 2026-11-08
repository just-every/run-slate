# sd-slate-c-f205-fix1 report

Repaired the DEC-001 candidate's desktop journey by synchronizing the outcome assertion with the card's native refresh and selecting its outcome paragraph. No production behavior or clause status was changed by this repair.

## Product provenance and scope

- Repository: just-every/run-slate (the only declared write repository).
- Branch: `cloud/sd-slate-c-f205-fix1`.
- Product head: `d199ea3a5120f38b54a4e29cbecb9e7a20469cd1`.
- Published candidate parent: `20880dc2358c4259312f7ebf1263534d95bf290f`, verified before creating this branch.
- Merged main: `95a0372f6692b95607cedc7d1f9a0440dc9d3c38`.
- Clone: fresh `git clone --filter=blob:none`, full history, no depth. No rebase, force push, main push, PR, landing or deployment.
- The repair adds revision synchronization, an explicit paragraph locator, revised-outcome screen evidence and the refreshed native record to the existing decision-layer journey. All candidate product changes remain; every main test, clause judgment and ID map remains. Profile conflicts combine main's complete test with only the candidate's 45-line case; adjacent journey imports and specification paragraphs retain both parents.
- All product differences from main stay within the original 14-file candidate lease. `repair.diff` shows this run's targeted journey change relative to the published candidate.
- All six candidate commits, including side parents, were inspected for author, committer and full-message coauthor/trailer policy. Fleet identity and preserved hooks were used. The pre-push hook repeats the audit on Git push attempts.

## Plan and execution

The complete saved plan is PLAN.md. Execution used the fleet launcher and bundle-backed Git helper, repository instructions and cloud runtime dependency/browser guidance. The work proceeded through merge resolution, unchanged-assertion desktop reproduction, native latency diagnosis, targeted journey correction, desktop/phone and profile checks, contract generation, main-view restoration, last source-lock regeneration, publication audit, guarded product push and exact-SHA CI observation. Reports and receipts are transported separately through the evidence ref. No held-out material, provider credential, environment dump or symlink is selected for publication.

## Reproduction and cause

REPRO decision-layer desktop: the unmodified full 1440px registration passed naturally (162.164 s); a bounded supplementary probe delayed delivery of the genuine post-save GET by 6000 ms and reproduced the original 5000 ms visibility failure. No response content was mocked. The original assertion resolved 14 times to `<li>Second procedure</li>`, received hidden, and failed as reported. See repro-desktop.log, latency-repro.log, locator-diagnostic.json, repro-desktop.png and PROBE.md.

The native save had already committed outcome `Second procedure`. During the card's asynchronous reload, useResource retained the old card, whose visible paragraph still read `First procedure`. The first exact-text match was a hidden LI under `Options & supporting sources` with its details element closed. A later match was the visible edited textarea. This is a stale-read timing and selector interaction, not an off-screen control or a missing outcome in the native record. The original full run's passing result is reported separately from the controlled timing reproduction.

The repair registers the card's GET observation before saving, requires HTTP 200, checks that the returned revision equals the saved revision and its outcome equals `Second procedure`, then requires exactly one matching direct paragraph and checks visibility. The exact historical `First procedure` assertion also targets its paragraph. It retains the same assertion timeout, registrations and pre-existing journey deadline; no assertion was skipped, weakened or deleted. The committed journey has no artificial delay. The supplementary fixed-source latency probe completes the entire lifecycle under the same delayed delivery that fails the original assertion.

## Native public-door probe

PROBE DEC-001: default core-wiki `/app/pages/<fixture page>` → More → Add decision record; a non-owner editor enters a question, two options, outcome, rationale, appointed owner, decided/review dates and an exact page-revision citation → a readable layer above the unchanged page body. More → Open decision record → Choose the outcome → `Second procedure` and `Review selected the second procedure.` → the native committed revision is returned by the card refresh and its outcome is visibly rendered.

Creation, replay, second-layer refusal, edit, accept, review, removal and replacement retain complete page documents, exact old revisions, comments, grants and inbound/outbound endpoints. The old decision retains five history items; the removed layer leaves active lists; a replacement attaches; after revocation all captured current, removed, history, review and exact-revision doors and creation replay refuse access without state mutation.

- 1440px: page `01M6YKE9WQHQ5DWS0ZR0WJKYG6`, decision `01M6YKEPDWKBQW61HQBMX5QX2Q`; 15 native receipts, 8 complete snapshots, 9 refusal records, 5 retained history entries. Saved revision `01M6YKF8JGTXD0KEZMR9YY8YMF` equals the refreshed card's native revision `01M6YKF8JGTXD0KEZMR9YY8YMF`.
- 390px: page `01M6YKDCWWXZQGE1ZK854KV6H4`, decision `01M6YKDTJCDRDH38WEHQQ3BVQ9`; 15 native receipts, 8 complete snapshots, 9 refusal records, 5 retained history entries. Saved revision `01M6YKE9KZT3JRYB6Z8BCJ37R5` equals the refreshed card's native revision `01M6YKE9KZT3JRYB6Z8BCJ37R5`.

The two outcome PNGs show the changed screen once at 1440 and 390. Their accessibility receipts retain viewport geometry and all Axe violations; the journey passes its serious/critical bar. Local fixture proof is separate from provider acceptance and independent landing gates. The final browser runs use Node 22.20.0 and a fresh build of the committed product. build-provenance.json and final-build-verification.json match the exact product head/tree, every tracked source hash, the source lock hash and emitted bytes. The original reproduction and supplementary latency diagnostics were performed earlier on the VM Node 24 runtime. Exact-SHA hosted CI custody is recorded separately.

## Validation

Actual commands, exit codes, counts and timings are in checks.json and the selected terminal logs.

- Original natural desktop registration: passed, one test, no skipped cases.
- Original supplementary latency reproduction: expected failure at the unchanged outcome-visibility assertion.
- Fixed supplementary desktop latency probe: passed the complete lifecycle under a 6000 ms native response-delivery delay.
- Corrected full desktop and phone registrations: passed, one test per width, no skipped cases. Existing content-query assertions also ran.
- `pnpm test:profile`: Node profile test passed; both worker files and all five worker tests passed, including DEC-001 and main's DEC-004 case.
- `pnpm typecheck`: passed.
- `pnpm exec rer check --profile first-party`: passed.
- `pnpm cf-typegen:check`, `pnpm verify-base`, `pnpm check:contract`, `pnpm check:operation-commands`: passed.
- `pnpm test:release-source`: two tests passed.
- `cloud_run timeout ... npx -y @runeditrun/rer setup --owner-email fleet@runeditrun.com --non-interactive`: passed; local owner setup only, no hosted provider operation.
- `cloud_run timeout ... npx -y @runeditrun/rer build`: passed.
- `pnpm check:artifact` and `node scripts/publish-check.mjs`: passed. These prove emitted/source boundaries and publication inputs; they do not claim a hosted deployment or the Mac publication scan.

MECHANICAL lock=pnpm source:lock exit=0; views=node src/base/runtime/contract-docs.mjs write && node src/base/runtime/contract-docs.mjs check exit=0.

`pnpm integration:sync` and `pnpm source:check` also exit 0. Generated views were restored whole from origin/main before the source lock was regenerated last. The restored-view contract check exits 1 with `ACCEPTANCE.md: generated content differs; run contract-docs write.` That expected view drift is retained for the Mac lander. Neither generated view differs from origin/main in the product candidate.

## Counts and clause judgments

All 338 main status rows remain byte-for-byte identical. Before → after: Core 58 done / 239 partial / 35 missing / 332 total; Agent surface 0 done / 0 partial / 6 missing / 6 total; Full target 58 done / 239 partial / 41 missing / 338 total. DEC-001 remains PARTIAL → PARTIAL. No status is raised and no landing claim is made. The published candidate's DEC-001 requirement prose and evidence-registry description are retained without promoting its judgment. Other contract prose and the current main ID map are unchanged.

## Product publication and CI

Run 42528103360: completed/failure; exact SHA `d199ea3a5120f38b54a4e29cbecb9e7a20469cd1`; https://github.com/just-every/run-slate/actions/runs/42528103360

CI classification: generated-view-only READY exemption. See ci-receipt.json, ci-jobs.json and ci-failed-job.log when present. Exact-SHA product custody and evidence publication are distinct. The stated generated-view-only exemption may authorize READY while the displayed Verify conclusion remains failure; it is never reported as an all-green test run. The Mac lander regenerates the views and reruns Verify before landing. Independent gates rerun their own acceptance and publication checks.

PR: none; this repository's provided instructions use the named candidate branch for the fleet lander. Blockers: none.

The packet remains at `$HOME/rer-consolidation/work/sd-slate-c-f205-fix1/packet/`. Product push and evidence receipts identify the actual published heads. Following successful product/evidence transfer, this task's clone and its node_modules are removed as requested; the packet remains. No lanes INBOX or STATE file was read or written; the terminal POST line is for the fleet to deliver.
