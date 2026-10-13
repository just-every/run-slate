# Isolated component preview

This preview imports the real UI components and supplies sample props only inside
`tests/ui`. It has its own Vite root and never adds a route, fixture or data source
to the Worker. Components remain callback-driven; these stories do not establish
product integration or contract satisfaction.

Run `pnpm exec vite --config tests/ui/vite.config.ts` to inspect stories on port
4198. The index links every supported story. `?theme=dark` exercises the existing
explicit theme. No vendor image is used by the preview.

Run `pnpm test:ui` for the real-browser inline editing regression. Run
`SLATE_UI_EVIDENCE_DIR=/absolute/evidence/path pnpm test:ui:capture` for screenshots
and WCAG 2.1 AA axe scans of every story at desktop, phone and dark desktop. The
capture command starts and stops its own preview and Chromium. It fails on axe
violations, console/page errors or horizontal document overflow and writes its
raw results even when a scan fails. Chromium must be installed with
`pnpm exec playwright install chromium`.

The capture evidence documents rendered component states, not API behaviour,
authorisation, storage or a deployed application. `rer verify` retains the
separate production checks. Feature identifiers in stories provide traceability,
not a declaration that the associated contract has passed.

The capture command also runs continuous text/number/URL typing against actual
React updates, and the existing editor browser interactions. Retired component stories are recorded in PROOF.md; the capture harness checks the exact retained story inventory. Set
`SLATE_UI_STORIES=editor-ready,database-table` to capture a named subset into a
separate output directory; unknown IDs fail. The full index is still checked.

### Additive visible-polish Worker journeys

`node --test --test-concurrency=1 tests/ui/polish-journeys.test.mjs` runs the
1440×1000 and 390×844 journeys against the emitted Worker using the existing
qualification identity-only harness. Build the Worker first with the repository's
normal build command. This suite does not replace or modify the original
qualification journeys or use the story fixtures as application responses.

Screenshots default to `.artifacts/slate-polish/shots`;
set `SLATE_POLISH_SHOTS` to choose a different directory. Each capture retains
axe results and control geometry in its sibling `polish-evidence` directory.
Menu, navigation, search and editor captures use viewport images; settings and
panels use full-page captures for controls below the fold. The comment failure
step uses genuine offline transport, preserves the exact draft and checks an
explicit retry creates one durable comment. Flagship AI is disabled and has no
provider credentials; the allowance view never dispatches model work.

The additive journeys await the five named space tabs after their real detail
request. They check all eleven flagship settings sections by name; on phones the
Previous/More section buttons must scroll to the last tab and back to the earlier
tabs. Search clear controls are captured in both saved member themes. Discussion
evidence includes the live Resolve all control before use, resolved threads after
use and after reload, and an exact character check of the offline draft before
the explicit retry. Each added state capture runs axe and retains its geometry.
