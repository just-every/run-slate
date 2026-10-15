# Try Slate

`pnpm exec rer demo` uses a disposable workspace and signs in the configured
local owner. Stop it with `pnpm exec rer demo --stop`; starting again creates a
fresh Northstar Studio handbook, linked pages, project table, comments and members.
The normal `.wrangler/state` is not used.

The Run demo workflow uses the `run-demo` environment. Dispatch `test_only` for
the separate test host and published Turnstile test keys; dispatch `remove` with
`test_only` to delete it. Production uses the environment's real Turnstile keys.
The workflow does not enable automatic deployment.

The copied Base demo runtime lives in `src/modules/demo`, with its exact Base helper dependencies, and is pinned to `rer-v0.2.15`. It blocks outbound fetch and sockets
and supplies the slim Demo strip. Hosted containers also deny network egress.
Mail uses the captured outbox. AI and connectors have no provider credentials.
The demo enables Slate’s existing flagship profile for live collaboration;
connector and AI requests are refused in demo mode.
Published pages remain behind the hosted visitor cookie, as does the entire app.
Each visitor has separate storage and collaboration rooms. The host controls
expiry and destroys the visitor's container.

Hosted sign-in verifies Base's signed owner claim and uses Slate's native
empty-workspace claim and session store. It cannot claim an existing workspace;
no second account or owner store is introduced. The endpoint is absent unless
trusted owner-claim issuer, installation and public keys are configured.
