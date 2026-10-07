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
authorisation, storage or a deployed application. `pnpm verify` retains the
separate production checks. Feature identifiers in stories provide traceability,
not a declaration that the associated contract has passed.

The capture command also runs continuous text/number/URL typing against actual
React updates, and comment rejection plus successful explicit retry. Set
`SLATE_UI_STORIES=editor-ready,database-table` to capture a named subset into a
separate output directory; unknown IDs fail. The full index is still checked.
