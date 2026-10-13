# Local evidence inference

Run `rer setup --owner-email owner@example.test`, then `node local-agent/dev.mjs` for the local Slate app and authenticated loopback inference together. The app uses the saved `APP_URL` in `.dev.vars`. It uses an existing `codex login` account, chooses the configured `SLATE_AI_MODEL` (default `gpt-6-astra`), creates a private process-only bridge token and shuts down both owned children. Existing Slate persistence/session environment remains intact. No Codex auth data is copied into Slate.

Advanced single bridge: set a random 32+ character `SLATE_AI_LOCAL_TOKEN`, `SLATE_AI_MODEL`, optional `SLATE_AI_LOCAL_PORT` (4397), then `node local-agent/server.mjs`. Worker-only bindings are `AI_PROVIDER=local-codex`, `AI_LOCAL_URL`, `AI_LOCAL_TOKEN`, `AI_MODEL`. Vite accepts their `SLATE_` prefixes. Browser requests and unauthenticated clients are rejected. There is no shell endpoint or general provider proxy.

Each inference creates an ephemeral Codex thread with empty environments, no dynamic tools, disabled shell/exec/browser/apps/plugins/MCP/memory/delegation, an isolated temporary directory, no project instructions, strict evidence/answer schemas, a 240-second limit and actual provider usage receipts. Unexpected tool activity aborts the request. Original evidence is checked again by Slate before disclosure.

This is a development provider, not a hosted Worker feature. Local ChatGPT-account inference has measured token usage and unknown monetary cost; it does not supply an API dollar rate or a provider-enforced output token maximum. A hard dollar-budget release needs a supported metered API adapter and verified rates. Do not count local login or this bridge as hosted acceptance.
