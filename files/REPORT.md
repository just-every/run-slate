# sd-slate-c-f195 result

BLOCK-012 remains PARTIAL → PARTIAL. The selected Word export-layout duty is locally qualified for supported one-level 2–5-column paragraph and heading sections. Native PDF layout, all other unqualified column content and export cases, complete PORT-007 coverage and the existing nested-column refusal remain explicitly in the Gap. No clause is released and no DONE count is claimed.

Product branch: `cloud/sd-slate-c-f195`.
Candidate: `ac34935544ae22a8a9c9204883f7c48754d4a70b`.
Current main: `bc567c9b6f6b25c98cb6fa05b9ab0fe37628a547`; remote branch custody was checked at this exact candidate.
Predecessor `03e7b8a3f2ebace8330a11b03ce868026efdecda` was replayed onto fresh full-history main as `8b5e1947f85d8e1680b3fe2d6e28251f3e1cec76` and immediately pushed with a skip-CI save message. The candidate adds the physical pagination proof. Main was fetched and merged before the candidate; it was already current. No published history was rewritten, no default branch was changed, and no PR was required or opened.

Counts remain 57 DONE, 240 PARTIAL and 41 MISSING across 338 Status rows. Expanded registrations remain 207, with 203 call sites and no unresolved loops, before and after. The existing test-budget metadata says 205; this round retains the actual main inventory and adds no registration. All 698 parent table lines and all 338 Status ids survive both new commits. No acceptance sentence, incumbent fixture duty, existing assertion or unrelated judgment changed.

## Implementation and proof

`src/core/features/workspace-export/docx-layout.ts:9` emits fixed-width borderless Word tables with 2–5 equal cells, top alignment and splittable rows. `src/core/features/workspace-export/docx.ts:51` uses this layout without changing the export's reader checks, comments, escaping or media handling. Ordinary following blocks return to the page width. A long first column never flows into the next column.

The unchanged registration in `tests/e2e/editor/tables.test.ts:11` invokes `tests/e2e/editor/columns-case.ts:73`. It decodes actual HTTP export bytes and checks table dimensions, permitted row continuation, every heading and text node, and reading order. All original HTML and Markdown round trips, Notion and Confluence layout import, nested refusal, copies, comments, revisions, public rendering and current reader-access assertions remain. The complete existing `tests/e2e/imports/word-export.test.ts` also passes, preserving DONE PORT-010 duties including unreadable descendants, media, comments and concurrent authority changes.

The existing `tests/qualification/ui-convergence/journeys.test.mjs:96` still calls `columnsJourney`, which now calls `wordColumnsJourney`; no Verify registration or workflow changed. The helper in `tests/qualification/ui-convergence/word-columns-journey.mjs:18` opens the real Export page dialog, selects Word, excludes comments and reads back a successful native download at 1440 and 390. At 1440 it independently renders those Word bytes, checks every cell's exact text, all heading levels, wrapping, side-by-side placement, top alignment and full-width following paragraphs. `tests/helpers/word-columns-pagination.mjs:9` additionally reads the printed Word rendering's physical pages, partitions text by section and column coordinates, and checks every non-whitespace character in order, no spill into another column, no printed truncation or duplication, continuation across pages and following blocks below all column content. Whitespace is checked in the decoded Word and DOM stages; pagination tolerates wrapping.

The candidate fixture has four sections, fourteen populated cells, 155 checkpoint lines and four ordinary following paragraphs. The browser rendering prints to 5 pages; its first column continues on pages [1, 2, 3]. LibreOffice independently opens the same downloaded Word bytes and renders 7 pages; the same committed pagination assertion passes, with the first column continuing on pages [1, 2, 3, 4]. This is Word rendering proof, not a claim about Slate's native PDF export or a Microsoft Word install.

## Exact-candidate local checks

Node 22.20.0, pnpm 10.12.4 and headless Chromium at `/usr/bin/chromium`, with no sandbox, were used. All final commands completed; the browser and native Workers started by the journeys were closed by their existing harnesses.

- Exact candidate build: exit 0; committed head, tree and output hashes are in `build-source.json`.
- Focused Workers command: `pnpm exec vitest run tests/e2e/editor/tables.test.ts tests/e2e/imports/word-export.test.ts`; two files, two tests passed; exit 0.
- Typecheck and `rer check --profile first-party`: exit 0.
- Candidate browser wrapper at both required widths: exit 0. It imports `withWorkspace` and `setupWorkspace`, then `beginTouchJourney` and the committed `columnsJourney`; a finally block closes the touch context. Command: `cloud_run perl -e 'alarm 1200; exec @ARGV' -- node /tmp/slate-columns-proof.mjs`. The helper source is included as `browser-wrapper.mjs` in this packet, with no new registration in the product.
- LibreOffice conversion and the committed pagination reader: exit 0; actual exported files and geometry receipts are included.
- Generated documents: write and check exit 0; restored whole from main afterward. Neither generated view was committed.
- Source lock regeneration and `pnpm source:check`: exit 0; integration identities match. No migration was added or edited, so no migration-ledger check applies.
- Added-text email scan: 0 matches. No original assertion was removed, narrowed or moved behind a condition. The new functional geometry check runs at 1440; the existing phone layout proof and native phone download remain.

MECHANICAL lock=node scripts/edition-authoring/cli.mjs lock then pnpm source:check exit=0; views=node src/base/runtime/contract-docs.mjs write then check, restore from origin/main exit=0; ledger=none exit=0.

## Public-door probes

PROBE BLOCK-012 Word structure: native POST to `/api/exports/readable` with the populated 2–5-column page and format docx -> 200, four decoded Word tables with fourteen top-aligned cells, exact content and retained reading order.

PROBE BLOCK-012 Word layout: actual downloaded document -> independent OOXML rendering -> side-by-side cells, all long checkpoint lines wrap inside their own cells, unequal heights start together and following ordinary blocks regain full page width.

PROBE BLOCK-012 Word boundary: printed downloaded Word rendering -> five physical pages, every cell's text in its original column and order, first column continues over three pages, following paragraphs remain after the whole section. Independent LibreOffice output -> seven physical pages with the same passing assertions.

PROBE BLOCK-012 native download: actual Export page dialog at 1440 and 390 -> Word selected, comments excluded, HTTP 200 and a readable downloaded docx at both widths. Existing native drag, touch drag, persistence, phone stacking, overflow and accessibility proof also passes at both widths.

## Verify and guarded landing

Exact candidate Verify Slate push run [42213005907](https://github.com/just-every/run-slate/actions/runs/42213005907) completed with conclusion failure. App job 127876071189 failed only at `node src/base/runtime/contract-docs.mjs check`: `ACCEPTANCE.md: generated content differs; run contract-docs write.` Aggregate job 127876291586 failed because that app result was failure and its dependents were skipped. There is no passing CI test-shard claim. Logs were read once per failed job through `gh run view --log-failed`; no dispatch, rerun or repair was attempted. This is exactly the generated-view exception permitting READY in this brief. Seven GitHub command calls were used.

Main's exact recorded Verify 42183473801 and Run site 42183473597 are successful at `bc567c9b6f6b25c98cb6fa05b9ab0fe37628a547`. The candidate remains branch-only. Full-history publication scan, generated-view landing commit, full exact-SHA green Verify, main equality and Run site are guarded-lander duties. Cloud scan result: commit `ac34935544ae22a8a9c9204883f7c48754d4a70b`, complete=unestablished, historyScanned=unestablished, findings=unestablished; no scan result is invented.

## Rider review and boundaries

1. Selected Word outcomes pass the named local public-door journeys. Complete BLOCK-012 remains partial because its broader Gap is real.
2. Populated downloaded data, exact decoded content, fourteen rendered cells and physical-page readback pass; no empty-list or title-only proof.
3. Existing push Verify registrations load the helpers, but this run's shards were skipped behind the expected generator failure; actual CI journey execution is not claimed.
4. Build and final local runs name `ac34935544ae22a8a9c9204883f7c48754d4a70b`. Candidate Word bytes, both screenshots and both pagination receipts are retained.
5. Existing receiving requirement names PORT-007, and PORT-010 cites BASE-DATA-001. No new inheritance is asserted.
6. Evidence and the honest partial Gap were updated; local generator write and check pass, then generated views were restored for the lander. No DONE stamp is claimed.
7. No acceptance point changed; all parent Status rows retained.
8. Existing Word authority and concurrent-change regression passes; no new authority, erasure or replay door was introduced.
9. No provider, Microsoft Word, live device, native PDF or broader content qualification is claimed.
10. No custody or policy default was adopted.
11. Guarded landing, complete scan and candidate Run site remain pending. Counts are unchanged.

The only plan row changed is BLOCK-012's Word evidence and Gap description. NAV-006, SHARE-002, ADMIN-007, shared company-policy prerequisites and all other judgments remain untouched. No product blocker or test failure was observed in the selected duty. The omitted native PDF and wider cases remain unfinished work and are not presented as an external account dependency.

Recovery bundle: `/home/agent/rer-consolidation/work/sd-slate-c-f195/product-final.bundle`; verified SHA-256 `4cd279aa82ac5c0dd1559798465712ac28d13baff334660545a903d5a4b9434a`. Product and evidence custody are separate. The original clone is eligible for deletion only after this packet is successfully transferred.
