# Operating Slate

Use Git and Node.js 22 or later. The checkout pins `@runeditrun/rer` exactly to **0.2.22**. Rer provides this checkout's pinned Node.js **22.20.0**, pnpm **10.12.4** and dependencies for its commands; a separate pnpm installation is unnecessary. Start with the [README](README.md) journey through `rer install`, `setup --owner-email owner@example.test` and `dev`. `rer describe` lists the actual flags and effects. `rer check --profile first-party` validates the structural command contract without credentials or dependencies. `doctor` diagnoses the local tools and state without provider requests.

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

Reset removes only its printed local inventory and refuses active custody. It preserves source, dependencies, owner archives and `.rer/deploy` receipts. Import requires an empty destination. Either import before setup and then set up with the archived owner's email, or run setup first with any archived full member's email: that member becomes the one active owner, the archived owner becomes a historical actor, and an address that is not an archived member, or is an archived guest, is refused with nothing restored. An archive that names more than one setup owner is refused, and every imported row is set to what export writes, so public links come back revoked and agent credentials erased. A member removed before the export stays removed, and a grant or group membership an archive gives them is left out with one warning per row. Local archives include D1 facts and identities, retained FILES attachments and source import originals. Derived ZIP exports, deleted/unreferenced objects, session capabilities, credentials, private settings and transient caches are excluded. Agent metadata moves only as revoked records with erased digests and empty scopes. Search is rebuilt; restored automation, grants and effects require new owner authority. Hosted installation export uses `rer export --target remote` with an exact `--origin` and private `--session-file`. It authenticates the native owner, requires a recent email confirmation and complete workspace read coverage. Remote installation import is unsupported; import into a separate empty local checkout first. Authenticated workspace ZIP backup/restore is a distinct product format.

When recovering an older installation archive after a person was erased, retain a newer complete installation archive as the trusted redaction checkpoint and pass it as `--journal` to local import. Base refuses the older archive when that checkpoint says it predates erasure; the destination remains empty. Native ZIP backups also carry the value-free source checkpoint and refuse an older or checkpoint-free archive when the destination already retains a newer erasure epoch. Preserve the newer backup: a fresh destination cannot infer an erasure it has never seen.

## Run Edit Run hosted mail

Managed hosting supplies mail without an owner's provider account. Configure fills and hides all four runtime inputs: `MAIL_PROVIDER=rer`, `MAIL_FROM`, `MAIL_RELAY_URL` and private `MAIL_API_KEY`. Saving the plan generates an installation/environment credential; RER stores it with encrypted private settings and indexes only its hash at the relay. The upstream provider key never reaches Slate or its build. Free and Assisted hosting retain their own Resend/SendGrid provider, verified sender and key options.

Slate uses the copied Base `rer` relay adapter. It posts one recipient, subject, text and optional HTML to the assigned `MAIL_RELAY_URL`, authenticating with the generated bearer credential and refusing redirects. It sends no sender or installation ID. HTTP 202 with `accepted: true` proves provider acceptance, not inbox delivery, and has no message receipt ID. Invitation delivery queues HTTP 429 responses, respecting `Retry-After` within the existing retry budget. A refused sign-in email is shown as a mail problem; request a new sign-in link after fixing it. Ambiguous outcomes are held for review with no blind automatic or manual resend.

Managed mail shares production/preview limits of 20 messages per minute, 200 per hour and 1,000 per day per installation. Valid attempts consume allowance even when the provider fails. Credential rotation invalidates pending releases: build and publish again to bind the new credential. Revocation stops access, and ordinary Configure save cannot revive a revoked credential. The relay checks paid Managed access and hosting state on every send.

This hosted configuration leaves local development's loopback outbox and dev v2 sign-in unchanged. The owner-account deployment command below still requires an explicit Resend or SendGrid account and verified sender; it does not provision Managed relay mail. Local checks establish neither deployed relay access nor inbox delivery.

## Owner-account deployment

The real deployment declaration is [deploy.json](deploy.json); `scripts/installer/deploy.mjs` selects the native provider and sender before calling rer's own deploy kit (the pinned `@runeditrun/rer` package; none is vendored here). Supply these inputs from the owner's private vault or deployment environment:

| Input | Source and purpose |
| --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | Target Cloudflare account. |
| `CLOUDFLARE_API_TOKEN` | Authorized token with permissions for declared resources and Worker deployment. |
| `SLATE_SETUP_OWNER_EMAIL` | First native owner mailbox. |
| `SLATE_MAIL_PROVIDER` | Explicit `resend` or `sendgrid`; no provider default. |
| `SLATE_MAIL_FROM` | Verified sender for that provider. |
| `SLATE_IDENTITY_PROVIDER` | Optional exact HTTPS origin of a linked identity provider; leave blank for native email sign-in. |
| `SLATE_SESSION_SECRET` | Private secret; rer generates one on a first deploy. Preserve it across deployments to retain session and encrypted custody continuity. |
| `SLATE_MAIL_API_KEY` | Private key belonging to the selected mail provider. |

```sh
rer deploy --environment production --dry-run
rer deploy --environment production
```

Dry run builds/validates locally and makes zero provider requests. Actual deployment requires caller authorization, creates owner-account resources, applies original migrations, uploads declared secrets, publishes and checks health. Base derives resource names and the workers.dev origin from the public project and environment; receipts in `.rer/deploy` retain resource custody. Preserve existing hosted resources and receipts during any deliberate resource change. Local input validation does not establish provider permissions, sender verification, inbox delivery or deployed health.

After the first healthy deploy, rer claims the first owner for `SLATE_SETUP_OWNER_EMAIL`: it posts a generated one-time `SETUP_TOKEN` to `/auth/bootstrap` (Base operator-auth: 303 claims the empty installation, 409 `already_initialized` keeps the existing owner) and then removes the token from the Worker. You still sign in by email at the deployed address (the mailbox must prove possession), and that owner then names the workspace at `/setup`. A deploy without the claim leaves the first email sign-in as `SLATE_SETUP_OWNER_EMAIL` to claim the empty installation.

To delete a deployment, export first, then run `rer deploy --environment production --remove --yes` from the checkout that deployed it. It removes the Worker and the D1, R2 and queue resources its receipt says rer created for that environment, with their data, and reads back that none remains.

The optional linked provider is selected before first setup and then immutable; its runtime binding is `IDENTITY_PROVIDER`. Base currently refuses unattended first-time provider approval with `native_capability_unavailable` for native accounts. Leave this optional input blank for a fresh installation until Base supplies that capability. Existing-owner approval, relink, unlink and logout protocol checks do not establish unattended initial setup or hosted provider acceptance.

The 7 October 2026 MAIL-002 decision requires duplicate-safe retry: SendGrid uncertain sends remain held for provider review. Resend uses bounded exact-body idempotency. An accepted receipt proves provider acceptance, not inbox delivery.

## Update an existing deployment

Keep the existing checkout, native owner identity, deployment receipts, environment name and private deployment inputs. Before exporting, confirm the checkout is clean and `git rev-parse HEAD` matches both the running wiki's `/health` `deployment.sourceSha` and the deploy receipt's `source.sha`. If they differ, preserve local changes and find the deployed source revision before continuing; the local HEAD alone does not identify the remote backup's recovery source. Sign in as the owner and confirm your email for export. Save the single `slate_session=VALUE` cookie in an owned mode-0600 `.seed/owner-session` file; never put it in shell history or a shared log. Substitute your existing origin and environment below:

```sh
rer export --target remote --origin https://wiki.example.com --session-file .seed/owner-session --output exports/before-update.rer
git rev-parse HEAD > exports/before-update.source
git pull --ff-only
rer deploy --environment production
```

Rer deploy provisions the pinned tooling and installs frozen dependencies automatically; the private pnpm it supplies is available to rer commands, not as a bare shell command. `rer update` updates the rer CLI, not your wiki source; use the deployment identity and retained-data checks below to validate the wiki update.

Export must finish before pulling. Keep the archive and its recorded source revision. Before pulling, restore the archive into a distinct empty checkout pinned to that export-source revision with `rer import --input exports/before-update.rer --yes`, then set up with the archived owner's email and inspect the result. Restoration into a newer source revision requires separate migration-compatibility validation; the current Base importer can refuse migration 0029's trigger replacement for an older archive. Preserve the export-source checkout as your recovery path when that newer restore is unsupported. A failed export stops the update. A non-fast-forward pull requires review of your local changes; preserve them before resolving the update. Run `rer deploy --environment production --dry-run` to review the changed build and declaration locally before the authorized deployment.

Deploy to the same environment and preserve `SLATE_SESSION_SECRET`, account, resource names and `.rer/deploy` receipts. After deployment, check the deploy receipt's project, environment and origin, and match `/health`'s `deployment.sourceSha`, `fingerprint` and `versionId` to that receipt. Sign in as the same native owner, and verify retained pages and revision history, search, groups/guest access and original attachments. Check a formerly public page at its existing URL and private pages anonymously. Confirm applied migration history is unchanged apart from new additive migrations. A green build or health response alone does not prove retained-data equivalence.

Rer 0.2.5 uses Cloudflare's `d1_migrations` ledger for fresh deployments, which Slate's export inventory accepts. An existing 0.2.1 deployment retaining `_rer_deploy_migrations` needs separate upgrade and export validation. The CLI has a legacy-ledger transition path, but its existence alone does not prove that installation's migration. If your pre-update export refuses a controller ledger or unknown table, preserve the ledger and the refusal, retain your known-good backup and pause the update for review. Never delete or rename tables to obtain a backup.

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

Inject credentials from your private vault into the process environment. Keep keys and bridge tokens out of committed files, command arguments, browser code, screenshots and logs. Restart dev after changing configuration. These environment mappings apply to Vite development; they are not rer deployment flags. The current hosted deployment declaration keeps AI disabled and exposes only the declared inputs in **Owner-account deployment**. Hosted AI provisioning is not provided by that command.

For the optional local Codex bridge, use an existing `codex login` account and run `SLATE_PROFILE=flagship node local-agent/dev.mjs` after setup. It starts rer dev and supplies enablement, provider, model, loopback `AI_LOCAL_URL` and a private process-only `AI_LOCAL_TOKEN`; `SLATE_AI_MODEL` selects the model. See [local-agent/README.md](local-agent/README.md) for the advanced single-bridge setup and inference boundaries. Starting the bridge performs provider capability evaluation using that account. Stop it with Ctrl-C.

Provider configuration does not authorize workspace spending. Sign in as a workspace owner and open Ask → **AI allowance**. For the local provider, enter positive monthly and per-run token allowances (per-run no greater than monthly), acknowledge that the provider has no hard token cap, then select **Set allowance**. This owner-checked operation verifies bridge readiness, enables workspace AI and records its local model policy and allowance. Monetary cost remains unknown.

Every run still requires a current, source-readable evaluation qualifying its exact model and task. Owners manage measured evaluations through `POST /api/ai/route-evaluations` and model policy through `PUT /api/ai/model-policy`; see the [evaluation schema](src/core/features/ai/route-evaluation.ts) and [policy schema](src/core/features/ai/model-policy.ts). OpenAI additionally requires verified input/output rates, per-run and monthly policy ceilings, workspace AI enablement and a positive workspace dollar budget. The current UI/API has no OpenAI workspace-budget setup operation, so setting its key and model alone cannot complete metered setup. Local bridge readiness alone also does not satisfy the separate task-evaluation gate. Leave Ask unavailable until the required owner authority and evidence exist; do not bypass those checks by editing database records. This development setup establishes neither live provider nor flagship acceptance.

## Source and acceptance

`verify:app` is the internal complete suite called by rer verify. It cannot call its public alias recursively. After intentional source edits, run `pnpm integration:sync`, stage intended files, then `pnpm source:lock` and `pnpm source:check`. Release/source changes require `pnpm test:release-source`; import changes require `pnpm test:imports`. `rer release --repo PATH --output PATH --clean-history` prepares a local source export without pushing or deploying. Public identity remains `just-every/run-slate`.

The optional management editor requires `RER_MANAGEMENT_ORIGIN` and `RER_INSTALLATION_ID` together, native owner authorization and expiring editor grants. Actual management registration and source → build → hosted reload require stage evidence. See CONTRACT.md, ACCEPTANCE.md and HANDOVER.md: structural checks, local synthetic provider tests and builds do not establish full product, live provider or deployed acceptance.
