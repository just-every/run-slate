# Bounded local qualification

Use pinned Node and pnpm from the calling environment. Build the current repository
with `pnpm install --frozen-lockfile && rer build` before invoking this helper.
It reads the emitted artifact; it does not build or alter application inputs.

```sh
QUAL_EVIDENCE=/absolute/evidence/path QUAL_APP_PORT=8746 QUAL_INSPECTOR_PORT=8747 \
  node tests/qualification/local/smoke.mjs
```

Call `createRuntime({root,evidence,appPort,inspectorPort})`; always await `close()`
in `finally`. Both ports must be explicitly assigned and distinct. The default
reserved range is 8700–8799. A caller with its own reservation may supply
`portRange:'56200-56219'` or `QUAL_PORT_RANGE=56200-56219`; the inclusive range
must contain at least two unprivileged ports, and both assigned ports must lie
inside it. The helper still checks each listener is free before launch/restart
and records the validated pair/range in `ports.json`. Reserving the range against
other jobs belongs to the caller; this does not authorize use of an occupied port.
Each invocation creates a new persistent state directory, applies all current
migrations locally, retains emitted bindings/entry/assets and records source input
and artifact hashes. No cloud credentials or provider environment is inherited.
Local sample data and AI are disabled. Read-only hashes do not prove that a prior
build used those inputs: execute a fresh build before recording qualification.

The test-only mail placeholder satisfies the deployment configuration parser;
it is not a delivery adapter. Do not invoke provider-sending application endpoints.
The first-owner helper explicitly fixtures mailbox possession and uses the real
magic-link acceptance and real wizard controls. Bootstrap and mail mechanics are
proved separately in core/provider-mechanics.ts with controlled provider doubles.
That service probe uses Wrangler's documented binding proxy (its private transport
may use ephemeral ports); it is not emitted HTTP or Durable Object qualification.
The emitted app itself always uses the assigned pair.

The original cross-edition harness uses `H2H_RUNTIME_ROOT` and
`ORBIT_RUNTIME_ROOT` for caller-pinned built sources. `CROSS_PORT_BASE` and
`CROSS_PORT_RANGE` allocate four distinct adjacent app/inspector pairs: HappyToHelp,
Orbit, Slate and the restored Slate. For example, base 56200 with range
56200-56219 uses 56200 through 56207. Explicit `SLATE_PROFILE=flagship` opts into
the existing cross journey's retained federation surfaces; the application still
validates the profile and defaults to core wiki when it is absent. Every original
journey assertion and console listener remains active. These synthetic native
sessions and deterministic procedure fixtures do not prove provider or hosted
acceptance. Runtime logs retain owned process IDs, groups and closed exit status.

`omitVariables` plus `expectedHealthStatus:503` are for explicit missing-required-
configuration negative cases only. Logs redact the per-run test session secret.
State and configuration are retained for diagnosis, not portable product export.
