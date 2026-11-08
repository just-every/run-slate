# Native extension and publication boundary inspection

The declared extension vocabulary is in seed.json at extensionPoints (line 1054).
The slots are presentation locations, events are content and identity observations,
and adapters are mail, AI provider, identity provider, chat notification and link
preview seams. None declares a publication or external-switch command.

The active client mount, src/ext/index.client.tsx, exports an empty slateClientSlots.
src/core/app/ext-client.tsx loads the buyer client module after hydration and renders
workspace.navigation.after.v1. It supplies React rendering, not a server capability
or a credential. A client contribution must call the existing authenticated HTTP
doors; publication is authorized in src/core/features/publishing/service.ts through
requirePageLevel(full) and assertCanPublishPublicPage. External switches are
authorized in the workspace and container-setting services. Declared event names
do not install a remotely callable mutation dispatcher; mount-features.ts explicitly
mounts the native feature routers behind the session guard in hono.ts.

src/core/features/automation/adapters.ts delegates archive and notification only.
The native automation action schema admits content creation and movement but no
publication or switch mutation. The extended journey executes movement and page
creation into a vetoing destination and attempts unsupported publication and switch
actions without admitting a rule.

src/core/features/public-api/definitions.ts exposes page, block and task content
operations. The real token probes verify ordinary content access, rejection at
native privileged routes without a session, rejection of unavailable privileged
routes in the public token namespace, unchanged public exposure and grants, and
immediate refusal after token revocation.

This is inspection of the installed extension doors plus runtime checks of their
existing HTTP authority boundary. It does not claim sandbox isolation from an
owner who changes server source, a new installed buyer extension, delegated AI
publication, or company-policy approval. Those are not native capabilities added
by this round.
