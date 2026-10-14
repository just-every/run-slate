# Working on Slate

## Run it locally

Use Node.js 22.20.0 and pnpm 10.12.4, with `rer` installed (`npm install -g @runeditrun/rer`; the checkout pins its own `@runeditrun/rer` 0.2.6 in package mode, so change the pin with `pnpm add -D -E @runeditrun/rer@X` then `rer install`). From the checkout root:

```sh
rer install
rer setup --owner-email owner@example.test
rer dev
```

Use your own email. Open the printed `RER_SIGN_IN` outbox, choose the newest sign-in message and follow its one-use link. No email is sent. Setup exits with no server running; dev starts the actual app with Vite HMR. Stop dev with Ctrl-C before checks or data movement.

```sh
rer verify
rer export --output exports/installation.rer
rer reset --yes
rer import --input exports/installation.rer --yes
rer deploy --environment production --dry-run
rer describe
```

Export before a destructive reset. Import requires an empty destination, then setup with the archived owner's email; or set up first with any archived full member's (not a guest's) email, who becomes the only active owner. Reset removes only the printed local inventory. Deployment dry run validates/builds locally with no provider requests; authorized `rer deploy --environment production` provisions the owner account and checks health. Read OPERATIONS.md for its required inputs.

Slate is a self-hosted team wiki. Public source is `just-every/run-slate`. Read README.md, CONTRACT.md, BASELINE.md, OPERATIONS.md and HANDOVER.md for requirements and evidence.

Keep production behavior real: no mock application code, semantic fallbacks, hidden failures or disabled obsolete implementations. Mocks belong only in tests. Preserve owner data and applied migrations. Owners may modify every source layer; integration may use merges, reapplication or a rewrite, with the resulting requirements verified.

One Cloudflare Worker serves Hono APIs and TanStack Start documents. Hono owns `/auth/confirm`, `/health`, `/api`, `/api/*` and `/p/*`; the native anonymous `/app` preflight precedes Start. Server functions revalidate sessions independently. Keep secrets and server dependencies out of browser bundles, enforce authorization server-side, and use durable storage for authoritative state.

The owner decision of 10 October 2026 narrows Slate's exemption to own accounts, sessions and roles. Base operator-auth (byte-exact copies at 363da337) signs people in through the native accounts and proof adapters in src/core/features/session/native over Slate's members, sessions and member_identity_bindings; never add Base account or session tables or a second owner ledger. Preserve WORK-008, WORK-009 and WORK-010; WORK-015's incumbent provider uses Base's pinned legacy-rs256 configuration. New sensitive operations call requireStepUp (src/core/features/session/step-up.ts). Dev identity lives only in the local entry src/dev/server.ts. See CONTRACT.md.

The maintained stack is TypeScript, React, TanStack Start/Router, Hono, Tailwind and Drizzle on D1, with R2 files and Queues jobs. Feature routers mount in src/core/app/mount-features.ts; documents live in src/routes; session-checked loaders are in src/core/app/loaders.ts. Changes to the pinned rendering split require emitted-Worker access checks, not a successful bundle alone. The request ownership table and emitted-artifact checks define the rendering acceptance boundary.

After intentional source changes, run `pnpm integration:sync`, stage intended files, then `pnpm source:lock` and `pnpm source:check`. Run affected suites; import changes require `pnpm test:imports`, and release/source changes require `pnpm test:release-source`.

Public docs live at `/docs` (DOCS-001), rendered at build time from the repository's Markdown: list every new Markdown file in `docs/site.json` as published or GitHub-only with a reason (an unlisted file fails `rer verify`), and keep published pages to the default core-wiki profile.

Preserve every requirement ID and assertion. A deliberate requirement amendment states the affected IDs, replacement behavior and security consequences in CONTRACT.md and RELEASE.json. Update tests and the exact test specifications in tests/requirements together; those registries distinguish supporting regressions from full requirement acceptance. Never report planned clauses or local synthetic provider tests as live acceptance. Anonymized incumbent fixtures retain archive formats, entry counts, structural edge cases and expected relationships; maintain those properties when changing them.

The default profile is core-wiki. Flagship is explicitly configured development functionality; enabling it does not grant authority, enable AI or establish product acceptance. The MAIL-002 amendment dated 7 October 2026 requires duplicate-safe retry: SendGrid uncertain sends stay held for provider review; a receipt proves acceptance only, not inbox delivery.

`SLATE_MAIL_PROVIDER` is an explicit deployment input (`resend` or `sendgrid`) rendered as runtime `MAIL_PROVIDER`; do not restore a provider default. Development mail is allowed only with `LOCAL_DEVELOPMENT=true` and an exact loopback origin. Deployment and remote provider operations need the caller's authorization. `rer setup` prepares local native settings and owner sign-in; `rer deploy --environment NAME` uses Base deploy-kit for owner-account resources, secrets, migrations and health. Record local, deployed and provider evidence separately. Stop servers and watchers started for checks when finished.
