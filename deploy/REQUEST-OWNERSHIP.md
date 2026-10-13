# Request ownership

One Cloudflare Worker (`src/server.ts`) answers every request. This table is the
reviewed contract the dispatcher implements; `isHonoRequest` in
`src/core/app/hono.ts` is the explicit predicate, and nothing uses a Hono
catch-all to discover whether Hono matched.

Dispatch order inside `fetch`:

1. `isHonoRequest(pathname)` → the Hono application, with the Worker bindings and
   execution context forwarded unchanged.
2. After the configuration check and the public-document rate limit, Base's
   `setupStateResponse` (`/setup/state`) and `lobbyResponse` (the Lobby at `/`).
3. `operatorDocumentGate` → the native anonymous `/app` and `/setup` document redirects.
4. TanStack Start, including its generated `/_serverFn/` transport.

Static assets are answered by the Cloudflare assets binding before the Worker is
invoked; `not_found_handling` is unset, so a path with no asset falls through to
the Worker instead of returning an application shell.

| Owner | Method | Path or prefix | Host | Auth | Origin/CORS | Response | Handler |
|---|---|---|---|---|---|---|---|
| Hono | GET | `/health` | any | none (declared public) | none | JSON `{status, checks}`; `503` when a dependency or the runtime configuration fails | `createApi` → `probeDependencies` |
| Hono | GET | `/api/auth/capabilities` | any | none (declared public) | none | JSON capability record | `createSessionRoutes` |
| Hono | GET/POST | `/auth/confirm` | configured deployment | token on POST | exact same-origin required for POST | Shared server-rendered confirmation; GET previews without a session; POST consumes a new native link and returns `303` plus cookie | `confirmationRoutes` |
| Hono | GET | `/api/auth/magic/accept` | configured deployment | none | none | `400` request-new-link page; previously issued links cannot create sessions | `createSessionRoutes` |
| Hono | POST | `/api/auth/magic` | configured deployment | none | native origin guard | Native email request; delivery acceptance only | `createSessionRoutes` |
| Hono | POST | `/api/auth/logout` | any | session cookie if present | same-origin required | `204` + cleared cookie | `createSessionRoutes` |
| Hono | any | `/api`, `/api/*` (every other member) | any | **session required before route matching** | same-origin required for mutations | `401` JSON anonymous; Hono `404` JSON once a valid session and normal preflight pass | `createApi` guard, then `mountFeatures` |
| Hono | GET | `/p`, `/p/*` | any | none (declared public) | none | `404` JSON today; published pages land here when the `WEB` family ships | `createPublishedPageRoutes` |
| Worker | GET/HEAD | `/setup/state` | configured deployment origin and Host | none (declared public) | n/a | JSON `{"state":"claimed"\|"unclaimed"}` from `workspaces.first_run_completed_at`, `no-store`; `405` for other methods, `404` for another origin or Host | `setupStateResponse` (`src/base/runtime/setup-state.ts`, claim read in `src/identity.ts`) |
| Worker | GET/HEAD | `/` | configured deployment origin and Host | none (declared public) | n/a | `HOME-001` Lobby: Slate's mark and name, one line, Finish setup (`/setup`) or Sign in (`/signin`) from the same claim read; no script, no cookie, `no-store`, hashed-style CSP. The landing page is the run site's homepage (`src/site/pages.tsx`, `rer build --site`) | `lobbyResponse` (`src/base/runtime/lobby.ts`, identity in `src/identity.ts`) |
| Start | GET | `/docs`, `/docs/*` | any | none (declared public) | n/a | SSR `DOCS-001` public documentation: the Markdown listed in `docs/site.json`, rendered at build time into one lazy chunk per page, in the landing's paper, ink and type; `404` through Start's root `notFoundComponent` for an unknown or miscased slug | `src/routes/docs.index.tsx`, `src/routes/docs.$slug.tsx` → `src/core/features/docs` |
| Start | GET | `/signin` | any | none (declared public) | n/a | SSR sign-in document | `src/routes/signin.tsx` |
| Start | GET | `/app`, `/app/*` | any | session required | n/a | `302` to `/signin?next=<safe path>` when anonymous; SSR operator shell otherwise | `operatorDocumentGate` + `src/routes/app.tsx` |
| Start | GET | `/setup` | any | session required | n/a | Native owner first-run wizard; unfinished owners reach it from app routes; completed setup and later members redirect to `/app` | `operatorDocumentGate` + `src/routes/setup.tsx` |
| Start | GET/POST | `/_serverFn/*` | any | each private handler revalidates the session itself | Start's same-origin CSRF middleware | Start transport protocol | generated |
| Assets | GET | emitted client JS/CSS under `/assets/` and the other build outputs, and the four favicon files copied from `public/` (`/favicon.svg`, `/favicon-32.png`, `/favicon.ico`, `/apple-touch-icon.png`: Slate's card mark) and the seed theme (`/rer-theme.css`, `/slate-mark.svg`, `/brand/band.svg`), all declared in `seed.json` `deploy.publicPaths` | any | none | n/a | the built file with its type | Cloudflare assets binding |
| Worker events | — | — | — | — | — | — | none today: this seed declares no queue consumer, `scheduled`, `email`, Durable Object or Workflow export. `src/server.ts` exports `fetch` only. A feature lane that adds one adds it there. |
| 404 | any | anything else | any | its namespace's guards first | — | Start's root `notFoundComponent` for documents, Hono JSON `404` under `/api/` and `/p/` | — |

## Prerendering

Prerendering is configured and **disabled**: `enabled: false`,
`autoStaticPathsDiscovery: false`, `crawlLinks: false`, and no `pages` entry.

This seed has no deployment-invariant page that may be prerendered. `/docs` and
`/docs/*` are the closest candidates, since their content is a build artifact,
but they are rendered per request like the landing: they share its header and
footer, which read the owner identity from `src/ext/config.ts`, so a prerendered
copy would freeze one owner's name into the artifact. `/` renders the buyer's owner
identity from `src/ext/config.ts` inside a static landing page (it reads no
workspace value; its font is a same-origin asset and its illustrations are inline
SVG and HTML) and, once the `HOME` family grows, workspace values that live in D1; `/signin` reports the deployment's configured sign-in
capabilities; `/app` is a session surface. Cloudflare prerendering runs at build
time against build-time variables and binding data, so prerendering any of them
would freeze one deployment's configuration into the artifact. Discovery and
link crawling are off so that a link from `/` cannot pull `/signin` or `/app`
into the build output. The build therefore emits no prerendered HTML, which is
what `tests/e2e/production-artifact.test.mjs` asserts. The docs Markdown is rendered
by the Vite plugin in `src/core/features/docs/build` when Vite loads it, never in
the Worker or the browser; `/docs` is not claimed by Hono or by the operator
document gate, and the public-document rate limit covers `/docs` and `/docs/*`.

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
misconfigured deployment answers `/`, `/signin`, `/docs`, `/app` and `/_serverFn/*` with
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
