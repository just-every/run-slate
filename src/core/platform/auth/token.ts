function base64Url(bytes: Uint8Array): string {
  let value = "";
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function hex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** A plain content hash. `src/core/features/operations/hash.ts` keys operation receipts with it. */
export async function sha256(value: string): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
}

export function createOpaqueToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

/**
 * The value stored in `sessions.token_digest`. It is an HMAC over the opaque
 * token keyed by SESSION_SECRET, not a bare hash, so a leaked database row
 * cannot be turned back into a usable cookie without the deployment's secret.
 */
export async function sessionDigest(sessionSecret: string, token: string): Promise<string> {
  if (!sessionSecret) throw new Error("A session digest requires SESSION_SECRET.");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(sessionSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(token));
  return hex(new Uint8Array(signature));
}
