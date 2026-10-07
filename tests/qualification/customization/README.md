# AGENT-002 owner-source qualification

Run with Node 26.8.1, pnpm 8 and installed Playwright Chromium:

```sh
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 pnpm install --frozen-lockfile
QUAL_EVIDENCE=/absolute/evidence/directory node tests/qualification/customization/prove.mjs
```

`QUAL_ROOT` selects the source checkout (its exact committed HEAD is cloned).
`QUAL_EVIDENCE` defaults to an OS temporary directory. Ports default to 8730
(HTTP), 8731 (inspector), and 8732 (test provider protocol fixture), and can be
selected with `QUAL_APP_PORT`, `QUAL_INSPECTOR_PORT`, and `QUAL_PROVIDER_PORT`.
All started browser, Worker and fixture processes close on success or failure.

The test installs and builds a real separate owner clone, populates its native
persistent Worker through actual operations, then changes its navigation, core
page-creation policy, additive page schema and loopback provider configuration.
The owner source changes are committed only inside the disposable evidence clone.
Existing tests, migrations and feature interface source definitions are frozen;
no test or original migration is edited. Source-level owner customization is the
subject of this proof, not a production patch proposed for the candidate.

The original install receives an explicitly labelled historical run fixture; it
is not represented as generated work. The modified install selects an explicitly
labelled local protocol fixture through owner configuration and exercises the
real queued provider transport and terminal result path. Its readiness response,
route evaluation and answer are test data, never capability evaluation or model-quality acceptance. No actual
model, mail delivery, remote D1, deployment or charged service is invoked.

The evidence contains original/modified artifact identities, the owner diff,
per-table snapshots and hashes, rendered editor/comments/history/recovery,
native portable export/restore, and a machine-readable receipt. Record content
and identity preservation is checked across source/schema update, restart and quiescent local
state replacement, then native restoration into a fresh migrated install. The
original migration bytes and applied migration names are retained; the fresh
installation naturally has its own migration application timestamps. Restore
deliberately disables workspace AI authority and requires fresh authentication.
The comparison explicitly permits that safety transition without altering stored
Skill definitions, decisions, completed runs or their identifiers. Re-run
against the final integrated source checkpoint before claiming that candidate.
