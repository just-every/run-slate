# Source and delivery

Slate owns its native Worker, React/TanStack Start documents, Hono API, sessions and migrations. The local edition manifest and source lock record the complete tracked source, with retained Base provenance for the authoring tools and selected mail implementation/license files.

```sh
pnpm integration:sync
git add <intended-paths>
pnpm source:lock
git add sources.lock.json .edition/sources
pnpm source:check
```

Commit the reviewed source before creating a releasable artifact. `pnpm build` records exact source, lock, commit/tree and output digests in `.artifacts/build-source.json`; concurrent changes invalidate the receipt. `pnpm artifact:delivery` requires clean committed source and a matching receipt. It packages emitted Worker modules/assets and exact SQL migration bytes into `delivery-artifact/slate-worker-artifact.json`. Private files, links, unknown module formats, changed bindings and secrets in emitted variables are rejected.

`rer-project.json` describes independent project build mode. Its trusted-runner setup installs pinned build dependencies and browser assets, whereas the application's `pnpm run setup` provisions Cloudflare resources and secrets. Source commands need no provider configuration. `pnpm publish-check` runs verify, release-source tests, source/integration integrity checks, operations descriptor validation and publication-input checks. `pnpm check:deployment` separately validates real deployment inputs; it does not prove provider credentials or delivery.

After a clean committed build, `pnpm test:delivery-artifact` unpacks only the delivery descriptor's actual modules, assets and SQL into a fresh directory, applies local migrations and runs that Worker. Configure `DELIVERY_APP_PORT`, `DELIVERY_INSPECTOR_PORT`, `DELIVERY_PORT_RANGE` and optional `DELIVERY_EVIDENCE`. It tests missing-configuration refusal, native sessions, editing, search, readable export, profile refusal and exact asset bytes. Its synthetic mailbox-possession fixture does not establish mail-provider delivery. The runner closes its processes in `finally`.

Vite/Wrangler build metadata is excluded from Worker modules but included in output integrity. Asset packaging obeys emitted literal `.assetsignore` entries and rejects unsupported syntax. Server-imported CSS remains Worker Text modules. Local artifact checks do not establish a trusted-runner attestation, hosted admission, prior-store upgrade or live-provider acceptance.
