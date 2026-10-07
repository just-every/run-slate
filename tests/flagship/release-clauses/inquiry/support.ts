import { env } from "cloudflare:test";
import { vi } from "vitest";
import {
  fixture,
  answer,
  providerResponse,
} from "../../../qualification/inquiry/fixture";
import { createInquiry } from "../../../../src/core/features/inquiries/service";
import type { AppBindings } from "../../../../src/core/app/types";
export { fixture, answer };
export const binding = () =>
  ({ ...env, AI_API_KEY: "test-only" }) as AppBindings;
export async function count(table: string, workspaceId: string) {
  return env.DB.prepare(`SELECT count(*) n FROM ${table} WHERE workspace_id=?`)
    .bind(workspaceId)
    .first<number>("n");
}
// Test transport is intentionally closed: no provider, mail or connector fallback.
export function transport(value: unknown, hook?: () => Promise<void>) {
  let calls = 0;
  vi.stubGlobal("fetch", async (url: unknown, init?: RequestInit) => {
    if (
      String(url) !== "https://api.openai.com/v1/responses" ||
      init?.method !== "POST"
    )
      throw new Error(`Unmatched test transport: ${String(url)}`);
    const body = JSON.parse(String(init.body));
    if (
      !["measured-test-fast", "measured-test-frontier"].includes(body.model) ||
      body.store !== false
    )
      throw new Error("Unmatched model request");
    calls++;
    await hook?.();
    return providerResponse(value);
  });
  return () => calls;
}
export async function inquiry() {
  const f = await fixture();
  const made = await createInquiry(f.context(), {
    operationKey: "bounded-inquiry-create",
    pageId: f.page.pageId,
    question: "Which observation discriminates the handoff?",
    refs: f.refs,
    audience: [f.owner, f.reader],
    hypotheses: [
      {
        statement: "A changed field explains it",
        disconfirmation: "An unchanged field",
      },
      {
        statement: "A changed handoff explains it",
        disconfirmation: "An unchanged handoff",
      },
    ],
  });
  return { ...f, inquiryId: made.value.id };
}
export async function revokeReader(f: Awaited<ReturnType<typeof fixture>>) {
  await env.DB.prepare("DELETE FROM page_grants WHERE id=?")
    .bind(f.readerGrant)
    .run();
}
