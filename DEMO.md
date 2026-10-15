# Try Slate

`pnpm exec rer demo` creates a disposable Slate workspace and signs in its
owner. Stop it with `pnpm exec rer demo --stop`. Each start gets the team
handbook, linked pages, a project tracker, comments and members, through Slate's
normal domain operations. The checkout's normal state is never written.

The demo runtime and all other vendored Base modules are copied together from
`rer-v0.2.22`; the CLI is pinned to `@runeditrun/rer` 0.2.22 in package mode.
The marked navigation name reads **Slate Demo**, and document titles carry the
Demo suffix. There is no demo bar or captured-mail outbox.

Public reads run for real. External writes return success without sending;
Base Mail silently suppresses demo invitations and sign-in mail. Model calls
use `demoEffect` with a grounded, provider-shaped response. Production keeps
the real providers. Every visitor gets separate data and collaboration rooms.
The host controls expiry and destroys the visitor's container.

The Run demo workflow uses the `run-demo` environment. Dispatch `test_only` for
the separate test host with published Turnstile test keys. Dispatch `remove`
with `test_only` to delete it and read back its removal. Production uses the
environment's real Turnstile keys. Automatic deployment is not enabled here.

Hosted sign-in verifies Base's signed owner claim and uses Slate's native
empty-workspace claim and session store. It cannot claim an existing workspace;
no second account or owner store is introduced. The endpoint is absent unless
trusted owner-claim issuer, installation and public keys are configured.
