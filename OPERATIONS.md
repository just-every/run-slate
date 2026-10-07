# Slate operating description

`node scripts/operations.mjs describe` validates and returns [OPERATIONS.json](OPERATIONS.json)
without installed dependencies. `node scripts/operations.mjs check` inspects
local deployment input names and the existing pure deployment validator; it
never executes commands, contacts a provider, verifies credentials or claims
remote health. Missing input names are reported; values and parser exceptions
are suppressed. Its scope is deployment inputs, not readiness to run loopback dev.

The inspector and version-2 descriptor reader are adopted from the optional
Base operations implementation; configuration remains Slate-owned. This is not
a claim of completed Base migration, hosted compatibility or accepted product.

Run package commands inside this repository. Install the pinned dependencies
before dev/build/verify/setup/deploy. `pnpm dev -- --port 4174 --strictPort`
applies local migrations then serves Vite on loopback. Explicitly set
`SLATE_WRANGLER_CONFIG_PATH=deploy/wrangler.local.toml` and an isolated
`SLATE_PERSIST_STATE_PATH` when using retained test data; default dev may choose
an existing generated wrangler.toml. Preserve owner state. Local sample behavior
is limited by the existing local runtime gate, not production data.

`pnpm build` emits the Worker. `pnpm verify` runs types, build and the existing
contract/foundation/platform checks; inspect uncovered clauses, not just exit
status. [ACCEPTANCE.md](ACCEPTANCE.md) specifies the much larger release gate.

`pnpm run setup` provisions/finds D1, R2 and Queue resources, writes wrangler.toml
and deployment cache, applies remote D1 migrations and uploads configured secrets. `pnpm run deploy` calls setup, then
builds the Worker/client, deploys `dist/server/wrangler.json` with Wrangler and checks /health database/files reachability. These are remote
mutations requiring an authorized target, Cloudflare authentication and the
SLATE_* deployment inputs; neither is a harmless configuration check. Health
reachability does not establish product acceptance, mail delivery or recovery.
Read the actual scripts before an authorized execution; additive migration
application and emitted-artifact verification must be independently confirmed.

AI adds SLATE_AI_MODEL/SLATE_AI_API_KEY when SLATE_AI_ENABLED=true; identity adds
SLATE_IDENTITY_ISSUER_URL/SLATE_IDENTITY_CLIENT_ID/SLATE_IDENTITY_CLIENT_SECRET
when SLATE_SSO_ENABLED=true. SLATE_CONNECTOR_CREDENTIALS_KEY is needed for stored
encrypted connector credentials. Runtime binding names are listed separately in
seed.json. Never store secret values in the descriptor or source.

Source is this independently owned repository; its remote is
https://github.com/just-every/slate.git and its licence is MIT in
[LICENSE](LICENSE). The candidate is 0.1.0, unreleased; [RELEASE.json](RELEASE.json)
is change metadata, not a publication receipt. Runtime is one Cloudflare Worker
with TanStack Start/React documents, Hono APIs, D1, R2 and Queues. Provider effects
and prospective acceptance remain unverified until recorded independently.

Backup and restore use the implemented portability client directly:

```sh
node src/core/features/portability/command.mjs backup ARCHIVE.zip
node src/core/features/portability/command.mjs restore ARCHIVE.zip
```

Replace ARCHIVE.zip with the chosen path. Both require SLATE_APP_URL and a
current authenticated owner SLATE_SESSION_COOKIE, sent only to the configured
origin over HTTPS (loopback excepted). Backup creates a server export and a new
local mode-0600 file, refusing overwrite. Restore requires an empty deployment
and its setup owner and mutates database/files. Neither command is run by the
inspector. Deployment-input check does not validate this session or archive.
Their implementation is not independent full fidelity or provider acceptance.

Current runtime also accepts `AI_PROVIDER=openai` (default) or `local-codex`.
The latter requires `LOCAL_SAMPLE_DATA`, a loopback `AI_LOCAL_URL`, `AI_LOCAL_TOKEN`
and `AI_MODEL`; hosted runtime rejects it. The deployment inspector therefore
rejects a local provider as a hosted configuration. Local Codex authentication
is not hosted-provider configuration or evidence of provider acceptance.
Monetary usage cost and a provider-enforced strict token ceiling remain
unconfirmed; the contract budget guarantees remain acceptance obligations.

Vite forwards `SLATE_APP_URL`, `SLATE_AI_*`, `SLATE_CONNECTOR_CREDENTIALS_KEY`
and the Google/Slack/GitHub `SLATE_<PROVIDER>_CLIENT_ID`/`CLIENT_SECRET` inputs
to server bindings. Stored connector credentials require an at-least-32-character
`CONNECTOR_CREDENTIALS_KEY`. Connector callbacks use the session-authenticated
`/api/connectors` surface; native sign-in callbacks remain under `/api/auth/`.
Queue consumption, the minute cron and `CONTENT_COLLABORATION` Durable Object
are current Worker exports; runtime presence does not prove remote delivery.
The implemented one-command local launcher is:

```sh
node local-agent/dev.mjs -- --port 4174 --strictPort
```

Choose the local port as needed. It starts the app and a dynamic loopback bridge,
generates a private process-only token, preserves existing persistence/session
environment and stops its owned children on exit. Installed dependencies and an
existing `codex login` are required; `SLATE_AI_MODEL` defaults to `gpt-6-astra`.
Authorized evidence goes to Codex for inference. For the standalone bridge,
`node local-agent/server.mjs` requires `SLATE_AI_LOCAL_TOKEN` (32+ characters)
and `SLATE_AI_MODEL`; `SLATE_AI_LOCAL_PORT` defaults to 4397. See
[local-agent/README.md](local-agent/README.md). The inspector only checks the
command files, never starts either process or verifies the account. Direct-engine
evidence does not establish the pending Worker-to-bridge acceptance.

Optional hosted native delegation uses each complete
`SLATE_HAPPYTOHELP_DELEGATION_ORIGIN`/`CLIENT_ID`/`ACCOUNT_ID` triplet and
`SLATE_ORBIT_DELEGATION_ORIGIN`/`CLIENT_ID`/`ACCOUNT_ID` triplet (repeat the full
provider prefix for every variable). The pure deployment parser checks complete
triplets and exact hosted HTTPS origins; loopback delegation is rejected for
hosted setup. No provider credential or reachability is validated by inspection.
Optional Google/Slack/GitHub OAuth IDs and secrets must be paired and require a
custody key of at least 32 characters, matching setup validation.

[Mail custody and recovery](docs/MAIL-DELIVERY.md) describes additive migration
0008, durable bounded retries and uncertainty handling. A provider receipt is
not inbox delivery. Real mail/provider/cron acceptance remains independent work.


## Native edition and independent RER candidate

The default is `SLATE_PROFILE=core-wiki`; flagship development must opt in and
still satisfy provider/grant/budget requirements. The local Codex bridge above
is a separate authorized development capability, not a core-wiki release input.
No AI credential is required for core wiki. See
[release source and delivery](docs/release/source-and-delivery.md) and
[resource budget](deploy/footprint.md).

`pnpm source:check` validates tracked source/authoring identity and the exact
management recipe. After intentional edits, run `pnpm integration:sync`, review
and stage source, run `pnpm source:lock`, then stage/commit the lock and retained
comparison material. `pnpm build` runs the existing Vite build and records source
and output digests. `pnpm artifact:delivery` requires clean committed source and
that receipt; it packages the actual native Worker, assets and migrations only.
`pnpm test:release-source` checks migration preservation and refusal behavior.
`pnpm check:rer-adoption --service-root PATH --output NEW_DIRECTORY` performs
scratch export/adoption using the actual service source validator, without
provider access. Service registration belongs to the service owner.

`rer-project.json` is framework-neutral `project` build mode. Its `setup` command
installs pinned build dependencies/browser assets in a credential-free runner;
it does not invoke this application's provider-provisioning `pnpm run setup`.
The trusted runner invocation remains unexecuted. `operations.mjs check` requires
real configured inputs for a readiness result and never verifies remote health.
The deployment workflow is manually dispatched. Configure its account variables and secrets and verify the selected environment before running it.


Source publication uses `pnpm publish-check`; deployment configuration uses
`pnpm check:deployment`. Publication validates this descriptor with `describe`
and retains full product/source verification without requiring hosted values.
`pnpm check:deployment` validates the required deployment configuration separately from source publication. Real account setup, verified sender configuration, mailbox delivery and provider acceptance must be checked on the deployment itself.
