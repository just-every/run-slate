import assert from "node:assert/strict";
import test from "node:test";
import {
  assertAuthorizedReceiptReplay,
  assertDraftGrant,
  assertNoGrantWidening,
  canInviteGuest,
  canPublishPublicPage,
  canReadAnonymousPage,
  canUseSessionBoundGrantLink,
  evaluatePageAccess,
  GrantInvariantError,
  OperationReplayError,
} from "../../src/core/features/sharing/access.ts";
import {
  defaultKnowledgePolicyProfile,
  extractRevisionText,
  resolveKnowledgePolicyProfile,
  revisionContentHash,
} from "../../src/core/shared/knowledge/index.ts";

const now = "2026-09-08T00:00:00.000Z";
const member = { memberId: "member-a", workspaceId: "workspace-a", status: "active", groupIds: ["group-a"], containerIds: ["container-a"], isGuest: false };
const otherMember = { memberId: "member-b", workspaceId: "workspace-a", status: "active", groupIds: [], containerIds: [], isGuest: false };
const guest = { memberId: "guest-a", workspaceId: "workspace-a", status: "active", groupIds: [], containerIds: ["container-a"], isGuest: true };
const historicalMember = { ...otherMember, status: "historical" };

function grant(id, principalKind, principalId, level = "view") {
  return { id, principalKind, principalId, level, expiresAt: null, revokedAt: null };
}

function context(overrides = {}) {
  return {
    page: {
      id: "page-a",
      workspaceId: "workspace-a",
      containerId: "container-a",
      lifecycle: "live",
      authorMemberId: "member-a",
      restricted: false,
      grants: [],
    },
    container: {
      id: "container-a",
      workspaceId: "workspace-a",
      grants: [],
      externalAccess: { guests: "allowed", publicLinks: "allowed", anonymous: "allowed" },
    },
    inheritedGrants: [],
    ...overrides,
  };
}

test("the eight policies default to Notion and accept every alternative without a model migration", () => {
  assert.deepEqual(defaultKnowledgePolicyProfile, {
    "page.lifecycle.v1": "always-live",
    "page.access.v1": "workspace-general",
    "page.public-access.v1": "site",
    "page.version.v1": "autosnapshot",
    "page.status.v1": "verification-only",
    "record.page-parity.v1": "record-is-page",
    "automation.scope.v1": "source",
    "container.access.v1": "class-led",
  });
  assert.deepEqual(resolveKnowledgePolicyProfile({
    "page.lifecycle.v1": "draft-then-publish",
    "page.access.v1": "container-general",
    "page.public-access.v1": "link",
    "page.version.v1": "labelled",
    "page.status.v1": "open-vocabulary",
    "record.page-parity.v1": "record-is-row",
    "automation.scope.v1": "site",
    "container.access.v1": "grant-led",
  }), {
    "page.lifecycle.v1": "draft-then-publish",
    "page.access.v1": "container-general",
    "page.public-access.v1": "link",
    "page.version.v1": "labelled",
    "page.status.v1": "open-vocabulary",
    "record.page-parity.v1": "record-is-row",
    "automation.scope.v1": "site",
    "container.access.v1": "grant-led",
  });
});

test("current authority controls page grants, external access and operation replay", async () => {
  // Each row retains its original fixture and every assertion.
  const cases = [
    { name: "draft and scheduled pages admit only the author or an active own-grant principal", run: () => {
  for (const lifecycle of ["draft", "scheduled"]) {
    const privatePage = context({ page: { ...context().page, lifecycle } });
    assert.equal(evaluatePageAccess(member, privatePage, now).level, "full");
    assert.equal(evaluatePageAccess(otherMember, privatePage, now).allowed, false);
    assert.equal(evaluatePageAccess(historicalMember, privatePage, now).allowed, false);

    const directlyShared = context({ page: { ...privatePage.page, grants: [grant("grant-a", "member", "member-b")] } });
    assert.equal(evaluatePageAccess(otherMember, directlyShared, now).level, "view");
    assert.equal(evaluatePageAccess({ ...otherMember, groupIds: ["group-a"] }, {
      ...directlyShared,
      page: { ...directlyShared.page, grants: [grant("grant-b", "group", "group-a", "comment")] },
    }, now).level, "comment");
  }
  assert.throws(() => assertDraftGrant(grant("bad", "workspace", "workspace-a")), GrantInvariantError);
  assert.equal(canUseSessionBoundGrantLink(otherMember, { acceptedMemberId: "member-b", expiresAt: null, revokedAt: null }, now), true);
  assert.equal(canUseSessionBoundGrantLink(otherMember, { acceptedMemberId: "member-b", expiresAt: null, revokedAt: now }, now), false);
  assert.equal(canUseSessionBoundGrantLink(historicalMember, { acceptedMemberId: "member-b", expiresAt: null, revokedAt: null }, now), false);
} },
    { name: "a policy switch cannot add, rewrite, or widen a page's general principal", run: () => {
  const containerGrant = grant("general", "container", "container-a", "view");
  const expiringContainerGrant = { ...containerGrant, expiresAt: "2026-09-09T00:00:00.000Z" };
  const revokedContainerGrant = { ...containerGrant, revokedAt: now };
  assert.doesNotThrow(() => assertNoGrantWidening([containerGrant], [containerGrant]));
  assert.throws(() => assertNoGrantWidening([containerGrant], [grant("general", "workspace", "workspace-a", "view")]), GrantInvariantError);
  assert.throws(() => assertNoGrantWidening([containerGrant], [grant("general", "container", "container-a", "full")]), GrantInvariantError);
  assert.throws(() => assertNoGrantWidening([expiringContainerGrant], [containerGrant]), GrantInvariantError);
  assert.throws(() => assertNoGrantWidening([revokedContainerGrant], [containerGrant]), GrantInvariantError);
  assert.throws(() => assertNoGrantWidening([], [grant("general", "workspace", "workspace-a", "view")]), GrantInvariantError);
} },
    { name: "container-general access requires current membership and guest revocation takes effect immediately", run: () => {
  const containerGeneral = context({ page: { ...context().page, grants: [grant("general", "container", "container-a")] } });
  assert.equal(evaluatePageAccess(otherMember, containerGeneral, now).allowed, false);
  assert.equal(evaluatePageAccess({ ...otherMember, containerIds: ["container-a"] }, containerGeneral, now).level, "view");

  const guestGrant = context({ page: { ...context().page, grants: [grant("guest-grant", "member", "guest-a")] } });
  assert.equal(evaluatePageAccess(guest, guestGrant, now).level, "view");
  assert.equal(evaluatePageAccess(otherMember, context({ page: { ...context().page, grants: [grant("member-grant", "member", "member-b")] } }), now).level, "view");
  const guestsForbidden = context({
    page: guestGrant.page,
    container: { ...guestGrant.container, externalAccess: { guests: "forbidden", publicLinks: "allowed", anonymous: "allowed" } },
  });
  assert.equal(evaluatePageAccess(guest, guestsForbidden, now).allowed, false);
  assert.equal(evaluatePageAccess(otherMember, { ...guestsForbidden, page: { ...guestsForbidden.page, grants: [grant("member-grant", "member", "member-b")] } }, now).level, "view");
} },
    { name: "each container veto controls only its own external act", run: () => {
  const allowed = context();
  assert.equal(canPublishPublicPage(allowed), true);
  assert.equal(canReadAnonymousPage(allowed, true), true);
  assert.equal(canInviteGuest(allowed), true);

  const noPublicLinks = context({ container: { ...allowed.container, externalAccess: { guests: "allowed", publicLinks: "forbidden", anonymous: "allowed" } } });
  assert.equal(canPublishPublicPage(noPublicLinks), false);
  assert.equal(canReadAnonymousPage(noPublicLinks, true), false);
  assert.equal(canInviteGuest(noPublicLinks), true);

  const noAnonymous = context({ container: { ...allowed.container, externalAccess: { guests: "allowed", publicLinks: "allowed", anonymous: "forbidden" } } });
  assert.equal(canPublishPublicPage(noAnonymous), true);
  assert.equal(canReadAnonymousPage(noAnonymous, true), false);
  assert.equal(canInviteGuest(noAnonymous), true);

  const noGuests = context({ container: { ...allowed.container, externalAccess: { guests: "forbidden", publicLinks: "allowed", anonymous: "allowed" } } });
  assert.equal(canPublishPublicPage(noGuests), true);
  assert.equal(canReadAnonymousPage(noGuests, true), true);
  assert.equal(canInviteGuest(noGuests), false);

  assert.equal(canPublishPublicPage(context({ page: { ...allowed.page, lifecycle: "scheduled" } })), false);
  assert.equal(canReadAnonymousPage(context({ page: { ...allowed.page, lifecycle: "draft" } }), true), false);
  assert.equal(canReadAnonymousPage(context({ page: { ...allowed.page, lifecycle: "scheduled" } }), true), false);
} },
    { name: "operation replay requires the original actor, the same body, and current page access", run: () => {
  const receipt = { actorMemberId: "member-a", requestHash: "same-body", expiresAt: "2026-09-09T00:00:00.000Z" };
  const shared = context({ page: { ...context().page, grants: [grant("full", "member", "member-a", "full")] } });
  assert.doesNotThrow(() => assertAuthorizedReceiptReplay({ receipt, requestHash: "same-body", subject: member, context: shared, required: "edit", now }));
  assert.throws(() => assertAuthorizedReceiptReplay({ receipt, requestHash: "other-body", subject: member, context: shared, required: "edit", now }), OperationReplayError);
  assert.throws(() => assertAuthorizedReceiptReplay({ receipt, requestHash: "same-body", subject: otherMember, context: shared, required: "edit", now }));
  assert.throws(() => assertAuthorizedReceiptReplay({ receipt, requestHash: "same-body", subject: member, context: context(), required: "edit", now }));
} }
  ];
  for (const scenario of cases) {
    try {  await scenario.run(); }
    catch (cause) { throw new Error(`Case ${scenario.name} failed`, { cause }); }
  }
});







test("revision text normalizes Unicode and whitespace before SHA-256", async () => {
  assert.equal(extractRevisionText({ properties: { title: "Cafe\u0301" }, body: [{ text: "  one\n two  " }] }), "one two Café");
  assert.equal(
    await revisionContentHash({ properties: { title: "Cafe\u0301" }, body: [{ text: "  one\n two  " }] }),
    await revisionContentHash({ body: [{ text: "one two" }], properties: { title: "Café" } }),
  );
  assert.equal(
    await revisionContentHash({ id: "revision-one", authorMemberId: "member-a", createdAt: "2026-09-08T00:00:00.000Z", lifecycle: "live", body: [{ id: "block-one", createdAt: "2026-09-08T00:00:00.000Z", text: "Hello", children: [{ id: "child-one", updatedAt: "2026-09-08T00:00:00.000Z", text: "Nested" }] }], properties: { title: "Page" } }),
    await revisionContentHash({ id: "revision-two", authorMemberId: "member-b", createdAt: "2026-09-09T00:00:00.000Z", lifecycle: "draft", body: [{ id: "block-two", createdAt: "2026-09-09T00:00:00.000Z", text: "Hello", children: [{ id: "child-two", updatedAt: "2026-09-09T00:00:00.000Z", text: "Nested" }] }], properties: { title: "Page" } }),
  );
  assert.notEqual(
    await revisionContentHash({ body: [{ text: "Hello" }], properties: { title: "Page" } }),
    await revisionContentHash({ body: [{ text: "Changed" }], properties: { title: "Page" } }),
  );
});
