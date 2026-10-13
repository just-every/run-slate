# Operating Slate

Use Node.js **22.20.0** and pnpm **10.12.4**. Start with the [README](README.md) journey through `rer install`, `setup --owner-email owner@example.test` and `dev`. `rer describe` lists the actual flags and effects. `rer check --profile first-party` validates the structural command contract without credentials or dependencies. `doctor` diagnoses the local tools and state without provider requests.

Setup builds and migrates the app, prepares private native settings and requests ordinary owner sign-in through the local outbox. It exits with no server running. Reruns preserve exact settings and existing owner/data; conflicting owner or origin choices require explicit recovery or reset. The manifest declares `APP_URL` and `SETUP_OWNER_EMAIL`, with no owner-name field. Slate retains native magic-link/OIDC/session/role/group/guest authority under the owner's 8 October 2026 override; there is no Base owner ledger.

Dev runs the actual Vite app with HMR. Preview serves a fixed production Worker. Both print health-gated readiness and the loopback `/__dev/outbox`, where the newest message holds the one-use native sign-in link. No email is sent. Use Ctrl-C or `rer dev --stop` (or `preview --stop`) to stop the selected mode. `--host` accepts only loopback; explicit occupied ports fail. A compatible running mode can be reused; conflicting modes refuse.

## State and data movement

Durable local data lives in `.wrangler/state`; mode-0600 settings are `.dev.vars`; drafts/logs are `.seed/installer`; CLI bookkeeping is `.rer/local`. `wrangler.jsonc` declares D1, R2, Queues and collaboration bindings. Regenerate bindings with `pnpm run cf-typegen` after binding changes. Build excludes private settings and restores their exact bytes.

Stop the app before exporting or resetting:

```sh
rer export --output exports/installation.rer
rer reset --yes
rer import --input exports/installation.rer --yes
rer setup --owner-email owner@example.test
```

Reset removes only its printed local inventory and refuses active custody. It preserves source, dependencies, owner archives and `.rer/deploy` receipts. Import requires an empty destination. Either import before setup and then set up with the archived owner's email, or run setup first with any archived full member's email: that member becomes the one active owner, the archived owner becomes a historical actor, and an address that is not an archived member, or is an archived guest, is refused with nothing restored. An archive that names more than one setup owner is refused, and every imported row is set to what export writes, so public links come back revoked and agent credentials erased. A member removed before the export stays removed, and a grant or group membership an archive gives them is left out with one warning per row. Local archives include D1 facts and identities, retained FILES attachments and source import originals. Derived ZIP exports, deleted/unreferenced objects, session capabilities, credentials, private settings and transient caches are excluded. Agent metadata moves only as revoked records with erased digests and empty scopes. Search is rebuilt; restored automation, grants and effects require new owner authority. Remote CLI transfer is unsupported. Authenticated workspace ZIP backup/restore is a distinct product format.

## Owner-account deployment

The real deployment declaration is [deploy.json](deploy.json); `scripts/installer/deploy.mjs` selects the native provider and sender before calling Base deploy-kit. Supply these inputs from the owner's private vault or deployment environment:

| Input | Source and purpose |
| --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | Target Cloudflare account. |
| `CLOUDFLARE_API_TOKEN` | Authorized token with permissions for declared resources and Worker deployment. |
| `SLATE_SETUP_OWNER_EMAIL` | First native owner mailbox. |
| `SLATE_MAIL_PROVIDER` | Explicit `resend` or `sendgrid`; no provider default. |
| `SLATE_MAIL_FROM` | Verified sender for that provider. |
| `SLATE_SESSION_SECRET` | Private secret; preserve across deployments to retain session and encrypted custody continuity. |
| `SLATE_MAIL_API_KEY` | Private key belonging to the selected mail provider. |

```sh
rer deploy --environment production --dry-run
rer deploy --environment production
```

Dry run builds/validates locally and makes zero provider requests. Actual deployment requires caller authorization, creates owner-account resources, applies original migrations, uploads declared secrets, publishes and checks health. Base derives resource names and the workers.dev origin from the public project and environment; receipts in `.rer/deploy` retain resource custody. Preserve existing hosted resources and receipts during any deliberate resource change. Local input validation does not establish provider permissions, sender verification, inbox delivery or deployed health.

The 7 October 2026 MAIL-002 decision requires duplicate-safe retry: SendGrid uncertain sends remain held for provider review. Resend uses bounded exact-body idempotency. An accepted receipt proves provider acceptance, not inbox delivery.

## AI owner setup

The default profile is `core-wiki`, which does not expose Ask. Explicit `SLATE_PROFILE=flagship` development configuration grants no authority, enables no AI by itself and proves no flagship acceptance. Without a provider, Ask keeps your draft and disables submission; opening its setup instructions does not submit model work.

For local development, complete rer setup first, stop any running dev instance, then supply these variables to the environment of `rer dev`. Rer passes them to Vite, which maps the `SLATE_` names to server-only runtime bindings:

| Development environment | Runtime binding | Value |
| --- | --- | --- |
| `SLATE_PROFILE` | `SLATE_PROFILE` | `flagship` to expose the development AI surfaces. |
| `SLATE_AI_ENABLED` | `AI_ENABLED` | `true` for runtime AI configuration. |
| `SLATE_AI_PROVIDER` | `AI_PROVIDER` | `openai` or development-only `local-codex`. |
| `SLATE_AI_MODEL` | `AI_MODEL` | The exact model selected by the owner; the workspace policy must also approve the model and task. |
| `SLATE_AI_API_KEY` | `AI_API_KEY` | Private OpenAI API credential when using `openai`. |

Inject credentials from your private vault into the process environment. Keep keys and bridge tokens out of committed files, command arguments, browser code, screenshots and logs. Restart dev after changing configuration. These environment mappings apply to Vite development; they are not rer deployment flags. The current hosted deployment declaration keeps AI disabled and exposes only the seven inputs in **Owner-account deployment**. Hosted AI provisioning is not provided by that command.

For the optional local Codex bridge, use an existing `codex login` account and run `SLATE_PROFILE=flagship node local-agent/dev.mjs` after setup. It starts rer dev and supplies enablement, provider, model, loopback `AI_LOCAL_URL` and a private process-only `AI_LOCAL_TOKEN`; `SLATE_AI_MODEL` selects the model. See [local-agent/README.md](local-agent/README.md) for the advanced single-bridge setup and inference boundaries. Starting the bridge performs provider capability evaluation using that account. Stop it with Ctrl-C.

Provider configuration does not authorize workspace spending. Sign in as a workspace owner and open Ask → **AI allowance**. For the local provider, enter positive monthly and per-run token allowances (per-run no greater than monthly), acknowledge that the provider has no hard token cap, then select **Set allowance**. This owner-checked operation verifies bridge readiness, enables workspace AI and records its local model policy and allowance. Monetary cost remains unknown.

Every run still requires a current, source-readable evaluation qualifying its exact model and task. Owners manage measured evaluations through `POST /api/ai/route-evaluations` and model policy through `PUT /api/ai/model-policy`; see the [evaluation schema](src/core/features/ai/route-evaluation.ts) and [policy schema](src/core/features/ai/model-policy.ts). OpenAI additionally requires verified input/output rates, per-run and monthly policy ceilings, workspace AI enablement and a positive workspace dollar budget. The current UI/API has no OpenAI workspace-budget setup operation, so setting its key and model alone cannot complete metered setup. Local bridge readiness alone also does not satisfy the separate task-evaluation gate. Leave Ask unavailable until the required owner authority and evidence exist; do not bypass those checks by editing database records. This development setup establishes neither live provider nor flagship acceptance.

## Source and acceptance

`verify:app` is the internal complete suite called by rer verify. It cannot call its public alias recursively. After intentional source edits, run `pnpm integration:sync`, stage intended files, then `pnpm source:lock` and `pnpm source:check`. Release/source changes require `pnpm test:release-source`; import changes require `pnpm test:imports`. `rer release --repo PATH --output PATH --clean-history` prepares a local source export without pushing or deploying. Public identity remains `just-every/slate`.

The optional management editor requires `RER_MANAGEMENT_ORIGIN` and `RER_INSTALLATION_ID` together, native owner authorization and expiring editor grants. Actual management registration and source → build → hosted reload require stage evidence. See CONTRACT.md, ACCEPTANCE.md and HANDOVER.md: structural checks, local synthetic provider tests and builds do not establish full product, live provider or deployed acceptance.
