/** Browser-only transport. A rejected mutation is never represented as saved. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Only browser transport failures, never parsing or application failures. */
export class TransportError extends Error {
  constructor(readonly cause: unknown) {
    super("The server could not be reached. Current server state is unconfirmed.");
    this.name = "TransportError";
  }
}
function transportFailure(cause: unknown, signal?: AbortSignal | null): never {
  if (signal?.aborted || (cause instanceof DOMException && cause.name === "AbortError")) throw cause;
  if (cause instanceof TypeError) throw new TransportError(cause);
  throw cause;
}

export async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  if (!path.startsWith("/api/"))
    throw new Error("Workspace requests must use a same-origin API path.");
  const options: RequestInit = {
    ...init,
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      ...(init.body instanceof FormData
        ? {}
        : init.body
          ? { "Content-Type": "application/json" }
          : {}),
      ...init.headers,
    },
  };
  let response: Response;
  try { response = await fetch(path, options); }
  catch (cause) { transportFailure(cause, init.signal); }
  if (typeof window !== 'undefined' && (response.status === 401 || (path === '/api/auth/logout' && response.ok))) window.dispatchEvent(new Event('slate:session-ended'));
  let text: string;
  try { text = await response.text(); }
  catch (cause) {
    // A received HTTP result remains authoritative even if its body is interrupted.
    if (!response.ok) throw new ApiError(response.status, "request_failed", `Request failed (${response.status}).`);
    transportFailure(cause, init.signal);
  }
  if (init.signal?.aborted) throw new DOMException("Request cancelled", "AbortError");
  let value: unknown;
  try {
    value = text ? JSON.parse(text) : undefined;
  } catch {
    throw new ApiError(
      response.status,
      "invalid_response",
      "The server returned an unreadable response. Your changes have not been confirmed.",
    );
  }
  if (!response.ok) {
    const error = value as
      { code?: string; message?: string; details?: unknown } | undefined;
    throw new ApiError(
      response.status,
      error?.code ?? "request_failed",
      error?.message ?? `Request failed (${response.status}).`,
      error?.details,
    );
  }
  return value as T;
}

export function operationKey(): string {
  return crypto.randomUUID();
}

export function mutate<T>(
  path: string,
  body: unknown,
  method = "POST",
  signal?: AbortSignal,
): Promise<T> {
  return request<T>(path, { method, body: JSON.stringify(body), signal });
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401)
      return "Your session has ended. Sign in again to continue. Unsaved changes remain here.";
    if (error.code === "STEP_UP_REQUIRED" || error.code === "GROUP_MENTION_LIMIT") return error.message;
    if (error.status === 403 || error.status === 404)
      return "This content is unavailable with your current access.";
    return error.message;
  }
  return error instanceof Error
    ? error.message
    : "The request could not be completed.";
}
