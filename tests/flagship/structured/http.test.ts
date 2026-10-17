import { env } from "cloudflare:test";
import { beforeEach, test, expect } from "vitest";
import { resetDeployment } from "../../e2e/setup/reset-deployment";
import {
  seedWorkspace,
  seedMember,
  seedContainer,
  seedContainerGrant,
} from "../../e2e/setup/fixtures";
import type { FeatureContext } from "../../../src/core/app/feature-context";

// Keep SELF module loading isolated from direct-service request contexts.
beforeEach(resetDeployment);

async function scenario() {
  const { workspaceId } = await seedWorkspace();
  const { memberId } = await seedMember(workspaceId, {
    role: "owner",
    email: `${workspaceId}@owner.invalid`,
    displayName: "Owner",
  });
  const { memberId: readerId } = await seedMember(workspaceId, {
    role: "member",
    email: `${workspaceId}@reader.invalid`,
    displayName: "Reader",
  });
  const { containerId } = await seedContainer(workspaceId, {
    ownerMemberId: memberId,
    visibility: "default",
  });
  await seedContainerGrant(containerId, {
    principalKind: "member",
    principalId: memberId,
    level: "full",
  });
  const ctx = {
    db: env.DB,
    files: env.FILES,
    jobs: env.JOBS,
    now: new Date().toISOString(),
    actor: {
      id: memberId,
      workspaceId,
      workspaceName: "Test",
      email: "owner@test.invalid",
      displayName: "Owner",
      initials: "OW",
      role: "owner",
    },
  } as FeatureContext;
  return {
    ctx,
    containerId,
    reader: {
      ...ctx,
      actor: { ...ctx.actor, id: readerId, role: "member" as const },
    },
  };
}

test("Worker HTTP rejects missing expired revoked and denied sessions and persists authorized input", async () => {
  const { SELF } = await import("cloudflare:test");
  const { sessionFor } = await import("../../e2e/setup/fixtures");
  const { ctx, containerId, reader } = await scenario();
  const input = {
    operationKey: "case:031",
    containerId,
    title: "HTTP database",
  };
  const send = (cookie?: string) =>
    SELF.fetch("http://localhost/api/databases", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost",
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify(input),
    });
  expect((await send()).status).toBe(401);
  expect(
    (
      await send(
        await sessionFor(ctx.actor.id, { expiresAt: "2020-01-01T00:00:00Z" }),
      )
    ).status,
  ).toBe(401);
  expect(
    (await send(await sessionFor(ctx.actor.id, { revokedAt: ctx.now }))).status,
  ).toBe(401);
  expect((await send(await sessionFor(reader.actor.id))).status).toBe(404);
  const cookie = await sessionFor(ctx.actor.id),
    response = await send(cookie);
  expect(response.status).toBe(201);
  const body = (await response.json()) as {
    value: {
      id: string;
    };
  };
  const read = await SELF.fetch(
    `http://localhost/api/databases/${body.value.id}`,
    { headers: { cookie } },
  );
  expect(read.status).toBe(200);
  expect(
    (
      (await read.json()) as {
        database: {
          id: string;
        };
      }
    ).database.id,
  ).toBe(body.value.id);
});
