# Request ownership

One Cloudflare Worker (`src/server.ts`) answers every request. This table is the
reviewed contract the dispatcher implements; `isHonoRequest` in
`src/core/app/hono.ts` is the explicit predicate, and nothing uses a Hono
catch-all to discover whether Hono matched.

Dispatch order inside `fetch`:

1. `isHonoRequest(pathname)` → the Hono application, with the Worker bindings and
   execution context forwarded unchanged.
2. `operatorDocumentGate` → the native anonymous `/app` document redirect.
3. TanStack Start, including its generated `/_serverFn/` transport.

Static assets are answered by the Cloudflare assets binding before the Worker is
invoked; `not_found_handling` is unset, so a path with no asset falls through to
the Worker instead of returning an application shell.

| Owner | Method | Path or prefix | Host | Auth | Origin/CORS | Response | Handler |
|---|---|---|---|---|---|---|---|
| Hono | GET | `/health` | any | none (declared public) | none | JSON `{status, checks}`; `503` when a dependency or the runtime configuration fails | `createApi` → `probeDependencies` |
| Hono | GET | `/api/auth/capabilities` | any | none (declared public) | none | JSON capability record | `createSessionRoutes` |
| Hono | POST | `/api/auth/local-sign-in` | loopback only in effect | none (declared public) | same-origin required | JSON `{next, member}` + `Set-Cookie`; `404` off loopback; `409` on a foreign local workspace | `createSessionRoutes` |
| Hono | POST | `/api/auth/logout` | any | session cookie if present | same-origin required | `204` + cleared cookie | `createSessionRoutes` |
| Hono | any | `/api`, `/api/*` (every other member) | any | **session required before route matching** | same-origin required for mutations | `401` JSON anonymous; Hono `404` JSON once a valid session and normal preflight pass | `createApi` guard, then `mountFeatures` |
| Hono | GET | `/p`, `/p/*` | any | none (declared public) | none | `404` JSON today; published pages land here when the `WEB` family ships | `createPublishedPageRoutes` |
| Start | GET | `/` | any | none (declared public) | n/a | SSR `HOME-001` owner identity plate | `src/routes/index.tsx` |
| Start | GET | `/signin` | any | none (declared public) | n/a | SSR sign-in document | `src/routes/signin.tsx` |
| Start | GET | `/app`, `/app/*` | any | session required | n/a | `302` to `/signin?next=<safe path>` when anonymous; SSR operator shell otherwise | `operatorDocumentGate` + `src/routes/app.tsx` |
| Start | GET/POST | `/_serverFn/*` | any | each private handler revalidates the session itself | Start's same-origin CSRF middleware | Start transport protocol | generated |
| Assets | GET | emitted client JS/CSS under `/assets/` and the other build outputs | any | none | n/a | the built file with its type | Cloudflare assets binding |
| Worker events | — | — | — | — | — | — | none today: this seed declares no queue consumer, `scheduled`, `email`, Durable Object or Workflow export. `src/server.ts` exports `fetch` only. A feature lane that adds one adds it there. |
| 404 | any | anything else | any | its namespace's guards first | — | Start's root `notFoundComponent` for documents, Hono JSON `404` under `/api/` and `/p/` | — |

## Prerendering

Prerendering is configured and **disabled**: `enabled: false`,
`autoStaticPathsDiscovery: false`, `crawlLinks: false`, and no `pages` entry.

This seed has no deployment-invariant page today. `/` renders the buyer's owner
identity from `src/ext/config.ts` and, once the `HOME` family grows, workspace
values that live in D1; `/signin` reports the deployment's configured sign-in
capabilities; `/app` is a session surface. Cloudflare prerendering runs at build
time against build-time variables and binding data, so prerendering any of them
would freeze one deployment's configuration into the artifact. Discovery and
link crawling are off so that a link from `/` cannot pull `/signin` or `/app`
into the build output. The build therefore emits no prerendered HTML, which is
what `tests/e2e/production-artifact.test.mjs` asserts.

## Known framework behaviour: `/_serverFn/` with an unknown id

A request to `/_serverFn/<id>` where the id is empty, unknown, or not the
current build's, receives `500` with Start's own
`{"status":500,"unhandled":true,"message":"HTTPError"}` body rather than a
`404`. Start's server entry handles that error itself and returns the response,
so the dispatcher never sees a throw; the only way to convert it would be to
inspect response bodies on that namespace, which would also rewrite genuine
handler `500`s and couple the seed to an internal error shape the recipe warns
not to depend on. It is recorded here rather than papered over. The response
carries no product data and performs no mutation, and every valid id continues
through the session and CSRF guards above. Revisit it if Start gives the entry
a not-found signal a dispatcher can read.

## Guard ordering

`BASE-SECRET-002` runs before every non-Hono request. `src/server.ts` resolves
the deployment configuration through `runtimeConfigFor` after the Hono branch
and before the operator document gate, Start, and the generated transport, so a
misconfigured deployment answers `/`, `/signin`, `/app` and `/_serverFn/*` with
the same `503 CONFIGURATION_INVALID` that `/health` returns, instead of
rendering or serialising data behind a failing health check. Hono resolves the
same configuration in its first middleware.

`/api/*` authenticates before route matching. An anonymous request to an unknown
protected `/api/` member keeps the native `401`; the same request with a valid
session and a normal method/Origin preflight reaches the Hono `404`. A protected
member is never made public to obtain a `404`.

The `/app` document gate is not authorization for RPC. Every private server
function revalidates the native session inside its own handler before it reads
or writes private data, because its transport request arrives at `/_serverFn/`
rather than under `/app`.
