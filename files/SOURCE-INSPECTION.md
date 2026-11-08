# Source inspection

- Main: 95a0372f6692b95607cedc7d1f9a0440dc9d3c38.
- f212: 1ce8fa17f7358ec5d77165d77edad10535a81d17.
- Read the complete `git diff origin/main...origin/cloud/sd-slate-c-f212`; the changed-file list is below. It changes decisions and adds their later nested proposal workspace. It does not change the comments snapshot or introduce its actor/transport.
- `src/core/app/hono.ts:58` charges authenticated API requests to `operator:<member.id>` at 600.
- `src/core/app/http-security.ts:18` hashes `{address, scope, bucket}`, where address is `cf-connecting-ip` or `local` and bucket is the fixed 60-second window. No configurable lowered-limit seam is called by the application.
- Main's `browser-support.mjs` constructs a fresh Playwright request context per `state.api()` read; `two-people-support.mjs` separately constructs a context for `call()`/`ok()`. Neither sends a synthetic IP. Different members already have different operator scopes regardless.
- Main's `permissionLevelsJourney` wraps only its local `state.api()` reads, reserving 125 ms responsive slots / 105 ms extended slots. The five-way snapshot includes the comments route and an activity cursor walker. Mutations and reads through `call()`/`ok()` plus native browser work share the same owner bucket but bypass that local reservation.
- Diagnosis: incomplete aggregate per-owner pacing, consistent with (b). There is no distinct comments bucket. The exact historic failing minute was not reproduced on this cloud VM, so no claim is made that its request count was measured here. The fix establishes one shared transport, one in-flight probe per actor and a deterministic aggregate probe budget with separately measured native traffic margin.

## f212 changed files

```
CONTRACT.md
sources.lock.json
src/core/features/decisions/records.ts
src/core/features/decisions/ui/DecisionProposal.tsx
src/core/features/decisions/ui/DecisionWorkspace.tsx
src/core/features/decisions/ui/PageDecisions.tsx
tests/profile/decision-edit-journey.ts
tests/profile/profile.node.tsx
tests/profile/profile.worker.test.ts
tests/qualification/ui-convergence/decision-edit-journey.mjs
tests/qualification/ui-convergence/journeys.test.mjs
tests/requirements/clause-inventory.json
tests/requirements/cli-journey.md
```
