import { env } from "cloudflare:test";
import { createApi } from "../../../../src/core/app/hono";
import type { FeatureContext } from "../../../../src/core/app/feature-context";
import {
  seedContainer,
  seedMember,
  seedWorkspace,
  sessionFor,
} from "../../../e2e/setup/fixtures";
import { vi } from "vitest";

const origin = "http://localhost:8787";

export interface SuggestionsFixture {
  api: ReturnType<typeof createApi>;
  workspaceId: string;
  containerId: string;
  ownerId: string;
  readerId: string;
  editorId: string;
  ownerCookie: string;
  readerCookie: string;
  editorCookie: string;
  providerCalls: () => number;
}

let providerCallCount = 0;
const retainedFiles = new Set<string>();

async function resetD1(): Promise<void> {
  const tables = (
    await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT IN ('d1_migrations','core_acl_epoch')",
    ).all<{ name: string }>()
  ).results;
  await env.DB.batch([
    env.DB.prepare("PRAGMA defer_foreign_keys=ON"),
    ...tables.map((table) =>
      env.DB.prepare(`DELETE FROM "${table.name.replaceAll('"', '""')}"`),
    ),
  ]);
}

export async function clearProductDatabase(): Promise<void> {
  await resetD1();
}

export async function beginSuggestionsTest(): Promise<void> {
  providerCallCount = 0;
  retainedFiles.clear();
  await resetD1();
  vi.stubGlobal("fetch", async (input: string | URL | Request) => {
    providerCallCount++;
    const url = input instanceof Request ? input.url : String(input);
    throw new Error(`Unexpected provider or network request: ${url}`);
  });
}

export async function endSuggestionsTest(): Promise<void> {
  vi.unstubAllGlobals();
  for (const key of retainedFiles) await env.FILES.delete(key);
  retainedFiles.clear();
  await resetD1();
}

export function retainFile(key: string): void {
  retainedFiles.add(key);
}

export async function suggestionsFixture(): Promise<SuggestionsFixture> {
  const { workspaceId } = await seedWorkspace({ name: "release suggestions" });
  const { memberId: ownerId } = await seedMember(workspaceId, {
    email: "owner@slate.test",
    displayName: "Workspace Owner",
    role: "owner",
    isSetupOwner: true,
  });
  const { memberId: readerId } = await seedMember(workspaceId, {
    email: "commenter@release.test.invalid",
    displayName: "Commenter",
    role: "member",
  });
  const { memberId: editorId } = await seedMember(workspaceId, {
    email: "editor@release.test.invalid",
    displayName: "Editor",
    role: "member",
  });
  const { containerId } = await seedContainer(workspaceId, {
    ownerMemberId: ownerId,
    visibility: "open",
  });
  const fixture: SuggestionsFixture = {
    api: createApi(),
    workspaceId,
    containerId,
    ownerId,
    readerId,
    editorId,
    ownerCookie: await sessionFor(ownerId),
    readerCookie: await sessionFor(readerId),
    editorCookie: await sessionFor(editorId),
    providerCalls: () => providerCallCount,
  };
  const ownerAccess = await request(fixture, "POST", "/api/sharing", fixture.ownerCookie, {
    operationKey: operationKey("container-owner-access"),
    targetKind: "container",
    targetId: containerId,
    principalKind: "member",
    principalId: ownerId,
    level: "full",
  });
  if (!ownerAccess.response.ok) {
    throw new Error(`Owner access setup failed (${ownerAccess.response.status}): ${JSON.stringify(ownerAccess.data)}`);
  }
  return fixture;
}

export function featureContext(
  fixture: SuggestionsFixture,
  member: "owner" | "reader" | "editor" = "owner",
): FeatureContext {
  const actors = {
    owner: {
      id: fixture.ownerId,
      email: "owner@slate.test",
      displayName: "Workspace Owner",
      initials: "WO",
      role: "owner",
    },
    reader: {
      id: fixture.readerId,
      email: "commenter@release.test.invalid",
      displayName: "Commenter",
      initials: "CO",
      role: "member",
    },
    editor: {
      id: fixture.editorId,
      email: "editor@release.test.invalid",
      displayName: "Editor",
      initials: "ED",
      role: "member",
    },
  } as const;
  return {
    db: env.DB,
    files: env.FILES,
    jobs: env.JOBS,
    now: new Date().toISOString(),
    actor: {
      ...actors[member],
      workspaceId: fixture.workspaceId,
      workspaceName: "release suggestions",
    },
  } as FeatureContext;
}

export async function request(
  fixture: SuggestionsFixture,
  method: string,
  path: string,
  cookie?: string,
  body?: unknown,
): Promise<{ response: Response; data: any; bytes: Uint8Array }> {
  const headers = new Headers();
  if (cookie) headers.set("Cookie", cookie);
  if (body !== undefined) {
    headers.set("Content-Type", "application/json");
    headers.set("Origin", origin);
  }
  const response = await fixture.api.request(
    new URL(path, origin).toString(),
    {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
    env,
  );
  const bytes = new Uint8Array(await response.arrayBuffer());
  const text = new TextDecoder().decode(bytes);
  let data: any = text;
  if (response.headers.get("content-type")?.includes("application/json")) {
    data = JSON.parse(text);
  }
  return { response, data, bytes };
}

export function operationKey(label: string): string {
  return `release-sug-${label}-${crypto.randomUUID()}`;
}

export async function snapshotSuggestionMutation(
  fixture: SuggestionsFixture,
  pageId: string,
): Promise<Record<string, unknown>> {
  const queries = [
    [
      "pages",
      "SELECT * FROM pages WHERE id=?",
    ],
    [
      "blocks",
      "SELECT * FROM page_blocks WHERE page_id=? ORDER BY tree_position,id",
    ],
    [
      "revisions",
      "SELECT * FROM page_revisions WHERE page_id=? ORDER BY id",
    ],
    [
      "suggestions",
      "SELECT * FROM content_suggestions WHERE page_id=? ORDER BY id",
    ],
    [
      "contentEvents",
      "SELECT * FROM content_events WHERE page_id=? ORDER BY sequence",
    ],
    [
      "activity",
      "SELECT * FROM activity_entries WHERE workspace_id=? ORDER BY id",
    ],
    [
      "receipts",
      "SELECT * FROM operation_receipts WHERE workspace_id=? ORDER BY id",
    ],
  ] as const;
  const rows = await Promise.all(
    queries.map(async ([name, sql]) => {
      const key = name === "activity" || name === "receipts"
        ? fixture.workspaceId
        : pageId;
      const result = await env.DB.prepare(sql).bind(key).all();
      return [name, result.results] as const;
    }),
  );
  return Object.fromEntries(rows);
}

export function snapshotCounts(snapshot: Record<string, unknown>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(snapshot).map(([name, rows]) => [name, (rows as unknown[]).length]),
  );
}

export async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function createPublishedPage(
  fixture: SuggestionsFixture,
  title: string,
  originalText: string,
): Promise<{ pageId: string; revisionId: string; blockId: string; slug: string }> {
  const blockId = `block-${crypto.randomUUID()}`;
  const created = await request(fixture, "POST", "/api/pages", fixture.ownerCookie, {
    operationKey: operationKey("page"),
    containerId: fixture.containerId,
    title,
    blocks: [
      {
        id: blockId,
        blockType: "paragraph",
        parentBlockId: null,
        treePosition: "0001",
        content: { text: [{ text: originalText }] },
      },
    ],
  });
  if (!created.response.ok) {
    throw new Error(`Page creation failed (${created.response.status}): ${JSON.stringify(created.data)}`);
  }

  const pageId = created.data.value.pageId as string;
  const revisionId = created.data.receipt.revisionId as string;
  const slug = `release-suggestions-${crypto.randomUUID()}`;
  const published = await request(
    fixture,
    "POST",
    `/api/publishing/${pageId}`,
    fixture.ownerCookie,
    {
      operationKey: operationKey("publish"),
      expectedRevisionId: revisionId,
      host: "localhost:8787",
      slug,
      indexable: false,
    },
  );
  if (!published.response.ok) {
    throw new Error(`Publication failed (${published.response.status}): ${JSON.stringify(published.data)}`);
  }
  return { pageId, revisionId, blockId, slug };
}

export async function grantCommentAccess(
  fixture: SuggestionsFixture,
  pageId: string,
  memberId = fixture.readerId,
  level: "comment" | "edit" = "comment",
): Promise<string> {
  const grant = await request(fixture, "POST", "/api/sharing", fixture.ownerCookie, {
    operationKey: operationKey("grant"),
    targetKind: "page",
    targetId: pageId,
    principalKind: "member",
    principalId: memberId,
    level,
  });
  if (!grant.response.ok) {
    throw new Error(`Grant creation failed (${grant.response.status}): ${JSON.stringify(grant.data)}`);
  }
  return grant.data.value.id as string;
}
