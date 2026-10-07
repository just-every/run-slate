export function isLoopbackHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
}

/**
 * The only `next` a sign-in redirect may carry. It keeps a path inside the
 * operator app together with its query, and collapses anything else to `/app`.
 * `/app` itself is a member of the app, so `/app?tab=1` keeps its query exactly
 * as `/app/containers/x?tab=1` does.
 */
export function safeAppPath(candidate: string | null | undefined): string {
  if (!candidate || !/^\/app(?:[/?#]|$)/.test(candidate)) return "/app";

  try {
    const url = new URL(candidate, "https://slate.invalid");
    return /^\/app(?:\/|$)/.test(url.pathname) ? `${url.pathname}${url.search}` : "/app";
  } catch {
    return "/app";
  }
}
