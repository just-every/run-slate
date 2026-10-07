# Core-wiki launch profile

The core-wiki launch amendment dated 6 October 2026 defines this release scope. The default is
`SLATE_PROFILE=core-wiki`; `SLATE_PROFILE=flagship` explicitly exposes the retained
flagship development surfaces. The flag is a deployment binding, passed through
setup's Wrangler template, not a ninth content policy or a data migration.
Invalid values fail configuration. `AI_ENABLED` and `SSO_ENABLED` remain false
by default. Enabling flagship does not enable AI or supply any grant or budget.

Authenticated `/api/profile` returns the active profile. The operator shell waits
for this response before mounting workspace content. Core wiki retains pages,
blocks, presence and committed-content refresh, comments, manual decisions,
containers, structured records, templates, publication, archive, search and
portability. Ask controls, connected sources and retained generated search answers
are absent. Direct run/inquiry documents show an unavailable message. Authenticated
requests to AI, runs, inquiries, experiments, skills, effects, impact, external
agents/MCP, claims, sources, connectors and suggestions return 403 FEATURE_DISABLED.
Live collaboration sockets are refused, including an existing room's current
access checks. This is a real server boundary, not merely hidden navigation.

Intelligence and federation schedules dispatch no work in core wiki. Existing
queued jobs write a visible FEATURE_DISABLED failure and retry under the queue's
bounded retry policy; they are never acknowledged as successful work. Existing
rows, grants, receipts, credentials and applied migrations are preserved, and
export/restore/erasure remain responsible for that retained data. A stored
connection still requires its encryption key: selecting core wiki does not hide
missing required configuration. Scheduled content, notifications, automation and
identity mail retain their ordinary behaviors.

## Local commands and integration

Use pinned pnpm 8.15.6 and Node 26.8.1 as in the push verification workflow. `pnpm test:profile` runs new bounded
configuration, UI rendering, real Worker/D1 API and queued-job checks. The suite
uses SLATE_TEST_PORT (default 55500), plus the next two ports, and all existing
migrations. These tests prove only profile behavior; original tests remain intact.

`pnpm publish-check` runs full verification, release-source tests, source/integration checks, operations description and publication-input validation. Deployment readiness is checked separately by `pnpm check:deployment`; real provider credentials and receipts remain deployment prerequisites. Neither command publishes a tag or deployment.
