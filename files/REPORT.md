# Slate Word columns — sd-slate-c-f190

Repository: just-every/run-slate. Product branch: cloud/sd-slate-c-f190.

## Plan and scope

1. Read BLOCK-012, PORT-007, PORT-010 and their existing Worker and native browser journeys.
2. Replace the Word export's flattening with fixed-width, borderless, top-aligned layout tables. Keep rows splittable and ordinary following blocks outside those tables.
3. Extend the existing table Worker registration and existing columns browser helper, without another registration. Cover one-level 2–5-column paragraph and heading sections, wrapping, independent heights, exact content and reading order. Retain the original import, HTML and Markdown, duplication, comment, revision, publication and access assertions.
4. Download actual Word bytes through the native Export page dialog at 1440 and 390. Render actual downloaded bytes with an independent OOXML renderer in the existing browser journey. Independently paginate the downloaded file with LibreOffice for the page-boundary probe.
5. Keep BLOCK-012 partial. Explicitly retain PDF layout, other unqualified column content and export cases, complete PORT-007, and all existing policy and external holds. Change no acceptance sentence.
6. Run touched tests, typecheck, first-party, generated-view write and check; restore generated views from main; synchronize integration and regenerate the source lock last.
7. Preserve and push the named branch, inspect candidate identities and trailers, discover exact-SHA Verify through REST, and publish this report with actual receipts only through the separate evidence ref. Leave scanning and landing to the fleet.

## Initial evidence

The existing exporter called layoutOrder and removed structural column blocks. Its Word assertion established only the three-column content order. Existing public native journeys already exercise three-column creation, dragging, phone stacking, persistence and access. Full Word side-by-side and rendered-content proof was absent.

Status before: BLOCK-012 partial. No DONE claim is planned for this deliberately bounded Word qualification.

## Final result

BLOCK-012 remains PARTIAL → PARTIAL. The planner-selected Word duty is closed for supported one-level 2–5-column paragraph and heading sections. PDF still flattens columns. Other unqualified Word column content and export cases, complete PORT-007, and nested columns remain in the Gap. Native Notion and Confluence import, HTML and Markdown, duplication, comments, revisions, public rendering and reader-access assertions remain intact. PORT-010 remains DONE and its complete existing Worker registration passed. No Slate clause is released; ADMIN-007, company-policy prerequisites, genuine incumbent fixture duties and live NAV-006 and SHARE-002 scopes are unchanged.

Product branch: cloud/sd-slate-c-f190.
Exact head: 03e7b8a3f2ebace8330a11b03ce868026efdecda.
Initial and final main: bc567c9b6f6b25c98cb6fa05b9ab0fe37628a547.
No PR was needed: a branch push starts Verify here.
Counts: 57 DONE, 240 PARTIAL, 41 MISSING, total 338 → unchanged.
Registrations: 207 → 207. All 698 parent table rows and all 338 Status rows remain.
Plan row changed in this report only: BLOCK-012's selected Word qualification is complete; its broader held remainder remains. The source Status row updates Evidence and Gap without changing status or acceptance text. No other plan row or clause changed.

The exporter now emits a borderless fixed-grid table per layout section, with top-aligned cells, equal usable widths and no fixed row height or no-wrap restriction. Rows stay splittable. Ordinary blocks remain outside the table. A separate empty paragraph terminates each cell and table, retaining valid Word structure and existing comment and bookmark handling. The existing ordered-content assertions remain byte-for-byte. No assertion was deleted, skipped, narrowed or moved behind another branch or width condition. New functional geometry runs only at 1440; native downloads and the original phone stacking proof run at both widths.

## Proof and exact candidate results

All final checks use Node 22.20.0 and pnpm 10.12.4. Initial development also passed on the VM's Node 24.19.0; final build, both Workers registrations, typecheck, first-party, browser and mechanical receipts are rebound to the pinned Node and exact pushed head. The focused browser runner invokes the existing setupWorkspace, beginTouchJourney and complete columnsJourney helpers, with both widths, using the built emitted Worker and native sessions. It adds no test registration. Full core-wiki registration beyond these touched helpers was not run locally.

- W1 native public door: ./tests/qualification/ui-convergence/word-columns-journey.mjs lines 14–45 creates the real corpus, opens More → Export page, selects Word, downloads and decodes the bytes at 1440 and 390.
- W2 logical structure and content: ./tests/e2e/editor/columns-case.ts lines 71–109, invoked by the existing ./tests/e2e/editor/tables.test.ts registration, checks 2–5 cells, exact cell text, all three heading styles, reading order, usable widths, top alignment and splitting without clipping constraints. Its original three-column order assertions remain at lines 52–53.
- W3 visible rendering: ./tests/qualification/ui-convergence/word-columns-journey.mjs lines 49–105 opens the actual downloaded Word bytes in docx-preview. It checks every cell's exact text, bold heading style, wrapping inside both horizontal and vertical cell bounds, side-by-side positions, equal top baselines, and following ordinary paragraphs below the entire table.
- W4 page boundary: the actual native download opens in LibreOffice Writer and renders to seven pages. PyMuPDF readback matches the complete expected word multiset and all 155 distinct checkpoint identifiers. The first left column continues at the same horizontal position across pages 1–4; the short right column stays beside it on page 1; ordinary content follows the long column. This is Word pagination proof, not qualification of Slate's separate PDF exporter. Actual Word bytes, rendered PDF, page images, geometry and the pagination receipt accompany this report.
- W5 retained behavior: both full touched Workers registrations pass: tables, columns and synced paragraphs; PORT-010 Word export, reader filtering, access-change refusal, XML escaping, no unsafe relationships, comments and re-import. The native columns helper retains its desktop drag, touch drag, count changes, phone stacking, persistence, overflow and accessibility assertions.

The initial independent-renderer test harness assumed headings became HTML heading elements and that all heading levels used a larger font. Inspection showed the library uses styled paragraphs, with level three bold at body size. Before the first product commit, the new harness was corrected to assert the actual rendered text and bold hierarchy; no incumbent assertion or product guard changed.

PROBE BLOCK-012 Word structure: POST /api/pages with the 2–5-column corpus, then POST /api/exports/readable → valid OOXML with ordered exact content, equal fixed grids and top-aligned splittable cells.
PROBE BLOCK-012 Word download: native Export page at 1440 and 390 → downloaded .docx with all four sections and every cell endpoint; rendered exact content and geometry passed at 1440.
PROBE BLOCK-012 Word boundary: downloaded .docx → LibreOffice Writer → seven-page PDF; all 155 checkpoints and the complete word inventory retained, long left cell continued across four pages, and following ordinary blocks began after it.

MECHANICAL lock=pnpm source:lock then pnpm source:check exit=0; views=node src/base/runtime/contract-docs.mjs write then check exit=0, generated files restored from origin/main; ledger=none exit=0. No migration changed. Generated views are absent from the product diff. The source lock is fresh and the final product checkout is clean.

## Recorded Verify and custody

Exact-SHA push Verify Slate run 42204900657 completed with failure. App job 127849021923 failed only at:
node src/base/runtime/contract-docs.mjs check
ACCEPTANCE.md: generated content differs; run contract-docs write.

Aggregate job 127849255425 failed on that dependency; test shards and contract aggregation were skipped. The failed-job archives were read once for each failed job using the required gh run view command. There was no rerun, dispatch, guessed repair or real product test failure. This is the explicit generated-view exception in the cloud brief. It is not a claim that CI's skipped tests ran. The guarded lander regenerates views and obtains its own exact-SHA green Verify before landing.

Five logical GitHub calls were used: discovery, one status observation after at least 300 seconds, jobs, and one failed-log read per failed job. No other repository API or provider was queried.

Product push succeeded at its first attempt through the fleet cloud push guard. Fleet author and committer identities and all candidate trailers were inspected; no co-author trailer exists. The push branch equals the full head above. No default branch was pushed or rewritten.

Full-history publication scan, main equality, generated-view landing and Run site remain guarded-lander duties. Scan status here is pending, never COMPLETE. No scan finding count, green Run site, main landing or DONE promotion is claimed. No real blocker remains for handing over the selected Word change.

## DONE-RIDERS and self-check

No DONE claim is made. The following records the applicable limits instead of waiving them:
1. Full clause outcome coverage remains incomplete: PDF and other named remainder are retained in Gap. Selected Word W1–W5 pass locally.
2. PASS for selected Word: nonempty seeded content, exact export readback and actual rendered output. Existing PORT-010 unsafe-reader and access-change refusals remain passing.
3. PENDING full recorded CI proof: existing Verify registrations load the helpers; this run's shards were skipped after the expected generated-view failure.
4. PASS: all final receipts name this exact head; build-source.json binds the emitted Worker to it.
5. UNCHANGED: no Base or receiving-clause inheritance text changed.
6. PASS for honest partial bookkeeping: the Gap names unproven work, Evidence resolves under first-party, generated write and check pass before restoration. No new DONE or judgment stamp was fabricated.
7. PASS: no acceptance point changed and no parent Status row disappeared.
8. UNCHANGED authority boundary; existing native refusal assertions passed in PORT-010 and the columns case.
9. PASS for honest boundary: no live provider, legal, external-account, PDF-export or unsupported content qualification is claimed.
10. NOT APPLICABLE: no new custody, consent, spending or authority policy default.
11. PENDING guarded landing: no main equality, green Run site or COMPLETE publication scan claimed.

Pre-ready self-check: selected user-visible Word outcomes have public-door assertions; no incumbent assertion was removed or weakened; access and replay implementations were not changed and their touched regressions pass; no production screen or homepage was edited. The existing export dialog was inspected at 1440 and 390: readable text, fully visible download action and an existing close tooltip are retained. New fixtures contain no email address or credential-shaped value. Source lock is current. The only red CI step is the permitted generated-view check.

Fault sensitivity was INSPECTED, not mutation-tested: flattening removes the four decoded and rendered tables; dropping or reversing a cell fails exact text or order; bottom alignment fails heading baselines; fixed height or no-wrap changes fail decoded constraints and rendered bounds; placing following content inside a cell fails its below-table position. These are proof-form notes, not a DONE request.

A verified product bundle is retained outside the clone for recovery. Product source and packet custody are separate. Clone removal follows successful evidence publication. The report and explicitly selected actual receipts and artifacts travel only on evidence/sd-slate-c-f190.
