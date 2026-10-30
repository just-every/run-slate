# Shared server and serializable contracts

Client-only DTOs: `src/core/shared/api/{common,workspace,content,work,intelligence}.ts`. No runtime bindings or secrets occur there.

Server context: `src/core/app/feature-context.ts` exports `FeatureContext {db:D1Database,files:R2Bucket,jobs:Queue<unknown>,actor:AuthenticatedMember,now:string}` and `featureContext(HonoContext)`.

`src/core/app/problems.ts`: `new ApiProblem(status, code, message, details?)`; compatible JSON `{code,message,details?}`.

`src/core/features/sharing/current-access.ts`: `currentSubject(ctx)`, `resolveCurrentAccess(ctx,pageId):Promise<{subject,context,decision}>`, `requirePageLevel(ctx,pageId,'view'|'comment'|'edit'|'full')`, `requireContainerLevel(ctx,containerId,level)`, `requireWorkspaceOwner(ctx)`. Denied page/container checks return a content-free 404. Every query resolves active member, group membership and current grants; do not authorize from cached index rows.

`src/core/app/operations.ts`: `commitOperation<T>(ctx,{operationKey,action,request,authorize:async()=>void,prepare:async({revisionId,activityId})=>({statements:D1PreparedStatement[],entity:{id,kind,revisionId},value:T,detail?})}):Promise<{value:T,receipt:MutationReceipt}>`. Current authorization runs before replay. Receipt key binds actor, action and canonical body for 24 hours. Receipt, domain statements and activity commit in one D1 batch. Domain prepare must add immutable revisions and CAS assertions. `mutationGuard(db, 'SELECT boolean-expression ...', bindValues)` creates an assertion statement: false aborts the entire batch. Put it before affected writes. Use a current revision SELECT inside this assertion, not an UPDATE that can silently affect zero rows. Duplicate-operation races replay the committed result.

Policy types and validation remain `src/core/shared/knowledge/policies.ts` (`KnowledgePolicyProfile`, `resolveKnowledgePolicyProfile`). Stored workspace policy service follows separately.

Routes export `create<Feature>Routes():Hono<AppEnvironment>` with relative paths; send mounts to core integration owner. No new private server functions may skip session authentication.

## Core HTTP endpoints (mounted)

- `GET /api/workspace` → `WorkspaceView`. `PUT /api/workspace` accepts operationKey, expectedRevisionId and every WorkspaceView editable field (name, mark, description, guestAccess, publicLinkAccess, anonymousAccess, policies). Owner only.
- `POST /api/workspace/first-run` accepts operationKey, workspaceName, containerName, pageTitle; returns operation result `{value:{workspaceId,containerId,pageId,invitationStep:true},receipt}`. Exactly one initial container/page. Setup owner signs in through configured magic mail first. No later member can run the wizard again.
- `GET /api/members/current` → `MemberView`; `PUT /api/members/current/theme` accepts operationKey and theme. `GET /api/members` / `/api/guests` → `{items:MemberView[]}` (guests denied).
- `POST /api/members/remove` accepts operationKey, memberId, optional erase. Owner removal restrictions enforced; ordinary members cannot remove anyone. The setup owner may remove themselves; an operator may request their own personal-data erasure. Last-owner protection applies in every case.
- `GET /api/groups` → `{items:GroupView[]}`. `POST /api/groups` accepts operationKey, optional id/expectedRevisionId, name, memberIds, optional remove.
- `POST /api/invitations` accepts operationKey,email,kind (`member`/`guest`), guest pageId or containerId. Always returns `{value:{accepted:true},receipt}` regardless existing membership. Missing configured mail returns explicit unavailable. `POST /api/invitations/revoke` accepts operationKey,id.
- `GET /api/sharing/pages/:id` and `/api/sharing/containers/:id` → `{items: grants}` requires full access. `POST /api/sharing` accepts operationKey,targetKind,targetId,optional id,principalKind,principalId,level,optional expiresAt/revoke.
- `POST /api/auth/magic` accepts email and returns `{accepted:true}` for eligible/unknown addresses after durable admission. Supply requestKey to resume the same send and use POST /api/auth/magic/status with email/requestKey for actual queued/sent/failed status and explicit recovery; accepted never means sent. `/api/auth/magic/accept?token=…` and `/api/auth/invitation/accept?token=…` consume their single-use tokens and redirect with HttpOnly native session.
- `GET /api/auth/identity` starts configured OIDC code+PKCE; `/api/auth/identity/callback` validates browser-bound state, issuer, audience, nonce, time, verified email, RS256 signature and existing active membership.

Mutations return `{value,receipt}` unless a domain API documents another wrapper. Core current-access captures an authorization epoch; operation batches assert that no ACL-relevant row changed after authorization. Race failures are conflicts, never silently authorized writes.

## Integrated runtime and follow-up contracts

`FeatureContext.sourceSecret?` is server-only connector custody configuration. `MutationPlan.noChange:true` retains a receipt and executes supplied CAS guards but creates no activity: its `MutationReceipt` has `unchanged:true,activityId:null` and the existing entity revision. No synthetic activity ID is invented for unchanged content.

`resolveCurrentAccessMany(ctx,pageIds,{includeTrashed?,includeDeleted?})` returns a `Map<string,CurrentAccess>` using one reader/principal resolution and bulk ancestor/grant queries. Filter `decision.allowed`; inaccessible personal/deleted/trashed/missing IDs may be omitted. `includeDeleted` is exclusively for content-free activity history, never body retrieval. `resolveCurrentAccess` and `requirePageLevel` accept `{includeTrashed?,locationOverrides?:Record<pageId,{containerId,parentPageId}>}` for trash operations and complete hypothetical move preflight. No option bypasses the subject, guest, draft, personal-container or current-grant rules.

All published feature routers are mounted: pages, containers, revisions, comments, status, archive, media, publishing and `/p`; databases, templates, automation; search, navigation, notifications, activity, analytics; imports, exports, connectors, sources; ai, decisions, skills, runs, effects, inquiries, experiments, impact and agent. `/api/agent/credentials` retains its native owner session and step-up requirements. MCP is served by the shared company-policy door at `/mcp` (also `/api/agent/mcp`); its current registry and limits are documented in [Company agents](agent-door.md). The former standalone tool dispatcher is retired. A native external-agent bearer does not authorize another API namespace.

Native queue and one-minute scheduled exports call the actual domain consumers. Unknown/failed jobs retain a visible owner failure record; they are not acknowledged as success. `ContentCollaboration` is the named Durable Object export with `CONTENT_COLLABORATION` binding and SQLite-class migration in both local and deployment templates.

Additional core routes: `PUT /api/members/:id/role` with operationKey,expectedRole,role; `POST /api/sharing/container-settings` with operationKey,id,expectedRevisionId,guestAccess,publicLinkAccess,anonymousAccess,visibility. Owner-only `/api/workspace/jobs` and `/api/workspace/mail` expose sanitized durable failures. The first-run response creates exactly its three domain records; personal containers are created after that wizard or on invitation acceptance, without exposing archived personal content to anyone else.

## Durable identity delivery and first run

`GET /api/workspace/first-run` returns `{required,canComplete}` from current membership and the durable completion marker. `POST` commits that marker with the three initial domain records. Existing populated workspaces are marked completed by0008; later members never receive the wizard.

`GET /api/workspace/mail` returns sanitized status for owners (all) or ordinary inviters (their own). Items include id,kind,state,attemptCount,errorDetail,nextAttemptAt,sentAt,createdAt,invitationId,targetEmail,canRetry,canRevoke. `POST /api/workspace/mail/:id/retry` resumes the same encrypted message with current authority and a bounded retry cycle. Invitation responses remain stable regardless of existing membership; delivery state is read separately. See [mail custody and recovery](MAIL-DELIVERY.md) for failure/receipt semantics, exclusions, current-grant checks and provider acceptance limits.
