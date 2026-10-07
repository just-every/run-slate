# Working on Slate

Slate is a self-hosted team wiki. Read README.md for startup and deployment, CONTRACT.md and BASELINE.md for requirements, and HANDOVER.md for the current verification scope. The public source repository is https://github.com/just-every/slate.

Keep production behavior real: no mock application code, semantic fallbacks, hidden failures or disabled obsolete implementations. Mocks belong only in tests. Keep files cohesive and small; preserve existing owner customizations and applied migrations. Owners may modify every source layer. Integration may use merges, reapplication or a rewrite, with the resulting requirements verified.

One Cloudflare Worker serves Hono APIs and TanStack Start documents. Hono owns `/health`, `/api`, `/api/*` and `/p/*`; the native anonymous `/app` preflight precedes Start. See deploy/REQUEST-OWNERSHIP.md. Server functions revalidate sessions independently. Keep secrets and server dependencies out of browser bundles, enforce authorization server-side, and use durable storage for authoritative state.

The maintained stack is TypeScript, React, TanStack Start/Router, Hono, Tailwind and Drizzle on D1, with R2 files and Queues jobs. Feature routers mount in src/core/app/mount-features.ts; documents live in src/routes; session-checked loaders are in src/core/app/loaders.ts. Changes to the pinned rendering split require emitted-Worker access tests, not a successful bundle alone. The request ownership table and emitted-artifact tests define the rendering acceptance boundary.

Use Node 26.8.1 and pnpm 8.15.6. Run `pnpm install --frozen-lockfile`, then `pnpm verify` and the suites affected by the change. Import changes require `pnpm test:imports`; release/source changes require `pnpm test:release-source` and `pnpm source:check`. The latter validates source provenance and generated integration metadata. After intentional tracked-source changes, run `pnpm integration:sync`, stage the intended files, then `pnpm source:lock` and `pnpm source:check`.

Preserve every requirement ID and assertion. A deliberate requirement amendment states the affected IDs, replacement behavior and security consequences in CONTRACT.md and RELEASE.json. Update tests and the exact test specifications in tests/requirements together; those registries distinguish supporting regressions from full requirement acceptance. Never report planned clauses or local synthetic provider tests as live acceptance. Anonymized incumbent fixtures retain archive formats, entry counts, structural edge cases and expected relationships; maintain those properties when changing them.

The default profile is core-wiki. Flagship is explicitly configured development functionality; enabling it does not grant authority, enable AI or establish product acceptance. The MAIL-002 amendment dated 7 October 2026 requires duplicate-safe retry: SendGrid uncertain sends stay held for provider review; a receipt proves acceptance only, not inbox delivery.

Deployment and remote provider operations need the caller's authorization. `pnpm run setup` provisions remote resources and secrets; `pnpm run deploy` also builds, publishes and checks health. Record local, deployed and provider verification separately. Stop servers and watchers started for checks when finished.
