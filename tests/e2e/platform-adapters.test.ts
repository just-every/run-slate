import assert from "node:assert/strict";
import test from "node:test";
import { createR2BlobStore } from "../../src/core/platform/blobs";
import { probeDependencies } from "../../src/core/platform/health";
import { createQueueDispatcher, isQueuedJob } from "../../src/core/platform/jobs";
import { createMailer, MailDeliveryError } from "../../src/core/platform/mail";

test("R2 blob store keeps access-neutral metadata and rejects unsafe keys", async () => {
  let write: { key: string; options: unknown } | null = null;
  const bucket = {
    async put(key: string, _body: unknown, options: unknown) {
      write = { key, options };
      return { key };
    },
    async get() { return null; },
    async head() { return null; },
    async delete() {},
  } as unknown as R2Bucket;
  const store = createR2BlobStore(bucket);

  await store.put({ key: "pages/page-1/image.png", body: "image", contentType: "image/png", contentDisposition: "inline", metadata: { pageId: "page-1" } });
  assert.deepEqual(write, {
    key: "pages/page-1/image.png",
    options: {
      httpMetadata: { contentType: "image/png", contentDisposition: "inline" },
      customMetadata: { pageId: "page-1" },
    },
  });
  await assert.rejects(() => store.head("../escape"), /relative paths/);
});

test("queue dispatcher reports only accepted jobs and validates message envelopes", async () => {
  const sent: unknown[] = [];
  const queue = { async send(message: unknown) { sent.push(message); } } as unknown as Queue<unknown>;
  const dispatcher = createQueueDispatcher(queue, () => new Date("2026-09-08T00:00:00.000Z"));
  const job = await dispatcher.dispatch({ id: "job-1", type: "import.parse", payload: { archiveKey: "incoming/1.zip" } });

  assert.deepEqual(job, { id: "job-1", type: "import.parse", payload: { archiveKey: "incoming/1.zip" }, enqueuedAt: "2026-09-08T00:00:00.000Z" });
  assert.equal(isQueuedJob(sent[0]), true);
  await assert.rejects(() => dispatcher.dispatch({ type: "Import Parse", payload: {} }), /Job types/);
});

test("dependency health probes observable dependencies and propagates an unreachable dependency", async () => {
  // Original variant: dependency health reports only dependencies a request can observe
  await (async () => {
  let databaseProbed = false;
  let filesProbed = false;
  const health = await probeDependencies({
    database: { prepare: () => ({ first: async () => { databaseProbed = true; return { ready: 1 }; } }) } as unknown as D1Database,
    files: { head: async () => { filesProbed = true; return null; } } as unknown as R2Bucket,
  });
  assert.equal(databaseProbed, true);
  assert.equal(filesProbed, true);
  assert.deepEqual(health, {
    database: { status: "reachable" },
    files: { status: "reachable" },
  });

  })();
  // Original variant: dependency health surfaces an unreachable dependency instead of reporting it
  await (async () => {
  await assert.rejects(() => probeDependencies({
    database: { prepare: () => ({ first: async () => ({ ready: 1 }) }) } as unknown as D1Database,
    files: { head: async () => { throw new Error("bucket unavailable"); } } as unknown as R2Bucket,
  }), /bucket unavailable/);

  })();
});



test("Resend adapter sends a real provider-shaped request and surfaces provider failures", async () => {
  const requests: Request[] = [];
  const mailer = createMailer({
    provider: "resend",
    from: "Slate <mail@example.com>",
    apiKey: "provider-token",
    fetch: async (input, init) => {
      requests.push(new Request(input, init));
      return Response.json({ id: "email-1" });
    },
  });

  assert.deepEqual(await mailer.send({ to: "member@example.com", subject: "Sign in", text: "Open this link" }), { id: "email-1" });
  const [request] = requests;
  assert.ok(request);
  assert.equal(request.url, "https://api.resend.com/emails");
  assert.equal(request.headers.get("authorization"), "Bearer provider-token");
  assert.deepEqual(await request.json(), { from: "Slate <mail@example.com>", to: ["member@example.com"], subject: "Sign in", text: "Open this link", headers: {} });

  const failing = createMailer({ provider: "resend", from: "Slate <mail@example.com>", apiKey: "provider-token", fetch: async () => new Response("sender is not verified", { status: 403 }) });
  await assert.rejects(() => failing.send({ to: "member@example.com", subject: "Sign in", text: "Open this link" }), (cause: unknown) => cause instanceof MailDeliveryError && cause.status === 403 && cause.message.includes("sender is not verified"));
});
